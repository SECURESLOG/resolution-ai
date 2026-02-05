import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  AGENT_TOOL_DEFINITIONS,
  safeExecuteTool,
  getFamilyForUser,
  formatFamilyForAI,
  getAllPreferences,
  formatPreferencesForAI,
} from "@/lib/agent-tools";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { opikClient, flushOpik } from "@/lib/opik";
import { evaluateCoachingStyle } from "@/lib/opik-evaluators";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for agent responses

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Strip markdown formatting from AI responses
function stripMarkdown(text: string): string {
  return text
    // Remove headers (## Header)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold (**text** or __text__)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    // Remove italic (*text* or _text_)
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Remove bullet points (- item or * item)
    .replace(/^[\s]*[-*]\s+/gm, "")
    // Remove numbered lists (1. item)
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`(.+?)`/g, "$1")
    // Clean up multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown> | null;
}

interface TextBlock {
  type: "text";
  text: string;
}

type ContentBlock = ToolUseBlock | TextBlock;

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: ContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

async function callAnthropic(
  system: string,
  messages: Array<{ role: string; content: unknown }>,
  tools: Array<{ name: string; description: string; input_schema: unknown }>
): Promise<AnthropicResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system,
      messages,
      tools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  return response.json();
}

const chatRequestSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  pageContext: z
    .object({
      page: z.string(),
      title: z.string(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

// System prompt for the family scheduling agent
function getSystemPrompt(
  userName: string,
  familyContext: string,
  preferencesContext: string,
  pageContext?: { page: string; title: string; data?: Record<string, unknown> }
): string {
  let pageContextSection = "";
  if (pageContext) {
    pageContextSection = `
## Current Page Context
The user is currently viewing: ${pageContext.title} (${pageContext.page})
${pageContext.data ? `Page Data: ${JSON.stringify(pageContext.data, null, 2)}` : ""}
Use this context to provide more relevant suggestions and help.
`;
  }

  return `You are a friendly scheduling assistant. You MUST write all responses as plain text without ANY formatting. No asterisks, no dashes, no bullet points, no bold, no headers. Just normal sentences in short paragraphs like a casual text conversation.

You help ${userName} with their ResolutionAI scheduling app, managing Focus Time (goals, deep work) and Life Admin (errands, chores). You can schedule tasks, check calendars, and help distribute tasks fairly.
${pageContextSection}
Family: ${familyContext}
Preferences: ${preferencesContext}

Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Use tools to get real data. Use create_scheduled_task to schedule. For today use get_todays_tasks, tomorrow use get_tomorrows_tasks, week use get_weeks_tasks.

REMINDER: Your responses must be plain text only. No markdown, no formatting symbols, no lists with dashes or asterisks. Write naturally like chatting with a friend.`;
}

export async function POST(request: NextRequest) {
  // Generate a session ID for tracing
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let trace: ReturnType<typeof opikClient.trace> | null = null;

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationHistory, pageContext } = chatRequestSchema.parse(body);

    // Start Opik trace for this conversation
    trace = opikClient.trace({
      name: "agent:chat",
      input: {
        userMessage: message,
        pageContext: pageContext?.page || "unknown",
        historyLength: conversationHistory?.length || 0,
      },
      metadata: {
        feature: "agent_chat",
        userId: session.user.id,
        sessionId,
        page: pageContext?.page,
      },
    });

    // Get user context
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    // Get family context
    const family = await getFamilyForUser(session.user.id);
    const familyContext = formatFamilyForAI(family);

    // Get preferences context
    const preferences = await getAllPreferences(session.user.id);
    const preferencesContext = formatPreferencesForAI(preferences);

    // Build messages array
    const apiMessages: Array<{ role: string; content: unknown }> = [];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory.slice(-10)) {
        // Keep last 10 messages
        apiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    apiMessages.push({
      role: "user",
      content: message,
    });

    // Inject user context into tool calls
    const toolsWithContext = AGENT_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));

    const systemPrompt = getSystemPrompt(
      user?.name || "User",
      familyContext,
      preferencesContext,
      pageContext
    );

    // Track LLM call with Opik span
    const llmSpan = trace.span({
      name: "llm_call_initial",
      type: "llm",
      input: { messageCount: apiMessages.length },
      metadata: { model: "claude-sonnet-4-20250514" },
    });

    // Call Claude with tools (using raw fetch to avoid SDK Zod validation issues)
    let response = await callAnthropic(systemPrompt, apiMessages, toolsWithContext);

    llmSpan.update({
      output: {
        stopReason: response.stop_reason,
        contentBlocks: response.content.length,
      },
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    });
    llmSpan.end();

    // Process tool calls in a loop until we get a final response
    const toolResults: { toolName: string; input: unknown; output: unknown }[] = [];
    let iterations = 0;
    const maxIterations = 10;
    let totalInputTokens = response.usage.input_tokens;
    let totalOutputTokens = response.usage.output_tokens;

    while (response.stop_reason === "tool_use" && iterations < maxIterations) {
      iterations++;

      // Extract tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      // Execute each tool
      const toolResultContents: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const toolUse of toolUseBlocks) {
        // Track tool execution with Opik span
        const toolSpan = trace.span({
          name: `tool:${toolUse.name}`,
          type: "tool",
          input: { toolName: toolUse.name, rawInput: toolUse.input },
          metadata: { iteration: iterations },
        });

        // Ensure input is an object (Claude sometimes sends null)
        const rawInput = (toolUse.input ?? {}) as Record<string, unknown>;

        // Inject userId into tool calls that need it
        const toolInput = injectUserContext(
          toolUse.name,
          rawInput,
          session.user.id,
          family?.id
        );

        const result = await safeExecuteTool(toolUse.name, toolInput);

        toolSpan.update({
          output: { success: !("error" in result), result },
        });
        toolSpan.end();

        toolResults.push({
          toolName: toolUse.name,
          input: toolInput,
          output: result,
        });

        toolResultContents.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the conversation with tool results
      apiMessages.push({
        role: "assistant",
        content: response.content,
      });

      apiMessages.push({
        role: "user",
        content: toolResultContents,
      });

      // Track follow-up LLM call
      const followUpSpan = trace.span({
        name: `llm_call_iteration_${iterations}`,
        type: "llm",
        input: { messageCount: apiMessages.length },
        metadata: { model: "claude-sonnet-4-20250514", iteration: iterations },
      });

      // Get next response
      response = await callAnthropic(systemPrompt, apiMessages, toolsWithContext);

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      followUpSpan.update({
        output: { stopReason: response.stop_reason },
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      });
      followUpSpan.end();
    }

    // Extract the final text response
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === "text"
    );

    const rawMessage = textBlocks.map((block) => block.text).join("\n");
    const assistantMessage = stripMarkdown(rawMessage);

    // Add summary scores to trace
    trace.score({
      name: "tool_count",
      value: toolResults.length / 10, // Normalize to 0-1 (10 tools = 1.0)
      reason: `Used ${toolResults.length} tools in ${iterations} iterations`,
    });

    trace.score({
      name: "efficiency",
      value: Math.max(0, 1 - (iterations / maxIterations)),
      reason: `Completed in ${iterations} iterations (max: ${maxIterations})`,
    });

    // Add a summary span with total token usage (usage is only supported on spans, not traces)
    const summarySpan = trace.span({
      name: "token_usage_summary",
      type: "general",
      input: { iterations, toolCount: toolResults.length },
    });
    summarySpan.update({
      output: { totalTokens: totalInputTokens + totalOutputTokens },
      usage: {
        prompt_tokens: totalInputTokens,
        completion_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
      },
    });
    summarySpan.end();

    // Update trace with final output
    trace.update({
      output: {
        assistantMessage: assistantMessage.slice(0, 500), // Truncate for storage
        toolsUsed: toolResults.map((r) => r.toolName),
        iterations,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      metadata: {
        toolCount: toolResults.length,
        prompt_tokens: totalInputTokens,
        completion_tokens: totalOutputTokens,
      },
    });

    trace.end();

    // Run coaching style evaluation asynchronously (don't block response)
    evaluateCoachingStyle({
      userId: session.user.id,
      sessionId,
      userMessage: message,
      aiResponse: assistantMessage,
      context: pageContext?.page || "general",
    }).catch((err) => console.error("Coaching evaluation failed:", err));

    // Flush Opik traces
    await flushOpik();

    return NextResponse.json({
      message: assistantMessage,
      toolsUsed: toolResults.map((r) => r.toolName),
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    });
  } catch (error) {
    // Log error in trace if it exists
    if (trace) {
      trace.update({
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      trace.end();
      await flushOpik();
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Agent chat error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * Inject user context into tool calls that need userId or familyId
 */
function injectUserContext(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
  familyId?: string
): Record<string, unknown> {
  const toolsNeedingUserId = [
    "get_calendar_events",
    "find_free_time_slots",
    "get_calendar_density",
    "get_user_tasks",
    "get_todays_tasks",
    "get_weeks_tasks",
    "get_tomorrows_tasks",
    "get_unscheduled_tasks",
    "check_for_conflicts",
    "get_family_info",
    "get_user_preferences",
    "get_scheduling_context",
    "get_preferred_time_slots",
    "create_reminder",
    "create_smart_reminder",
    "create_conflict_notification",
  ];

  // Tools that query family members - don't override their user ID params
  const toolsForFamilyMemberQueries = [
    "get_family_member_tasks",
  ];

  const toolsNeedingFamilyId = [
    "analyze_task_fairness",
    "suggest_task_assignment",
  ];

  const result = { ...input };

  // ALWAYS override userId with the session user for security
  // Claude may hallucinate or provide incorrect user IDs
  if (toolsNeedingUserId.includes(toolName)) {
    result.userId = userId;
  }

  // ALWAYS override familyId with the session user's family
  if (toolsNeedingFamilyId.includes(toolName) && familyId) {
    result.familyId = familyId;
  }

  // For task creation, always use current user unless explicitly assigning to family member
  if (toolName === "create_scheduled_task") {
    // If no assignedToUserId specified, default to current user
    if (!result.assignedToUserId) {
      result.assignedToUserId = userId;
    }
    // Note: We allow assignedToUserId to be different for assigning tasks to family members
  }

  // For scheduled tasks, allow family view by passing familyId
  if (toolName === "get_scheduled_tasks" && !result.userId && !result.familyId && familyId) {
    result.familyId = familyId;
  }

  return result;
}
