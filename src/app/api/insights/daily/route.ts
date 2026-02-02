import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, format } from "date-fns";

export const dynamic = "force-dynamic";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface DailyInsightData {
  userName: string;
  todayCompleted: number;
  todayTotal: number;
  weekCompleted: number;
  weekTotal: number;
  streakDays: number;
  recentPatterns: string[];
  topResolution: { name: string; rate: number } | null;
  missedTasks: string[];
}

async function generateInsight(data: DailyInsightData): Promise<string> {
  const prompt = `You are a supportive AI coach for a habit-tracking and scheduling app. Generate a brief, personalized daily insight (2-3 sentences max) for the user based on their data.

User: ${data.userName}
Today: ${data.todayCompleted}/${data.todayTotal} tasks completed
This week: ${data.weekCompleted}/${data.weekTotal} tasks completed
Current streak: ${data.streakDays} days
${data.topResolution ? `Best resolution: "${data.topResolution.name}" at ${data.topResolution.rate}% completion` : ""}
${data.missedTasks.length > 0 ? `Recently skipped: ${data.missedTasks.join(", ")}` : ""}
${data.recentPatterns.length > 0 ? `Patterns noticed: ${data.recentPatterns.join("; ")}` : ""}

Guidelines:
- Be encouraging but authentic (not over-the-top)
- If they're doing well, celebrate briefly
- If struggling, offer gentle, actionable advice
- Reference specific data points when relevant
- Keep it conversational and personal
- Don't use emojis unless streak is impressive (7+ days)

Generate the insight:`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate insight");
    }

    const result = await response.json();
    const textContent = result.content.find((c: { type: string }) => c.type === "text");
    return textContent?.text || "Keep up the great work on your goals!";
  } catch (error) {
    console.error("Error generating insight:", error);
    // Fallback insights based on data
    if (data.streakDays >= 7) {
      return `Amazing! You're on a ${data.streakDays}-day streak. That's real dedication to your goals.`;
    } else if (data.weekCompleted > 0 && data.weekTotal > 0) {
      const rate = Math.round((data.weekCompleted / data.weekTotal) * 100);
      if (rate >= 80) {
        return `You've completed ${rate}% of your tasks this week. Excellent consistency!`;
      } else if (rate >= 50) {
        return `You're halfway through your weekly goals with ${data.weekCompleted} tasks done. Keep pushing!`;
      }
    }
    return "Every small step counts. Focus on one task at a time today.";
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekAgo = subDays(now, 7);

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    // Get today's stats
    const [todayTotal, todayCompleted] = await Promise.all([
      prisma.scheduledTask.count({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.scheduledTask.count({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: { gte: todayStart, lte: todayEnd },
          status: "completed",
        },
      }),
    ]);

    // Get week stats
    const [weekTotal, weekCompleted] = await Promise.all([
      prisma.scheduledTask.count({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: { gte: weekAgo },
        },
      }),
      prisma.scheduledTask.count({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: { gte: weekAgo },
          status: "completed",
        },
      }),
    ]);

    // Calculate streak
    let streakDays = 0;
    let checkDate = subDays(now, 1);
    while (streakDays < 365) {
      const dayStart = startOfDay(checkDate);
      const dayEnd = endOfDay(checkDate);
      const completed = await prisma.scheduledTask.count({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: { gte: dayStart, lte: dayEnd },
          status: "completed",
        },
      });
      if (completed > 0) {
        streakDays++;
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }
    }

    // Get recently missed/skipped tasks
    const missedTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: weekAgo, lt: todayStart },
        status: { in: ["skipped", "pending"] },
      },
      include: { task: { select: { name: true } } },
      take: 3,
    });

    // Get top resolution
    const resolutionStats = await prisma.scheduledTask.groupBy({
      by: ["taskId"],
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: subDays(now, 30) },
        task: { type: "resolution" },
      },
      _count: { id: true },
    });

    let topResolution = null;
    if (resolutionStats.length > 0) {
      const stats = await Promise.all(
        resolutionStats.slice(0, 5).map(async (stat) => {
          const task = await prisma.task.findUnique({
            where: { id: stat.taskId },
            select: { name: true },
          });
          const completed = await prisma.scheduledTask.count({
            where: {
              taskId: stat.taskId,
              assignedToUserId: session.user.id,
              scheduledDate: { gte: subDays(now, 30) },
              status: "completed",
            },
          });
          return {
            name: task?.name || "Unknown",
            rate: stat._count.id > 0 ? Math.round((completed / stat._count.id) * 100) : 0,
          };
        })
      );
      stats.sort((a, b) => b.rate - a.rate);
      if (stats[0]?.rate > 0) {
        topResolution = stats[0];
      }
    }

    // Get patterns from preferences
    const patterns: string[] = [];
    const preferences = await prisma.userPreference.findMany({
      where: { userId: session.user.id, confidence: { gte: 0.7 } },
      orderBy: { confidence: "desc" },
      take: 3,
    });
    for (const pref of preferences) {
      if (pref.key.includes("preferred_time") && pref.value) {
        const valueStr = typeof pref.value === "string" ? pref.value : JSON.stringify(pref.value);
        patterns.push(`You prefer tasks at ${valueStr}`);
      } else if (pref.key.includes("energy") && pref.value) {
        const valueStr = typeof pref.value === "string" ? pref.value : JSON.stringify(pref.value);
        patterns.push(`Energy pattern: ${valueStr}`);
      }
    }

    // Generate the insight
    const insight = await generateInsight({
      userName: user?.name?.split(" ")[0] || "there",
      todayCompleted,
      todayTotal,
      weekCompleted,
      weekTotal,
      streakDays,
      recentPatterns: patterns,
      topResolution,
      missedTasks: missedTasks.map((t) => t.task.name),
    });

    return NextResponse.json({
      insight,
      stats: {
        todayCompleted,
        todayTotal,
        weekCompleted,
        weekTotal,
        streakDays,
        completionRate: weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating daily insight:", error);
    return NextResponse.json(
      { error: "Failed to generate insight" },
      { status: 500 }
    );
  }
}
