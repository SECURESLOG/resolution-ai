import "server-only";
import { opikClient, addEvaluations, EvaluationScore } from "./opik";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Helper to call Claude for evaluation
async function callClaudeForEvaluation(prompt: string): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to call Claude for evaluation");
  }

  const result = await response.json();
  const textContent = result.content.find((c: { type: string }) => c.type === "text");
  return textContent?.text || "";
}

// Parse evaluation response in format: SCORE: X/10 | REASON: ...
function parseEvaluationResponse(response: string): { score: number; reason: string } {
  const scoreMatch = response.match(/SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  return {
    score: scoreMatch ? parseFloat(scoreMatch[1]) / 10 : 0.5,
    reason: reasonMatch ? reasonMatch[1].trim() : response.slice(0, 200),
  };
}

// ============================================
// FEATURE 1: BURNOUT RISK EVALUATOR
// ============================================

export interface ScheduleData {
  userId: string;
  userName: string;
  weekStart: Date;
  tasks: Array<{
    name: string;
    type: string;
    duration: number;
    scheduledDate: Date;
    startTime: Date;
  }>;
  totalHoursScheduled: number;
  resolutionCount: number;
  householdCount: number;
}

export async function evaluateBurnoutRisk(
  scheduleData: ScheduleData
): Promise<{
  sustainabilityScore: number;
  burnoutRisk: "low" | "medium" | "high";
  recommendation: string;
  evaluations: EvaluationScore[];
}> {
  const trace = opikClient.trace({
    name: "evaluation:burnout_risk",
    input: {
      userId: scheduleData.userId,
      totalHoursScheduled: scheduleData.totalHoursScheduled,
      taskCount: scheduleData.tasks.length,
      resolutionCount: scheduleData.resolutionCount,
      householdCount: scheduleData.householdCount,
    },
    metadata: {
      feature: "burnout_evaluator",
      userId: scheduleData.userId,
    },
  });

  const prompt = `You are an expert wellness coach evaluating a user's weekly schedule for burnout risk.

USER: ${scheduleData.userName}
WEEK OF: ${scheduleData.weekStart.toDateString()}

SCHEDULED TASKS THIS WEEK:
${scheduleData.tasks.map(t => `- ${t.name} (${t.type}, ${t.duration}min) on ${new Date(t.scheduledDate).toLocaleDateString()}`).join("\n")}

SUMMARY:
- Total hours scheduled: ${scheduleData.totalHoursScheduled}
- Resolution tasks: ${scheduleData.resolutionCount}
- Household tasks: ${scheduleData.householdCount}
- Total tasks: ${scheduleData.tasks.length}

Evaluate this schedule on three dimensions:

1. SUSTAINABILITY (Is this maintainable long-term?)
2. BALANCE (Good mix of resolution goals and household duties?)
3. RECOVERY TIME (Enough rest between intense activities?)

Respond in this exact format:
SUSTAINABILITY_SCORE: X/10 | REASON: [brief explanation]
BALANCE_SCORE: X/10 | REASON: [brief explanation]
RECOVERY_SCORE: X/10 | REASON: [brief explanation]
OVERALL_BURNOUT_RISK: [low/medium/high]
RECOMMENDATION: [one actionable suggestion]`;

  try {
    const llmSpan = trace.span({
      name: "llm_evaluation",
      type: "llm",
      input: { prompt },
      metadata: { model: "claude-sonnet-4-20250514" },
    });

    const response = await callClaudeForEvaluation(prompt);

    llmSpan.update({ output: { response } });
    llmSpan.end();

    // Parse the response
    const sustainabilityMatch = response.match(/SUSTAINABILITY_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const balanceMatch = response.match(/BALANCE_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const recoveryMatch = response.match(/RECOVERY_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const riskMatch = response.match(/OVERALL_BURNOUT_RISK:\s*(low|medium|high)/i);
    const recommendationMatch = response.match(/RECOMMENDATION:\s*(.+?)(?:\n|$)/i);

    const evaluations: EvaluationScore[] = [
      {
        name: "burnout_sustainability",
        score: sustainabilityMatch ? parseFloat(sustainabilityMatch[1]) / 10 : 0.5,
        reason: sustainabilityMatch ? sustainabilityMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "burnout_balance",
        score: balanceMatch ? parseFloat(balanceMatch[1]) / 10 : 0.5,
        reason: balanceMatch ? balanceMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "burnout_recovery",
        score: recoveryMatch ? parseFloat(recoveryMatch[1]) / 10 : 0.5,
        reason: recoveryMatch ? recoveryMatch[2].trim() : "Could not evaluate",
      },
    ];

    // Add scores to trace
    addEvaluations(trace, evaluations);

    const avgScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
    const burnoutRisk = (riskMatch?.[1]?.toLowerCase() || (avgScore > 0.7 ? "low" : avgScore > 0.4 ? "medium" : "high")) as "low" | "medium" | "high";

    trace.update({
      output: {
        sustainabilityScore: avgScore,
        burnoutRisk,
        recommendation: recommendationMatch?.[1]?.trim() || "Consider spreading tasks more evenly throughout the week.",
      },
    });
    trace.end();

    return {
      sustainabilityScore: avgScore,
      burnoutRisk,
      recommendation: recommendationMatch?.[1]?.trim() || "Consider spreading tasks more evenly throughout the week.",
      evaluations,
    };
  } catch (error) {
    trace.update({
      metadata: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    trace.end();
    throw error;
  }
}

// ============================================
// FEATURE 2: FAMILY FAIRNESS ANALYZER
// ============================================

export interface FamilyTaskDistribution {
  familyId: string;
  weekStart: Date;
  members: Array<{
    userId: string;
    name: string;
    taskCount: number;
    totalMinutes: number;
    taskTypes: Record<string, number>; // e.g., { "Cleaning": 3, "Cooking": 2 }
  }>;
}

export async function evaluateFamilyFairness(
  distribution: FamilyTaskDistribution
): Promise<{
  equityScore: number;
  imbalances: Array<{ category: string; issue: string }>;
  recommendation: string;
  evaluations: EvaluationScore[];
}> {
  const trace = opikClient.trace({
    name: "evaluation:family_fairness",
    input: {
      familyId: distribution.familyId,
      memberCount: distribution.members.length,
      members: distribution.members.map(m => ({
        name: m.name,
        taskCount: m.taskCount,
        totalMinutes: m.totalMinutes,
      })),
    },
    metadata: {
      feature: "family_fairness",
      familyId: distribution.familyId,
    },
  });

  const memberSummary = distribution.members
    .map(m => {
      const taskBreakdown = Object.entries(m.taskTypes)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(", ");
      return `- ${m.name}: ${m.taskCount} tasks, ${m.totalMinutes} minutes total (${taskBreakdown})`;
    })
    .join("\n");

  const prompt = `You are evaluating the fairness of household task distribution in a family.

FAMILY TASK DISTRIBUTION FOR WEEK OF ${distribution.weekStart.toDateString()}:

${memberSummary}

Evaluate on these dimensions:

1. QUANTITY EQUITY (Are total tasks distributed fairly?)
2. TIME EQUITY (Is total time commitment balanced?)
3. CATEGORY EQUITY (Are specific chore types fairly shared, not one person doing all cooking/cleaning?)

Consider that perfect equality isn't always the goal - some members may have different availability. But significant imbalances should be flagged.

Respond in this exact format:
QUANTITY_SCORE: X/10 | REASON: [explanation]
TIME_SCORE: X/10 | REASON: [explanation]
CATEGORY_SCORE: X/10 | REASON: [explanation]
IMBALANCES: [list any specific imbalances, e.g., "Sarah does 80% of cooking"]
RECOMMENDATION: [one actionable suggestion for fairer distribution]`;

  try {
    const llmSpan = trace.span({
      name: "llm_evaluation",
      type: "llm",
      input: { prompt },
      metadata: { model: "claude-sonnet-4-20250514" },
    });

    const response = await callClaudeForEvaluation(prompt);

    llmSpan.update({ output: { response } });
    llmSpan.end();

    // Parse response
    const quantityMatch = response.match(/QUANTITY_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const timeMatch = response.match(/TIME_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const categoryMatch = response.match(/CATEGORY_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const imbalancesMatch = response.match(/IMBALANCES:\s*([^\n]+(?:\n(?!RECOMMENDATION)[^\n]+)*)/i);
    const recommendationMatch = response.match(/RECOMMENDATION:\s*(.+?)(?:\n|$)/i);

    const evaluations: EvaluationScore[] = [
      {
        name: "fairness_quantity",
        score: quantityMatch ? parseFloat(quantityMatch[1]) / 10 : 0.5,
        reason: quantityMatch ? quantityMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "fairness_time",
        score: timeMatch ? parseFloat(timeMatch[1]) / 10 : 0.5,
        reason: timeMatch ? timeMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "fairness_category",
        score: categoryMatch ? parseFloat(categoryMatch[1]) / 10 : 0.5,
        reason: categoryMatch ? categoryMatch[2].trim() : "Could not evaluate",
      },
    ];

    addEvaluations(trace, evaluations);

    const avgScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;

    // Parse imbalances
    const imbalancesText = imbalancesMatch?.[1]?.trim() || "";
    const imbalances = imbalancesText
      .split(/[,;]/)
      .filter(Boolean)
      .map(i => ({ category: "general", issue: i.trim() }));

    trace.update({
      output: {
        equityScore: avgScore,
        imbalances,
        recommendation: recommendationMatch?.[1]?.trim() || "Consider rotating task assignments weekly.",
      },
    });
    trace.end();

    return {
      equityScore: avgScore,
      imbalances,
      recommendation: recommendationMatch?.[1]?.trim() || "Consider rotating task assignments weekly.",
      evaluations,
    };
  } catch (error) {
    trace.update({
      metadata: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    trace.end();
    throw error;
  }
}

// ============================================
// FEATURE 3: AI COACHING STYLE CONSISTENCY
// ============================================

export interface AIResponse {
  userId: string;
  sessionId: string;
  userMessage: string;
  aiResponse: string;
  context: string; // e.g., "scheduling", "motivation", "conflict_resolution"
}

export async function evaluateCoachingStyle(
  response: AIResponse
): Promise<{
  overallScore: number;
  evaluations: EvaluationScore[];
}> {
  const trace = opikClient.trace({
    name: "evaluation:coaching_style",
    input: {
      userId: response.userId,
      context: response.context,
      userMessageLength: response.userMessage.length,
      aiResponseLength: response.aiResponse.length,
    },
    metadata: {
      feature: "coaching_style",
      userId: response.userId,
      sessionId: response.sessionId,
      context: response.context,
    },
  });

  const prompt = `You are evaluating an AI coaching assistant's response for quality and consistency.

CONTEXT: ${response.context}
USER MESSAGE: "${response.userMessage}"
AI RESPONSE: "${response.aiResponse}"

Evaluate the AI's response on these dimensions:

1. TONE (Is it encouraging and supportive without being condescending or overly enthusiastic?)
2. HELPFULNESS (Does it actually address the user's need?)
3. PERSONALIZATION (Does it feel tailored to this user, not generic?)
4. MOTIVATION (Does it inspire action without being pushy?)
5. CLARITY (Is the response clear and actionable?)

Respond in this exact format:
TONE_SCORE: X/10 | REASON: [explanation]
HELPFULNESS_SCORE: X/10 | REASON: [explanation]
PERSONALIZATION_SCORE: X/10 | REASON: [explanation]
MOTIVATION_SCORE: X/10 | REASON: [explanation]
CLARITY_SCORE: X/10 | REASON: [explanation]`;

  try {
    const llmSpan = trace.span({
      name: "llm_evaluation",
      type: "llm",
      input: { prompt },
      metadata: { model: "claude-sonnet-4-20250514" },
    });

    const evalResponse = await callClaudeForEvaluation(prompt);

    llmSpan.update({ output: { response: evalResponse } });
    llmSpan.end();

    // Parse response
    const toneMatch = evalResponse.match(/TONE_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const helpfulnessMatch = evalResponse.match(/HELPFULNESS_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const personalizationMatch = evalResponse.match(/PERSONALIZATION_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const motivationMatch = evalResponse.match(/MOTIVATION_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);
    const clarityMatch = evalResponse.match(/CLARITY_SCORE:\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*\|\s*REASON:\s*(.+?)(?:\n|$)/i);

    const evaluations: EvaluationScore[] = [
      {
        name: "coaching_tone",
        score: toneMatch ? parseFloat(toneMatch[1]) / 10 : 0.5,
        reason: toneMatch ? toneMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "coaching_helpfulness",
        score: helpfulnessMatch ? parseFloat(helpfulnessMatch[1]) / 10 : 0.5,
        reason: helpfulnessMatch ? helpfulnessMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "coaching_personalization",
        score: personalizationMatch ? parseFloat(personalizationMatch[1]) / 10 : 0.5,
        reason: personalizationMatch ? personalizationMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "coaching_motivation",
        score: motivationMatch ? parseFloat(motivationMatch[1]) / 10 : 0.5,
        reason: motivationMatch ? motivationMatch[2].trim() : "Could not evaluate",
      },
      {
        name: "coaching_clarity",
        score: clarityMatch ? parseFloat(clarityMatch[1]) / 10 : 0.5,
        reason: clarityMatch ? clarityMatch[2].trim() : "Could not evaluate",
      },
    ];

    addEvaluations(trace, evaluations);

    const overallScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;

    trace.update({
      output: { overallScore, evaluations },
    });
    trace.end();

    return { overallScore, evaluations };
  } catch (error) {
    trace.update({
      metadata: { error: error instanceof Error ? error.message : "Unknown error" },
    });
    trace.end();
    throw error;
  }
}

// ============================================
// FEATURE 4: CROSS-FEATURE INTELLIGENCE TRACKING
// ============================================

export interface IntelligencePropagation {
  sourceFeature: string; // e.g., "conflict_tracking"
  targetFeature: string; // e.g., "scheduling"
  insight: string; // e.g., "User prefers Tuesday mornings for gym"
  applied: boolean;
  outcome?: {
    success: boolean;
    metric: string;
    beforeValue: number;
    afterValue: number;
  };
}

export function trackIntelligencePropagation(propagation: IntelligencePropagation) {
  const trace = opikClient.trace({
    name: "intelligence:propagation",
    input: {
      sourceFeature: propagation.sourceFeature,
      targetFeature: propagation.targetFeature,
      insight: propagation.insight,
    },
    metadata: {
      feature: "intelligence_loop",
      sourceFeature: propagation.sourceFeature,
      targetFeature: propagation.targetFeature,
    },
  });

  if (propagation.applied && propagation.outcome) {
    const improvement = propagation.outcome.success
      ? (propagation.outcome.afterValue - propagation.outcome.beforeValue) / Math.max(propagation.outcome.beforeValue, 0.01)
      : 0;

    trace.score({
      name: "intelligence_effectiveness",
      value: propagation.outcome.success ? Math.min(1, 0.5 + improvement) : 0.3,
      reason: `${propagation.outcome.metric}: ${propagation.outcome.beforeValue} → ${propagation.outcome.afterValue}`,
    });

    trace.update({
      output: {
        applied: true,
        success: propagation.outcome.success,
        improvement: `${(improvement * 100).toFixed(1)}%`,
      },
    });
  } else {
    trace.update({
      output: { applied: propagation.applied, pending: !propagation.applied },
    });
  }

  trace.end();
  return trace;
}

// Track when a learned preference is applied
export function trackPreferenceLearning(
  userId: string,
  preference: {
    key: string;
    value: unknown;
    source: string; // where we learned this
    confidence: number;
  }
) {
  const trace = opikClient.trace({
    name: "intelligence:preference_learned",
    input: {
      userId,
      preferenceKey: preference.key,
      source: preference.source,
    },
    metadata: {
      feature: "intelligence_loop",
      userId,
      preferenceType: preference.key,
    },
  });

  trace.score({
    name: "learning_confidence",
    value: preference.confidence,
    reason: `Learned from ${preference.source}`,
  });

  trace.update({
    output: {
      preference: preference.key,
      value: preference.value,
      confidence: preference.confidence,
    },
  });

  trace.end();
  return trace;
}
