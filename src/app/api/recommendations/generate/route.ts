import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { startOfWeek, subWeeks, format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get conflict data for the last 4 weeks
    const now = new Date();
    const startDate = startOfWeek(subWeeks(now, 4), { weekStartsOn: 1 });

    const conflicts = await prisma.scheduleConflict.findMany({
      where: {
        userId: session.user.id,
        weekOf: { gte: startDate },
      },
      include: {
        movedTask: {
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
            frequency: true,
            frequencyPeriod: true,
            preferredTimeStart: true,
            preferredTimeEnd: true,
            schedulingMode: true,
            fixedDays: true,
            fixedTime: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group conflicts by task
    const taskConflicts = new Map<string, {
      task: typeof conflicts[0]["movedTask"];
      conflicts: typeof conflicts;
      movedToDays: string[];
      movedToTimes: string[];
    }>();

    for (const conflict of conflicts) {
      const taskId = conflict.movedTaskId;
      const existing = taskConflicts.get(taskId);
      const movedToDay = format(conflict.newStartTime, "EEEE").toLowerCase();
      const movedToTime = format(conflict.newStartTime, "HH:mm");

      if (existing) {
        existing.conflicts.push(conflict);
        existing.movedToDays.push(movedToDay);
        existing.movedToTimes.push(movedToTime);
      } else {
        taskConflicts.set(taskId, {
          task: conflict.movedTask,
          conflicts: [conflict],
          movedToDays: [movedToDay],
          movedToTimes: [movedToTime],
        });
      }
    }

    // Analyze patterns and generate recommendations
    interface RecommendationData {
      taskId: string;
      type: string;
      reason: string;
      suggestion: string;
      suggestedChange: Record<string, unknown> | null;
      priority: string;
    }

    const recommendations: RecommendationData[] = [];

    for (const [taskId, data] of Array.from(taskConflicts.entries())) {
      const { task, conflicts: taskConflictsList, movedToDays, movedToTimes } = data;
      const moveCount = taskConflictsList.length;

      // Skip if only moved once or twice
      if (moveCount < 3) continue;

      // Analyze day patterns
      const dayFrequency = movedToDays.reduce<Record<string, number>>((acc, day) => {
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {});

      const dayEntries = Object.entries(dayFrequency).sort((a, b) => b[1] - a[1]);
      const mostCommonDay = dayEntries[0];

      // Analyze time patterns
      const timeSlots = movedToTimes.map((t: string) => {
        const hour = parseInt(t.split(":")[0]);
        if (hour < 12) return "morning";
        if (hour < 17) return "afternoon";
        return "evening";
      });

      const slotFrequency = timeSlots.reduce<Record<string, number>>((acc, slot) => {
        acc[slot] = (acc[slot] || 0) + 1;
        return acc;
      }, {});

      const slotEntries = Object.entries(slotFrequency).sort((a, b) => b[1] - a[1]);
      const mostCommonSlot = slotEntries[0];

      // Generate recommendation based on patterns
      if (mostCommonDay && mostCommonDay[1] >= moveCount * 0.5) {
        // User consistently moves task to a specific day
        recommendations.push({
          taskId,
          type: "change_days",
          reason: `You've rescheduled "${task.name}" ${moveCount} times in the last 4 weeks, often to ${mostCommonDay[0]}s.`,
          suggestion: `Consider changing "${task.name}" to be scheduled on ${mostCommonDay[0]}s instead.`,
          suggestedChange: {
            preferredDays: [mostCommonDay[0]],
          },
          priority: moveCount >= 6 ? "high" : "normal",
        });
      }

      if (mostCommonSlot && mostCommonSlot[1] >= moveCount * 0.5) {
        // User consistently moves task to a specific time slot
        const timeWindows: Record<string, { start: string; end: string }> = {
          morning: { start: "06:00", end: "12:00" },
          afternoon: { start: "12:00", end: "17:00" },
          evening: { start: "17:00", end: "21:00" },
        };
        const timeWindow = timeWindows[mostCommonSlot[0]];

        if (timeWindow) {
          recommendations.push({
            taskId,
            type: "change_time",
            reason: `You often reschedule "${task.name}" to the ${mostCommonSlot[0]} (${moveCount} times).`,
            suggestion: `Update "${task.name}" to prefer ${mostCommonSlot[0]} scheduling (${timeWindow.start} - ${timeWindow.end}).`,
            suggestedChange: {
              preferredTimeStart: timeWindow.start,
              preferredTimeEnd: timeWindow.end,
            },
            priority: moveCount >= 6 ? "high" : "normal",
          });
        }
      }

      // Check if task is being rescheduled too frequently (might need reduced frequency)
      if (moveCount >= 8) {
        recommendations.push({
          taskId,
          type: "reduce_frequency",
          reason: `"${task.name}" has been rescheduled ${moveCount} times in 4 weeks, suggesting it might be scheduled too often.`,
          suggestion: `Consider reducing the frequency of "${task.name}" to make it more manageable.`,
          suggestedChange: {
            frequency: Math.max(1, (task.frequency || 1) - 1),
          },
          priority: "high",
        });
      }
    }

    // Use AI to enhance recommendations if we have the API key
    if (ANTHROPIC_API_KEY && recommendations.length > 0) {
      try {
        const prompt = `You are a scheduling assistant. Based on these user behavior patterns, provide brief, actionable advice (1-2 sentences each).

Patterns observed:
${recommendations.map((r) => `- ${r.reason}`).join("\n")}

Provide a brief overall insight about the user's scheduling habits and one key suggestion for improvement.`;

        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 300,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const textContent = result.content.find((c: { type: string }) => c.type === "text");

          if (textContent?.text) {
            // Add a general recommendation based on AI insight
            recommendations.unshift({
              taskId: "",
              type: "general",
              reason: "Based on your scheduling patterns over the last 4 weeks",
              suggestion: textContent.text,
              suggestedChange: null,
              priority: "normal",
            });
          }
        }
      } catch (error) {
        console.error("Error getting AI insight:", error);
        // Continue without AI enhancement
      }
    }

    // Save recommendations to database
    const expiresAt = addDays(now, 7);

    // Clear old pending recommendations for this user
    await prisma.aIRecommendation.updateMany({
      where: {
        userId: session.user.id,
        status: "pending",
      },
      data: {
        status: "expired",
      },
    });

    // Create new recommendations
    const savedRecommendations = await Promise.all(
      recommendations.slice(0, 10).map((rec) =>
        prisma.aIRecommendation.create({
          data: {
            userId: session.user.id,
            taskId: rec.taskId || null,
            type: rec.type,
            reason: rec.reason,
            suggestion: rec.suggestion,
            suggestedChange: rec.suggestedChange as Prisma.InputJsonValue | undefined,
            priority: rec.priority,
            displayLocation: rec.type === "general" ? "insights" : "weekly_plan",
            status: "pending",
            expiresAt,
          },
        })
      )
    );

    return NextResponse.json({
      generated: savedRecommendations.length,
      recommendations: savedRecommendations,
    });
  } catch (error) {
    console.error("Error generating recommendations:", error);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
