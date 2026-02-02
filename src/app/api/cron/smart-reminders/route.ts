/**
 * Smart Reminder Cron Job
 *
 * This endpoint runs every hour to check for upcoming tasks
 * and generate context-aware reminders based on:
 * - Weather conditions
 * - Traffic estimates
 * - Calendar density
 * - User preferences
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { addHours, format, isWithinInterval } from "date-fns";
import * as calendarTools from "@/lib/agent-tools/calendar";
import * as contextTools from "@/lib/agent-tools/context";
import * as preferenceTools from "@/lib/agent-tools/preferences";

const CRON_SECRET = process.env.CRON_SECRET;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface UpcomingTask {
  id: string;
  taskName: string;
  taskType: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  userId: string;
  userName: string;
  category: string | null;
}

interface SavedLocation {
  type: string;
  label: string;
  address: string;
}

interface TaskContext {
  task: UpcomingTask;
  weather: Awaited<ReturnType<typeof contextTools.getWeather>>;
  traffic: Awaited<ReturnType<typeof contextTools.getTraffic>>;
  calendarDensity: number;
  userPreferences: Awaited<ReturnType<typeof preferenceTools.getAllPreferences>>;
  savedLocations: SavedLocation[];
  recentReminders: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const windowStart = addHours(now, 1); // Tasks starting in 1 hour
    const windowEnd = addHours(now, 4); // Up to 4 hours from now

    console.log(`[Smart Reminders] Checking tasks from ${format(windowStart, "HH:mm")} to ${format(windowEnd, "HH:mm")}`);

    // Find all scheduled tasks in the reminder window
    const upcomingTasks = await prisma.scheduledTask.findMany({
      where: {
        startTime: {
          gte: windowStart,
          lte: windowEnd,
        },
        status: "pending",
      },
      include: {
        task: true,
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    console.log(`[Smart Reminders] Found ${upcomingTasks.length} upcoming tasks`);

    const results: { userId: string; taskName: string; status: string; notificationId?: string }[] = [];

    for (const scheduledTask of upcomingTasks) {
      try {
        // Check if we already sent a reminder for this task recently
        const existingReminder = await prisma.notification.findFirst({
          where: {
            userId: scheduledTask.assignedToUserId,
            type: "reminder",
            metadata: {
              path: ["scheduledTaskId"],
              equals: scheduledTask.id,
            },
            createdAt: {
              gte: addHours(now, -2), // Within last 2 hours
            },
          },
        });

        if (existingReminder) {
          results.push({
            userId: scheduledTask.assignedToUserId,
            taskName: scheduledTask.task.name,
            status: "skipped - recent reminder exists",
          });
          continue;
        }

        // Gather context for this task
        const taskContext = await gatherTaskContext({
          id: scheduledTask.id,
          taskName: scheduledTask.task.name,
          taskType: scheduledTask.task.type,
          startTime: scheduledTask.startTime,
          endTime: scheduledTask.endTime,
          duration: scheduledTask.task.duration,
          userId: scheduledTask.assignedToUserId,
          userName: scheduledTask.assignedTo.name || scheduledTask.assignedTo.email || "User",
          category: scheduledTask.task.category,
        });

        // Generate smart reminder
        const reminder = await generateSmartReminder(taskContext);

        if (!reminder.shouldSend) {
          results.push({
            userId: scheduledTask.assignedToUserId,
            taskName: scheduledTask.task.name,
            status: `skipped - ${reminder.reason}`,
          });
          continue;
        }

        // Create the notification
        const notification = await prisma.notification.create({
          data: {
            userId: scheduledTask.assignedToUserId,
            type: "reminder",
            title: reminder.title,
            message: reminder.message,
            actionUrl: "/calendar",
            actionLabel: "View Schedule",
            priority: reminder.priority,
            scheduledFor: now,
            metadata: {
              scheduledTaskId: scheduledTask.id,
              taskName: scheduledTask.task.name,
              startTime: scheduledTask.startTime.toISOString(),
              contextFactors: reminder.contextFactors,
            },
          },
        });

        results.push({
          userId: scheduledTask.assignedToUserId,
          taskName: scheduledTask.task.name,
          status: "sent",
          notificationId: notification.id,
        });
      } catch (error) {
        console.error(`[Smart Reminders] Error processing task ${scheduledTask.id}:`, error);
        results.push({
          userId: scheduledTask.assignedToUserId,
          taskName: scheduledTask.task.name,
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
    console.error("[Smart Reminders] Critical error:", error);
    return NextResponse.json(
      { error: "Failed to process reminders" },
      { status: 500 }
    );
  }
}

async function gatherTaskContext(task: UpcomingTask): Promise<TaskContext> {
  const taskDate = task.startTime;

  // Get user preferences (includes saved locations)
  const userPreferences = await preferenceTools.getAllPreferences(task.userId);

  // Extract saved locations from preferences
  const locationsPref = userPreferences.find((p) => p.key === "saved_locations");
  const savedLocations: SavedLocation[] = (locationsPref?.value as unknown as SavedLocation[]) || [];

  // Get weather for the task time
  const weather = await contextTools.getWeather("local", taskDate);

  // Determine origin and destination for traffic
  const homeLocation = savedLocations.find((l) => l.type === "home");
  let destinationLocation = savedLocations.find((l) =>
    task.taskName.toLowerCase().includes(l.type) ||
    task.category?.toLowerCase().includes(l.type)
  );

  // Try to match task to a saved location (e.g., "Gym" task -> gym location)
  if (!destinationLocation) {
    const taskNameLower = task.taskName.toLowerCase();
    if (taskNameLower.includes("gym") || taskNameLower.includes("workout")) {
      destinationLocation = savedLocations.find((l) => l.type === "gym");
    } else if (taskNameLower.includes("work") || taskNameLower.includes("office")) {
      destinationLocation = savedLocations.find((l) => l.type === "work");
    } else if (taskNameLower.includes("school") || taskNameLower.includes("class")) {
      destinationLocation = savedLocations.find((l) => l.type === "school");
    }
  }

  // Get traffic estimate using real addresses if available
  const origin = homeLocation?.address || "home";
  const destination = destinationLocation?.address || task.category || "destination";

  const traffic = await contextTools.getTraffic(origin, destination, taskDate);

  // Get calendar density for the day
  const calendarDensity = await calendarTools.getCalendarDensity(task.userId, taskDate);

  // Count recent reminders to avoid notification fatigue
  const recentReminders = await prisma.notification.count({
    where: {
      userId: task.userId,
      type: "reminder",
      createdAt: {
        gte: addHours(new Date(), -24),
      },
    },
  });

  return {
    task,
    weather,
    traffic,
    calendarDensity,
    userPreferences,
    savedLocations,
    recentReminders,
  };
}

async function generateSmartReminder(context: TaskContext): Promise<{
  shouldSend: boolean;
  reason?: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  contextFactors: string[];
}> {
  const { task, weather, traffic, calendarDensity, userPreferences, recentReminders } = context;

  // Check for notification fatigue
  if (recentReminders >= 10) {
    return {
      shouldSend: false,
      reason: "too many recent reminders",
      title: "",
      message: "",
      priority: "normal",
      contextFactors: [],
    };
  }

  // Build context for AI
  const timeUntilTask = Math.round((task.startTime.getTime() - Date.now()) / (1000 * 60));
  const contextFactors: string[] = [];

  // Determine if task is likely outdoor-related
  const outdoorKeywords = ["gym", "run", "walk", "jog", "cycle", "bike", "hike", "swim", "outdoor", "garden", "yard", "park", "exercise", "workout", "sports", "tennis", "golf", "soccer", "football", "basketball"];
  const isOutdoorTask = outdoorKeywords.some(keyword =>
    task.taskName.toLowerCase().includes(keyword) ||
    (task.category?.toLowerCase().includes(keyword) ?? false)
  );

  // Weather context with outdoor-specific advice
  if (isOutdoorTask) {
    // Temperature extremes
    if (weather.temperature < 5) {
      contextFactors.push(`COLD ALERT: ${weather.temperature}°C outside. Dress warmly in layers!`);
    } else if (weather.temperature > 30) {
      contextFactors.push(`HEAT ALERT: ${weather.temperature}°C outside. Stay hydrated and avoid peak sun!`);
    }

    // Weather conditions for outdoor activities
    if (weather.condition === "rainy") {
      contextFactors.push(`RAIN EXPECTED: Consider indoor alternatives or bring rain gear.`);
    } else if (weather.condition === "stormy") {
      contextFactors.push(`STORM WARNING: Outdoor activity not recommended. Consider rescheduling.`);
    } else if (weather.condition === "snowy") {
      contextFactors.push(`SNOW EXPECTED: Roads may be slippery. Consider indoor workout instead.`);
    } else if (weather.condition === "windy") {
      contextFactors.push(`WINDY CONDITIONS: ${weather.windSpeed}km/h winds. May affect outdoor activities.`);
    } else if (weather.isGoodForOutdoor) {
      contextFactors.push(`Great weather for outdoor activity: ${weather.temperature}°C, ${weather.description}.`);
    }
  } else {
    // Non-outdoor tasks - just note severe weather that might affect travel
    if (weather.condition === "stormy" || weather.condition === "snowy") {
      contextFactors.push(`Weather advisory: ${weather.description}. Travel may be affected.`);
    }
  }

  // Traffic context - calculate recommended departure adjustment
  if (traffic.estimatedDelayMinutes > 0) {
    const leaveEarlyMinutes = Math.ceil(traffic.estimatedDelayMinutes / 5) * 5; // Round up to nearest 5
    const travelInfo = traffic.source === "tomtom"
      ? ` (${traffic.travelTimeMinutes} min trip, ${traffic.distanceKm}km)`
      : "";

    if (traffic.congestionLevel === "heavy" || traffic.congestionLevel === "severe") {
      contextFactors.push(`IMPORTANT: Heavy traffic expected! Leave ${leaveEarlyMinutes} minutes earlier than usual.${travelInfo}`);
    } else if (traffic.estimatedDelayMinutes > 10) {
      contextFactors.push(`Traffic: Consider leaving ${leaveEarlyMinutes} minutes early due to moderate traffic.${travelInfo}`);
    } else if (traffic.source === "tomtom") {
      // Even if no significant delay, show travel time from TomTom
      contextFactors.push(`Travel time: ${traffic.travelTimeMinutes} min (${traffic.distanceKm}km)`);
    }
  }

  // Calendar density context
  if (calendarDensity > 0.7) {
    contextFactors.push("Busy day - schedule is packed");
  }

  // Build the prompt
  const prompt = buildReminderPrompt(task, timeUntilTask, contextFactors, userPreferences);

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-3-5-20241022",
      max_tokens: 500,
      system: `You are a helpful reminder assistant. Generate short, friendly, context-aware reminders for tasks.

Your reminders should:
- Be concise (1-2 sentences)
- ALWAYS include specific actionable advice from the context
- If traffic delays are mentioned, ALWAYS include the "leave early" advice prominently
- For outdoor tasks with weather alerts:
  - Rain/storms: Suggest indoor alternatives or rescheduling
  - Cold (<5°C): Remind to dress warmly in layers
  - Hot (>30°C): Remind to stay hydrated, avoid peak sun
  - Good weather: Be encouraging about the great conditions!
- Be encouraging but not overly enthusiastic

IMPORTANT: Weather and traffic alerts MUST be prominently included in your message!

Respond with JSON only:
{
  "title": "Short title (max 50 chars)",
  "message": "Reminder message with specific advice (max 200 chars)",
  "priority": "low" | "normal" | "high",
  "shouldSend": true | false,
  "reason": "Only if shouldSend is false"
}`,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response");
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON in response");
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      shouldSend: result.shouldSend !== false,
      reason: result.reason,
      title: result.title || `Upcoming: ${task.taskName}`,
      message: result.message || `Your task "${task.taskName}" starts in ${timeUntilTask} minutes.`,
      priority: result.priority || "normal",
      contextFactors,
    };
  } catch (error) {
    console.error("[Smart Reminders] AI generation error:", error);

    // Fallback to basic reminder with traffic-aware messaging
    let fallbackMessage = `Your task "${task.taskName}" starts in ${timeUntilTask} minutes.`;

    // Check for traffic advice in context factors
    const trafficAdvice = contextFactors.find(f => f.includes("Leave") || f.includes("leave"));
    if (trafficAdvice) {
      fallbackMessage = `${trafficAdvice} Your "${task.taskName}" starts in ${timeUntilTask} minutes.`;
    } else if (contextFactors.length > 0) {
      fallbackMessage += ` Note: ${contextFactors.join(", ")}`;
    }

    return {
      shouldSend: true,
      title: trafficAdvice ? `Leave Early: ${task.taskName}` : `Upcoming: ${task.taskName}`,
      message: fallbackMessage,
      priority: trafficAdvice ? "high" : (timeUntilTask <= 30 ? "high" : "normal"),
      contextFactors,
    };
  }
}

function buildReminderPrompt(
  task: UpcomingTask,
  timeUntilTask: number,
  contextFactors: string[],
  userPreferences: Awaited<ReturnType<typeof preferenceTools.getAllPreferences>>
): string {
  let prompt = `Generate a reminder for:\n`;
  prompt += `- Task: ${task.taskName}\n`;
  prompt += `- Type: ${task.taskType}\n`;
  prompt += `- Starts in: ${timeUntilTask} minutes (at ${format(task.startTime, "h:mm a")})\n`;
  prompt += `- Duration: ${task.duration} minutes\n`;

  if (task.category) {
    prompt += `- Category: ${task.category}\n`;
  }

  if (contextFactors.length > 0) {
    prompt += `\nContext to consider:\n`;
    for (const factor of contextFactors) {
      prompt += `- ${factor}\n`;
    }
  }

  if (userPreferences.length > 0) {
    const relevantPrefs = userPreferences.filter((p) =>
      ["energy_pattern", "preferred_reminder_style", "motivation_preference"].includes(p.key)
    );
    if (relevantPrefs.length > 0) {
      prompt += `\nUser preferences:\n`;
      for (const pref of relevantPrefs) {
        prompt += `- ${pref.key}: ${JSON.stringify(pref.value)}\n`;
      }
    }
  }

  return prompt;
}

// Support GET for manual testing
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: "Use POST with proper authorization" },
      { status: 405 }
    );
  }
  return POST(request);
}
