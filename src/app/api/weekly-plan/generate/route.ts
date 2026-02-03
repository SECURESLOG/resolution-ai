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

    // Helper to convert day name to number (handles both string and number formats)
    const dayNameToNumber: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    const getDayNumbers = (days: unknown[] | null): number[] => {
      if (!days || days.length === 0) return [];
      return days.map(d => {
        if (typeof d === 'number') return d;
        if (typeof d === 'string') return dayNameToNumber[d.toLowerCase()] ?? -1;
        return -1;
      }).filter(n => n >= 0);
    };

    // Build task info map for validation
    const taskInfoMap = new Map<string, {
      userId: string;
      type: string;
      schedulingMode: string | null;
      fixedDays: number[];
      fixedTime: string | null;
      requiredDays: number[];
    }>();
    for (const member of familyContext.members) {
      for (const task of member.tasks) {
        const fixedDays = getDayNumbers(task.fixedDays as unknown[] | null);
        const requiredDays = getDayNumbers(task.requiredDays as unknown[] | null);

        console.log(`Task: ${task.name}, mode: ${task.schedulingMode}, fixedDays: [${fixedDays}], requiredDays: [${requiredDays}], fixedTime: ${task.fixedTime}`);

        taskInfoMap.set(task.id, {
          userId: member.userId,
          type: task.type,
          schedulingMode: task.schedulingMode,
          fixedDays,
          fixedTime: task.fixedTime,
          requiredDays,
        });
      }
    }

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    console.log(`\n=== AI Generated ${planResult.tasks.length} tasks ===`);
    for (const t of planResult.tasks) {
      console.log(`  - ${t.taskName}: ${t.scheduledDate} at ${t.startTime}`);
    }

    // Validate and filter tasks
    const validatedTasks = planResult.tasks.filter((proposedTask) => {
      const taskInfo = taskInfoMap.get(proposedTask.taskId);
      if (!taskInfo) {
        console.warn(`FILTERED: Task ${proposedTask.taskId} (${proposedTask.taskName}) not found in family tasks`);
        return false;
      }

      // Resolution tasks must be assigned to their owner
      if (taskInfo.type === "resolution" && proposedTask.assignedToUserId !== taskInfo.userId) {
        console.warn(`FILTERED: ${proposedTask.taskName} - wrong owner assignment`);
        return false;
      }

      // Parse scheduled date correctly to avoid timezone issues
      // "YYYY-MM-DD" parsed as `new Date(str)` is UTC midnight, but getDay() uses local time
      // So we parse year/month/day explicitly to get local date
      const dateParts = proposedTask.scheduledDate.split('-');
      const scheduledDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1, // Month is 0-indexed
        parseInt(dateParts[2])
      );
      const dayOfWeek = scheduledDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

      console.log(`Checking ${proposedTask.taskName}: scheduled on ${dayNames[dayOfWeek]} (${dayOfWeek}), fixedDays: [${taskInfo.fixedDays}], requiredDays: [${taskInfo.requiredDays}], mode: ${taskInfo.schedulingMode}`);

      if (taskInfo.schedulingMode === "fixed" && taskInfo.fixedDays.length > 0) {
        if (!taskInfo.fixedDays.includes(dayOfWeek)) {
          const allowedDays = taskInfo.fixedDays.map(d => dayNames[d]).join(", ");
          console.warn(`FILTERED: ${proposedTask.taskName} scheduled on ${dayNames[dayOfWeek]} but only allowed on: ${allowedDays}`);
          return false;
        }
      }

      // Also check requiredDays for flexible tasks
      if (taskInfo.requiredDays.length > 0) {
        if (!taskInfo.requiredDays.includes(dayOfWeek)) {
          const allowedDays = taskInfo.requiredDays.map(d => dayNames[d]).join(", ");
          console.warn(`FILTERED: ${proposedTask.taskName} scheduled on ${dayNames[dayOfWeek]} but required days are: ${allowedDays}`);
          return false;
        }
      }

      // Validate fixedTime constraint
      if (taskInfo.schedulingMode === "fixed" && taskInfo.fixedTime) {
        // Extract time from the scheduled startTime
        const startTimeDate = new Date(proposedTask.startTime);
        const scheduledHour = startTimeDate.getHours();
        const scheduledMinute = startTimeDate.getMinutes();
        const scheduledTimeStr = `${scheduledHour.toString().padStart(2, '0')}:${scheduledMinute.toString().padStart(2, '0')}`;

        // Parse the fixedTime (format: "HH:mm" like "16:30")
        const [fixedHour, fixedMinute] = taskInfo.fixedTime.split(':').map(Number);
        const fixedTimeStr = `${fixedHour.toString().padStart(2, '0')}:${fixedMinute.toString().padStart(2, '0')}`;

        // Allow 15-minute tolerance
        const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
        const fixedMinutes = fixedHour * 60 + fixedMinute;
        const timeDiff = Math.abs(scheduledMinutes - fixedMinutes);

        if (timeDiff > 15) {
          console.warn(`FILTERED: ${proposedTask.taskName} scheduled at ${scheduledTimeStr} but must be at ${fixedTimeStr}`);
          return false;
        }
      }

      console.log(`PASSED: ${proposedTask.taskName}`);
      return true;
    });

    console.log(`\n=== After validation: ${validatedTasks.length} tasks remain ===\n`);

    if (validatedTasks.length === 0) {
      return NextResponse.json(
        { error: "No valid tasks after validation" },
        { status: 500 }
      );
    }

    // Use validated tasks
    planResult.tasks = validatedTasks;

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

  // Log prompt for debugging
  console.log("\n=== AI SCHEDULING PROMPT (task constraints) ===");
  const taskLines = prompt.split('\n').filter(line =>
    line.includes('FIXED SCHEDULE') ||
    line.includes('Required days') ||
    line.includes('Required time') ||
    line.includes('- Nursery') ||
    line.includes('schedulingMode')
  );
  taskLines.forEach(line => console.log(line));
  console.log("=== END PROMPT EXCERPT ===\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are an AI scheduling assistant for a family scheduling app. Your job is to create an optimized weekly schedule that balances everyone's tasks, respects their preferences, and avoids conflicts with existing calendar events.

When creating schedules:
1. **CRITICAL: Follow scheduling constraints EXACTLY:**
   - Tasks marked "FIXED SCHEDULE" with required days MUST be scheduled on ALL of those days (e.g., Mon-Fri means create 5 separate entries, one for each day)
   - "Required time" means the task MUST start at that exact time on each scheduled day
   - Respect frequency requirements - if frequency=5 and days=Mon-Fri, create exactly 5 entries
   - Do NOT schedule fixed tasks on days not in their required days list (e.g., NO weekends if only Mon-Fri specified)
2. **CRITICAL: Resolution tasks (type: "resolution") MUST ONLY be assigned to their owner. NEVER assign to another family member.**
3. Household tasks (type: "household") CAN be distributed fairly between family members
4. Respect each person's learned preferences (preferred times, energy patterns)
5. Avoid conflicts with existing calendar events
6. Consider task priorities (1=highest, 4=lowest)
7. Leave buffer time between tasks
8. Don't over-schedule - aim for achievable plans

CRITICAL: Respond with ONLY valid JSON. No markdown, no code blocks, no explanation text before or after.
- No trailing commas after the last item in arrays or objects
- All strings must be properly quoted
- Keep reasoning text short (under 200 characters per task)
- The assignedToUserId MUST match the userId of the person who owns that task

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

        // Helper to format day arrays (handles both string and number formats)
        const formatDays = (days: unknown[]): string => {
          return days.map(d => {
            if (typeof d === 'string') {
              return d.charAt(0).toUpperCase() + d.slice(1); // Capitalize
            }
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            return dayNames[d as number] || d;
          }).join(", ");
        };

        prompt += `- ${task.name} (ID: ${task.id})\n`;
        prompt += `  - Type: ${task.type}, Category: ${task.category || "None"}, Duration: ${task.duration} minutes\n`;
        prompt += `  - Priority: ${priority}\n`;

        // Scheduling mode and constraints
        if (task.schedulingMode === "fixed") {
          prompt += `  - **FIXED SCHEDULE** - Must follow these constraints exactly:\n`;
          if (task.fixedDays && (task.fixedDays as unknown[]).length > 0) {
            const days = formatDays(task.fixedDays as unknown[]);
            prompt += `    - Required days: ${days} (ONLY schedule on these days, NO other days)\n`;
          }
          if (task.fixedTime) {
            prompt += `    - Required time: ${task.fixedTime} (MUST start at this exact time)\n`;
          }
        } else {
          prompt += `  - Flexible scheduling\n`;
          if (task.requiredDays && (task.requiredDays as unknown[]).length > 0) {
            const days = formatDays(task.requiredDays as unknown[]);
            prompt += `    - Required days: ${days} (ONLY schedule on these days)\n`;
          }
          if (task.preferredDays && (task.preferredDays as unknown[]).length > 0) {
            const days = formatDays(task.preferredDays as unknown[]);
            prompt += `    - Preferred days: ${days}\n`;
          }
          if (task.preferredTimeStart || task.preferredTimeEnd) {
            prompt += `    - Preferred time window: ${task.preferredTimeStart || "any"} to ${task.preferredTimeEnd || "any"}\n`;
          }
        }

        // Frequency
        if (task.frequency && task.frequencyPeriod) {
          prompt += `  - Frequency: ${task.frequency} time(s) per ${task.frequencyPeriod}\n`;
        }
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
  prompt += `- **CRITICAL: Resolution tasks (personal goals) must ONLY be assigned to the person who owns them. Never assign someone's resolution task to another family member.**\n`;
  prompt += `- Household tasks CAN be distributed fairly between family members\n`;
  prompt += `- Avoid scheduling during existing calendar events\n`;
  prompt += `- Consider energy levels: physical tasks earlier, mental tasks when alert\n\n`;

  prompt += `Generate the weekly schedule as a JSON object. Remember to use the exact task IDs and user IDs provided above. Each task MUST be assigned to its owner (the person whose tasks section it appears under).`;

  return prompt;
}
