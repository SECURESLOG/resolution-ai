/**
 * Manual Weekly Plan Generation
 *
 * POST - Manually trigger weekly plan generation for the user's family
 * This is useful for testing or regenerating a plan
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  addWeeks,
} from "date-fns";
import * as calendarTools from "@/lib/agent-tools/calendar";
import * as taskTools from "@/lib/agent-tools/tasks";
import * as preferenceTools from "@/lib/agent-tools/preferences";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FamilyContext {
  familyId: string;
  familyName: string;
  members: {
    userId: string;
    name: string;
    tasks: Awaited<ReturnType<typeof taskTools.getUserTasks>>;
    preferences: Awaited<ReturnType<typeof preferenceTools.getAllPreferences>>;
    calendarEvents: Awaited<ReturnType<typeof calendarTools.getCalendarEvents>>;
  }[];
}

interface ProposedTask {
  taskId: string;
  taskName: string;
  assignedToUserId: string;
  assignedToName: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  reasoning: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { week = "next" } = body; // "current" or "next"

    // Get user's family
    const familyMember = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      include: {
        family: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    if (!familyMember) {
      return NextResponse.json({ error: "Not part of a family" }, { status: 404 });
    }

    // Calculate week date range
    const today = new Date();
    const weekStart = week === "current"
      ? startOfWeek(today, { weekStartsOn: 1 })
      : startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    // Check for existing plan
    const existingPlan = await prisma.weeklyPlan.findUnique({
      where: {
        familyId_weekStart: {
          familyId: familyMember.familyId,
          weekStart,
        },
      },
    });

    if (existingPlan) {
      if (existingPlan.status === "approved") {
        return NextResponse.json(
          { error: "A plan for this week has already been approved" },
          { status: 400 }
        );
      }

      // Delete existing draft, rejected, or pending_approval plan to regenerate
      if (["draft", "rejected", "pending_approval", "expired"].includes(existingPlan.status)) {
        await prisma.weeklyPlan.delete({
          where: { id: existingPlan.id },
        });
      }
    }

    // Gather context
    const familyContext = await gatherFamilyContext(
      familyMember.familyId,
      familyMember.family.name,
      familyMember.family.members,
      weekStart,
      weekEnd
    );

    // Generate the plan
    const planResult = await generateWeeklyPlan(familyContext, weekStart, weekEnd);

    if (!planResult.success || !planResult.tasks.length) {
      return NextResponse.json(
        { error: planResult.error || "Failed to generate plan - no tasks" },
        { status: 500 }
      );
    }

    // Store the plan
    const weeklyPlan = await prisma.weeklyPlan.create({
      data: {
        familyId: familyMember.familyId,
        weekStart,
        weekEnd,
        status: "draft",
        aiReasoning: planResult.reasoning,
        createdBy: session.user.id,
        expiresAt: addDays(weekEnd, 1),
        items: {
          create: planResult.tasks.map((task) => ({
            taskId: task.taskId,
            assignedToUserId: task.assignedToUserId,
            scheduledDate: new Date(task.scheduledDate),
            startTime: new Date(task.startTime),
            endTime: new Date(task.endTime),
            aiReasoning: task.reasoning,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json({
      success: true,
      plan: {
        id: weeklyPlan.id,
        weekStart: weeklyPlan.weekStart,
        weekEnd: weeklyPlan.weekEnd,
        itemCount: weeklyPlan.items.length,
      },
      message: `Generated plan with ${weeklyPlan.items.length} scheduled tasks`,
    });
  } catch (error) {
    console.error("Error generating weekly plan:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly plan" },
      { status: 500 }
    );
  }
}

async function gatherFamilyContext(
  familyId: string,
  familyName: string,
  members: { userId: string; user: { id: string; name: string | null; email: string | null } }[],
  weekStart: Date,
  weekEnd: Date
): Promise<FamilyContext> {
  const memberContexts = await Promise.all(
    members.map(async (member) => {
      const [tasks, preferences, calendarEvents] = await Promise.all([
        taskTools.getUserTasks(member.userId),
        preferenceTools.getAllPreferences(member.userId),
        calendarTools.getCalendarEvents(member.userId, weekStart, weekEnd),
      ]);

      return {
        userId: member.userId,
        name: member.user.name || member.user.email || "Unknown",
        tasks,
        preferences,
        calendarEvents,
      };
    })
  );

  return {
    familyId,
    familyName,
    members: memberContexts,
  };
}

async function generateWeeklyPlan(
  context: FamilyContext,
  weekStart: Date,
  weekEnd: Date
): Promise<{
  success: boolean;
  tasks: ProposedTask[];
  reasoning: string;
  error?: string;
}> {
  const prompt = buildPlanningPrompt(context, weekStart, weekEnd);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are an AI scheduling assistant for a family scheduling app. Your job is to create an optimized weekly schedule that balances everyone's tasks, respects their preferences, and avoids conflicts with existing calendar events.

When creating schedules:
1. Respect each person's learned preferences (preferred times, energy patterns)
2. Distribute household tasks fairly between family members
3. Schedule resolution tasks (personal goals) at optimal times for each person
4. Avoid conflicts with existing calendar events
5. Consider task priorities (1=highest, 4=lowest)
6. Leave buffer time between tasks
7. Don't over-schedule - aim for achievable plans

CRITICAL: Respond with ONLY valid JSON. No markdown, no code blocks, no explanation text before or after.
- No trailing commas after the last item in arrays or objects
- All strings must be properly quoted
- Keep reasoning text short (under 200 characters per task)

JSON structure:
{"reasoning":"Brief strategy explanation","tasks":[{"taskId":"id","taskName":"name","assignedToUserId":"userId","assignedToName":"name","scheduledDate":"YYYY-MM-DD","startTime":"YYYY-MM-DDTHH:mm:ss","endTime":"YYYY-MM-DDTHH:mm:ss","reasoning":"brief reason"}]}`,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { success: false, tasks: [], reasoning: "", error: "No text response" };
    }

    // Try to extract and clean JSON from response
    let jsonStr = textContent.text;

    // Try to find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response:", jsonStr.substring(0, 500));
      return { success: false, tasks: [], reasoning: "", error: "No JSON found in response" };
    }

    jsonStr = jsonMatch[0];

    // Clean up common JSON issues from AI responses
    // Remove trailing commas before ] or }
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    // Remove any control characters
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');

    try {
      const planData = JSON.parse(jsonStr);
      return {
        success: true,
        tasks: planData.tasks || [],
        reasoning: planData.reasoning || "",
      };
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Attempted to parse:", jsonStr.substring(0, 1000));

      // Try a more aggressive cleanup
      try {
        // Remove any text after the last valid closing brace
        const lastBrace = jsonStr.lastIndexOf('}');
        if (lastBrace > 0) {
          jsonStr = jsonStr.substring(0, lastBrace + 1);
        }
        // Balance braces/brackets
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

        const planData = JSON.parse(jsonStr);
        return {
          success: true,
          tasks: planData.tasks || [],
          reasoning: planData.reasoning || "",
        };
      } catch {
        return {
          success: false,
          tasks: [],
          reasoning: "",
          error: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`
        };
      }
    }
  } catch (error) {
    console.error("AI generation error:", error);
    return {
      success: false,
      tasks: [],
      reasoning: "",
      error: error instanceof Error ? error.message : "AI generation failed",
    };
  }
}

function buildPlanningPrompt(
  context: FamilyContext,
  weekStart: Date,
  weekEnd: Date
): string {
  const weekRange = `${format(weekStart, "EEEE, MMMM d")} to ${format(weekEnd, "EEEE, MMMM d, yyyy")}`;

  let prompt = `Create an optimized weekly schedule for the ${context.familyName} family for the week of ${weekRange}.\n\n`;

  prompt += `## Family Members\n\n`;

  for (const member of context.members) {
    prompt += `### ${member.name} (ID: ${member.userId})\n\n`;

    prompt += `**Tasks to schedule:**\n`;
    if (member.tasks.length === 0) {
      prompt += `- No tasks defined\n`;
    } else {
      for (const task of member.tasks) {
        const priority = ["High", "Medium-High", "Medium", "Low"][task.priority - 1] || "Medium";
        prompt += `- ${task.name} (ID: ${task.id})\n`;
        prompt += `  - Type: ${task.type}, Duration: ${task.duration} minutes\n`;
        prompt += `  - Priority: ${priority}, Flexible: ${task.isFlexible ? "Yes" : "No"}\n`;
      }
    }
    prompt += `\n`;

    prompt += `**Learned preferences:**\n`;
    if (member.preferences.length === 0) {
      prompt += `- No preferences recorded yet\n`;
    } else {
      for (const pref of member.preferences) {
        prompt += `- ${pref.key}: ${JSON.stringify(pref.value)} (confidence: ${(pref.confidence * 100).toFixed(0)}%)\n`;
      }
    }
    prompt += `\n`;

    prompt += `**Existing calendar events (busy times):**\n`;
    if (member.calendarEvents.length === 0) {
      prompt += `- No events scheduled\n`;
    } else {
      for (const event of member.calendarEvents) {
        const timeStr = event.isAllDay
          ? `All day on ${format(event.start, "EEEE, MMM d")}`
          : `${format(event.start, "EEEE, MMM d 'at' h:mm a")} - ${format(event.end, "h:mm a")}`;
        prompt += `- ${event.summary}: ${timeStr}\n`;
      }
    }
    prompt += `\n`;
  }

  prompt += `## Scheduling Guidelines\n`;
  prompt += `- Working hours: 8:00 AM to 9:00 PM\n`;
  prompt += `- Try to schedule each task 2-3 times during the week for regular practice\n`;
  prompt += `- For household tasks, distribute fairly between family members\n`;
  prompt += `- Avoid scheduling during existing calendar events\n`;
  prompt += `- Consider energy levels: physical tasks earlier, mental tasks when alert\n\n`;

  prompt += `Generate the weekly schedule as a JSON object. Remember to use the exact task IDs and user IDs provided above.`;

  return prompt;
}
