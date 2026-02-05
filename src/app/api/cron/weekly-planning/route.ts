/**
 * Weekly Planning Cron Job
 *
 * This endpoint is triggered by Vercel Cron every Sunday at 6:00 PM
 * to generate optimized weekly schedules for all families.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  startOfDay,
  endOfDay,
  format,
  addWeeks,
} from "date-fns";
import * as calendarTools from "@/lib/agent-tools/calendar";
import * as taskTools from "@/lib/agent-tools/tasks";
import * as preferenceTools from "@/lib/agent-tools/preferences";

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for cron job

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
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Calculate next week's date range
    const today = new Date();
    const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
    const nextWeekEnd = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });

    console.log(`[Weekly Planning] Generating plans for week: ${format(nextWeekStart, "yyyy-MM-dd")} to ${format(nextWeekEnd, "yyyy-MM-dd")}`);

    // Get all families
    const families = await prisma.family.findMany({
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    const results: { familyId: string; familyName: string; status: string; planId?: string }[] = [];

    for (const family of families) {
      try {
        // Check if a plan already exists for this week
        const existingPlan = await prisma.weeklyPlan.findUnique({
          where: {
            familyId_weekStart: {
              familyId: family.id,
              weekStart: nextWeekStart,
            },
          },
        });

        if (existingPlan) {
          results.push({
            familyId: family.id,
            familyName: family.name,
            status: "skipped - plan already exists",
            planId: existingPlan.id,
          });
          continue;
        }

        // Gather context for AI planning
        const familyContext = await gatherFamilyContext(
          family.id,
          family.name,
          family.members,
          nextWeekStart,
          nextWeekEnd
        );

        // Generate the weekly plan using AI
        const planResult = await generateWeeklyPlan(familyContext, nextWeekStart, nextWeekEnd);

        if (!planResult.success || !planResult.tasks.length) {
          results.push({
            familyId: family.id,
            familyName: family.name,
            status: `failed - ${planResult.error || "no tasks generated"}`,
          });
          continue;
        }

        // Store the plan as a draft
        const weeklyPlan = await prisma.weeklyPlan.create({
          data: {
            familyId: family.id,
            weekStart: nextWeekStart,
            weekEnd: nextWeekEnd,
            status: "draft",
            aiReasoning: planResult.reasoning,
            expiresAt: addDays(nextWeekStart, 2), // Expire by Tuesday if not acted upon
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
        });

        // Create notifications for all family members
        for (const member of family.members) {
          await prisma.notification.create({
            data: {
              userId: member.userId,
              type: "weekly_plan",
              title: "Weekly Schedule Ready",
              message: `Your family's schedule for the week of ${format(nextWeekStart, "MMMM d")} is ready for review. ${planResult.tasks.length} tasks have been scheduled.`,
              actionUrl: "/weekly-plan",
              actionLabel: "Review Schedule",
              priority: "high",
              scheduledFor: new Date(),
              metadata: { planId: weeklyPlan.id },
            },
          });
        }

        results.push({
          familyId: family.id,
          familyName: family.name,
          status: "success",
          planId: weeklyPlan.id,
        });
      } catch (error) {
        console.error(`[Weekly Planning] Error processing family ${family.id}:`, error);
        results.push({
          familyId: family.id,
          familyName: family.name,
          status: `error - ${error instanceof Error ? error.message : "unknown"}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[Weekly Planning] Critical error:", error);
    return NextResponse.json(
      { error: "Failed to run weekly planning" },
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
  // Build the prompt for Claude
  const prompt = buildPlanningPrompt(context, weekStart, weekEnd);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are an AI scheduling assistant for a family scheduling app. Your job is to create an optimized weekly schedule that balances everyone's tasks, respects their preferences, and avoids conflicts with existing calendar events.

When creating schedules:
1. Respect each person's learned preferences (preferred times, energy patterns)
2. Distribute Life Admin tasks fairly between family members
3. Schedule Focus Time tasks (personal goals, deep work) at optimal times for each person
4. Avoid conflicts with existing calendar events
5. Consider task priorities (1=highest, 4=lowest)
6. Leave buffer time between tasks
7. Don't over-schedule - aim for achievable plans

Respond with a JSON object containing:
{
  "reasoning": "Overall explanation of your scheduling strategy",
  "tasks": [
    {
      "taskId": "the task definition ID",
      "taskName": "name of the task",
      "assignedToUserId": "user ID to assign to",
      "assignedToName": "user's name",
      "scheduledDate": "YYYY-MM-DD",
      "startTime": "YYYY-MM-DDTHH:mm:ss",
      "endTime": "YYYY-MM-DDTHH:mm:ss",
      "reasoning": "why this time was chosen"
    }
  ]
}`,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract the text response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return { success: false, tasks: [], reasoning: "", error: "No text response" };
    }

    // Parse the JSON response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, tasks: [], reasoning: "", error: "No JSON found in response" };
    }

    const planData = JSON.parse(jsonMatch[0]);
    return {
      success: true,
      tasks: planData.tasks || [],
      reasoning: planData.reasoning || "",
    };
  } catch (error) {
    console.error("[Weekly Planning] AI generation error:", error);
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

    // Tasks
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

    // Preferences
    prompt += `**Learned preferences:**\n`;
    if (member.preferences.length === 0) {
      prompt += `- No preferences recorded yet\n`;
    } else {
      for (const pref of member.preferences) {
        prompt += `- ${pref.key}: ${JSON.stringify(pref.value)} (confidence: ${(pref.confidence * 100).toFixed(0)}%)\n`;
      }
    }
    prompt += `\n`;

    // Existing calendar events
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
  prompt += `- For Life Admin tasks, distribute fairly between family members\n`;
  prompt += `- Avoid scheduling during existing calendar events\n`;
  prompt += `- Consider energy levels: physical tasks earlier, mental tasks when alert\n\n`;

  prompt += `Please generate the weekly schedule as a JSON object.`;

  return prompt;
}

// Also support GET for manual testing (with auth)
export async function GET(request: NextRequest) {
  // For manual testing, require the cron secret
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Use POST with proper authorization to run this endpoint" },
      { status: 405 }
    );
  }

  // Redirect to POST
  return POST(request);
}
