/**
 * Test Reminder API
 *
 * POST - Manually trigger a smart reminder check for the current user
 * This is useful for testing without waiting for the cron job
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { addHours, format } from "date-fns";
import * as calendarTools from "@/lib/agent-tools/calendar";
import * as contextTools from "@/lib/agent-tools/context";
import * as preferenceTools from "@/lib/agent-tools/preferences";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { hoursAhead = 4 } = body;

    const now = new Date();
    const windowStart = now;
    const windowEnd = addHours(now, hoursAhead);

    // Find user's upcoming tasks
    const upcomingTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: session.user.id,
        startTime: {
          gte: windowStart,
          lte: windowEnd,
        },
        status: "pending",
      },
      include: {
        task: true,
      },
      orderBy: { startTime: "asc" },
    });

    if (upcomingTasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No tasks found in the next ${hoursAhead} hours`,
        reminders: [],
      });
    }

    const reminders = [];

    for (const scheduledTask of upcomingTasks) {
      const timeUntilTask = Math.round(
        (scheduledTask.startTime.getTime() - now.getTime()) / (1000 * 60)
      );

      // Get context
      const [weather, traffic, calendarDensity, preferences] = await Promise.all([
        contextTools.getWeather("local", scheduledTask.startTime),
        contextTools.getTraffic("home", scheduledTask.task.category || "destination", scheduledTask.startTime),
        calendarTools.getCalendarDensity(session.user.id, scheduledTask.startTime),
        preferenceTools.getAllPreferences(session.user.id),
      ]);

      const contextFactors: string[] = [];

      // Determine if task is likely outdoor-related
      const outdoorKeywords = ["gym", "run", "walk", "jog", "cycle", "bike", "hike", "swim", "outdoor", "garden", "yard", "park", "exercise", "workout", "sports"];
      const isOutdoorTask = outdoorKeywords.some(keyword =>
        scheduledTask.task.name.toLowerCase().includes(keyword) ||
        (scheduledTask.task.category?.toLowerCase().includes(keyword) ?? false)
      );

      // Weather context with outdoor-specific advice
      if (isOutdoorTask) {
        if (weather.temperature < 5) {
          contextFactors.push(`COLD: ${weather.temperature}°C - dress warmly!`);
        } else if (weather.temperature > 30) {
          contextFactors.push(`HOT: ${weather.temperature}°C - stay hydrated!`);
        }

        if (weather.condition === "rainy") {
          contextFactors.push(`Rain expected - bring gear or go indoors`);
        } else if (weather.condition === "stormy") {
          contextFactors.push(`Storm warning - consider rescheduling`);
        } else if (weather.isGoodForOutdoor) {
          contextFactors.push(`Great weather: ${weather.temperature}°C, ${weather.description}`);
        }
      } else if (weather.condition === "stormy" || weather.condition === "snowy") {
        contextFactors.push(`Weather: ${weather.description} - travel may be affected`);
      }

      // Traffic-aware advice
      if (traffic.estimatedDelayMinutes > 0) {
        const leaveEarlyMinutes = Math.ceil(traffic.estimatedDelayMinutes / 5) * 5;
        if (traffic.congestionLevel === "heavy" || traffic.congestionLevel === "severe") {
          contextFactors.push(`IMPORTANT: Leave ${leaveEarlyMinutes} minutes early due to heavy traffic!`);
        } else if (traffic.estimatedDelayMinutes > 10) {
          contextFactors.push(`Consider leaving ${leaveEarlyMinutes} minutes early due to traffic.`);
        }
      }
      if (calendarDensity > 0.7) {
        contextFactors.push("Busy day");
      }

      // Generate reminder with AI
      const reminder = await generateReminder(
        scheduledTask.task.name,
        scheduledTask.task.type,
        timeUntilTask,
        scheduledTask.task.duration,
        contextFactors
      );

      // Create notification
      const notification = await prisma.notification.create({
        data: {
          userId: session.user.id,
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
            contextFactors,
            testGenerated: true,
          },
        },
      });

      reminders.push({
        taskName: scheduledTask.task.name,
        startsIn: `${timeUntilTask} minutes`,
        notification: {
          id: notification.id,
          title: reminder.title,
          message: reminder.message,
          priority: reminder.priority,
        },
        contextFactors,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${reminders.length} reminder(s)`,
      reminders,
    });
  } catch (error) {
    console.error("Error generating test reminders:", error);
    return NextResponse.json(
      { error: "Failed to generate reminders" },
      { status: 500 }
    );
  }
}

async function generateReminder(
  taskName: string,
  taskType: string,
  timeUntilMinutes: number,
  durationMinutes: number,
  contextFactors: string[]
): Promise<{ title: string; message: string; priority: "low" | "normal" | "high" }> {
  try {
    const prompt = `Generate a friendly reminder for:
- Task: ${taskName}
- Type: ${taskType}
- Starts in: ${timeUntilMinutes} minutes
- Duration: ${durationMinutes} minutes
${contextFactors.length > 0 ? `- Context: ${contextFactors.join(", ")}` : ""}

Respond with JSON only: {"title": "...", "message": "...", "priority": "low|normal|high"}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-3-5-20241022",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((b) => b.type === "text");
    if (textContent && textContent.type === "text") {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (error) {
    console.error("AI reminder generation failed:", error);
  }

  // Fallback
  return {
    title: `Upcoming: ${taskName}`,
    message: `Your task "${taskName}" starts in ${timeUntilMinutes} minutes.`,
    priority: timeUntilMinutes <= 30 ? "high" : "normal",
  };
}
