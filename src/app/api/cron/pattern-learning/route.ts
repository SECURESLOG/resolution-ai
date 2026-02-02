/**
 * Pattern Learning Cron Job
 *
 * Runs weekly to analyze user behavior patterns and update
 * learned preferences for better scheduling recommendations.
 *
 * Schedule: Every Monday at 3:00 AM
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  analyzeUserPatterns,
  applyPatternsToPreferences,
  getProgressTracking,
} from "@/lib/agent-tools/patterns";
import { subWeeks } from "date-fns";

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes max

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Pattern Learning] Starting weekly pattern analysis...");

    // Get all active users (users who have completed at least one task in the last 4 weeks)
    const fourWeeksAgo = subWeeks(new Date(), 4);

    const activeUserIds = await prisma.scheduledTask.findMany({
      where: {
        status: "completed",
        startTime: { gte: fourWeeksAgo },
      },
      select: { assignedToUserId: true },
      distinct: ["assignedToUserId"],
    });

    console.log(`[Pattern Learning] Found ${activeUserIds.length} active users`);

    const results: Array<{
      userId: string;
      status: string;
      tasksAnalyzed?: number;
      preferencesUpdated?: number;
      insights?: string[];
      error?: string;
    }> = [];

    for (const { assignedToUserId } of activeUserIds) {
      try {
        console.log(`[Pattern Learning] Analyzing user ${assignedToUserId}`);

        // Analyze patterns (8 weeks of data)
        const patterns = await analyzeUserPatterns(assignedToUserId, 8);

        if (patterns.totalTasksAnalyzed < 5) {
          results.push({
            userId: assignedToUserId,
            status: "skipped",
            tasksAnalyzed: patterns.totalTasksAnalyzed,
          });
          continue;
        }

        // Apply learned patterns to preferences
        const applied = await applyPatternsToPreferences(assignedToUserId, patterns);

        // Get progress tracking
        const progress = await getProgressTracking(assignedToUserId, 4);

        // Update progress tracking records
        await updateProgressTracking(assignedToUserId, progress);

        // Cache insights for quick retrieval
        await prisma.userPreference.upsert({
          where: {
            userId_key: {
              userId: assignedToUserId,
              key: "cached_insights",
            },
          },
          update: {
            value: { patterns, progress } as object,
            updatedAt: new Date(),
          },
          create: {
            userId: assignedToUserId,
            key: "cached_insights",
            value: { patterns, progress } as object,
            source: "inferred",
            confidence: 1,
          },
        });

        // Check for achievements
        const achievements = checkAchievements(patterns, progress);
        if (achievements.length > 0) {
          await createAchievementNotifications(assignedToUserId, achievements);
        }

        results.push({
          userId: assignedToUserId,
          status: "success",
          tasksAnalyzed: patterns.totalTasksAnalyzed,
          preferencesUpdated: applied.updated,
          insights: patterns.insights.slice(0, 3),
        });
      } catch (error) {
        console.error(`[Pattern Learning] Error for user ${assignedToUserId}:`, error);
        results.push({
          userId: assignedToUserId,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    console.log(`[Pattern Learning] Completed: ${successCount}/${activeUserIds.length} users processed`);

    return NextResponse.json({
      success: true,
      processedUsers: activeUserIds.length,
      successfulAnalyses: successCount,
      results,
    });
  } catch (error) {
    console.error("[Pattern Learning] Critical error:", error);
    return NextResponse.json(
      { error: "Failed to run pattern learning" },
      { status: 500 }
    );
  }
}

/**
 * Update progress tracking records in database
 */
async function updateProgressTracking(
  userId: string,
  progress: {
    weeklyProgress: Array<{ weekStart: Date; completed: number; total: number }>;
    streak: number;
  }
) {
  for (const week of progress.weeklyProgress) {
    await prisma.progressTracking.upsert({
      where: {
        userId_weekStartDate_taskType: {
          userId,
          weekStartDate: week.weekStart,
          taskType: "all",
        },
      },
      update: {
        completedCount: week.completed,
        totalCount: week.total,
      },
      create: {
        userId,
        weekStartDate: week.weekStart,
        taskType: "all",
        completedCount: week.completed,
        totalCount: week.total,
        achievements: {},
      },
    });
  }
}

/**
 * Check for new achievements
 */
function checkAchievements(
  patterns: { totalTasksAnalyzed: number; completionPatterns: Array<{ completionRate: number; sampleSize: number }> },
  progress: { streak: number; totalCompleted: number; improvement: number }
): string[] {
  const achievements: string[] = [];

  // Streak achievements
  if (progress.streak >= 7) {
    achievements.push("week_streak");
  }
  if (progress.streak >= 30) {
    achievements.push("month_streak");
  }

  // Completion milestones
  if (progress.totalCompleted >= 10) {
    achievements.push("ten_tasks");
  }
  if (progress.totalCompleted >= 50) {
    achievements.push("fifty_tasks");
  }
  if (progress.totalCompleted >= 100) {
    achievements.push("hundred_tasks");
  }

  // Improvement achievements
  if (progress.improvement >= 20) {
    achievements.push("improving");
  }

  // High completion rate
  const avgCompletionRate = patterns.completionPatterns.length > 0
    ? patterns.completionPatterns.reduce((sum, p) => sum + p.completionRate, 0) / patterns.completionPatterns.length
    : 0;

  if (avgCompletionRate >= 0.9 && patterns.totalTasksAnalyzed >= 10) {
    achievements.push("high_achiever");
  }

  return achievements;
}

/**
 * Create notifications for new achievements
 */
async function createAchievementNotifications(userId: string, achievements: string[]) {
  const achievementMessages: Record<string, { title: string; message: string }> = {
    week_streak: {
      title: "🔥 7-Day Streak!",
      message: "You've completed tasks 7 days in a row. Keep it up!",
    },
    month_streak: {
      title: "🏆 30-Day Streak!",
      message: "Incredible! A full month of consistent task completion.",
    },
    ten_tasks: {
      title: "🎯 10 Tasks Complete!",
      message: "You've reached your first milestone. Great start!",
    },
    fifty_tasks: {
      title: "⭐ 50 Tasks Complete!",
      message: "Halfway to a hundred! You're building great habits.",
    },
    hundred_tasks: {
      title: "💯 100 Tasks Complete!",
      message: "Triple digits! You're a productivity champion.",
    },
    improving: {
      title: "📈 Getting Better!",
      message: "Your completion rate has improved by 20% or more. Nice progress!",
    },
    high_achiever: {
      title: "🌟 High Achiever!",
      message: "You're completing over 90% of your scheduled tasks. Impressive!",
    },
  };

  for (const achievement of achievements) {
    const msg = achievementMessages[achievement];
    if (!msg) continue;

    // Check if achievement was already awarded
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        type: "achievement",
        metadata: {
          path: ["achievementId"],
          equals: achievement,
        },
      },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId,
          type: "achievement",
          title: msg.title,
          message: msg.message,
          priority: "normal",
          scheduledFor: new Date(),
          metadata: {
            achievementId: achievement,
            awardedAt: new Date().toISOString(),
          },
        },
      });
    }
  }
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
