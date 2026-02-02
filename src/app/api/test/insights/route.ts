/**
 * Test Insights API
 *
 * GET - Test pattern analysis without authentication
 * Requires a userId query parameter
 */

import { NextRequest, NextResponse } from "next/server";
import {
  analyzeUserPatterns,
  applyPatternsToPreferences,
  getProgressTracking,
  getSchedulingSuggestions,
} from "@/lib/agent-tools/patterns";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const weeks = parseInt(url.searchParams.get("weeks") || "8");
  const applyPatterns = url.searchParams.get("apply") === "true";

  // If no userId provided, list available users
  if (!userId) {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            scheduledTasks: {
              where: { status: "completed" },
            },
          },
        },
      },
    });

    return NextResponse.json({
      message: "Provide a userId parameter to test insights",
      usage: "/api/test/insights?userId=<user_id>&weeks=8",
      availableUsers: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        completedTasks: u._count.scheduledTasks,
      })),
    });
  }

  try {
    console.log(`[Test Insights] Analyzing patterns for user ${userId}`);
    const startTime = Date.now();

    // Analyze patterns
    const patterns = await analyzeUserPatterns(userId, weeks);
    const patternTime = Date.now() - startTime;

    // Apply patterns to preferences if requested
    let appliedPreferences: { updated: number; preferences: string[] } | null = null;
    if (applyPatterns) {
      appliedPreferences = await applyPatternsToPreferences(userId, patterns);
    }

    // Get progress tracking
    const progress = await getProgressTracking(userId, 4);
    const progressTime = Date.now() - startTime - patternTime;

    // Get scheduling suggestions for different task types
    const fitnessSuggestion = await getSchedulingSuggestions(userId, "resolution", "Fitness", 60);
    const workSuggestion = await getSchedulingSuggestions(userId, "resolution", "Work", 90);
    const readingSuggestion = await getSchedulingSuggestions(userId, "resolution", "Reading", 30);
    const suggestionTime = Date.now() - startTime - patternTime - progressTime;

    return NextResponse.json({
      success: true,
      userId,
      weeksAnalyzed: weeks,
      timing: {
        patternsMs: patternTime,
        progressMs: progressTime,
        suggestionMs: suggestionTime,
        totalMs: Date.now() - startTime,
      },
      patterns: {
        totalTasksAnalyzed: patterns.totalTasksAnalyzed,
        insights: patterns.insights,
        topTimeSlots: patterns.timePatterns.slice(0, 5),
        durationPatterns: patterns.durationPatterns,
        completionPatterns: patterns.completionPatterns.slice(0, 3),
        contextPatterns: patterns.contextPatterns,
      },
      progress: {
        streak: progress.streak,
        totalCompleted: progress.totalCompleted,
        improvement: `${progress.improvement}%`,
        weeklyProgress: progress.weeklyProgress.map((w) => ({
          week: new Date(w.weekStart).toLocaleDateString(),
          completed: w.completed,
          total: w.total,
          rate: `${Math.round(w.rate * 100)}%`,
        })),
      },
      appliedPreferences: appliedPreferences,
      schedulingSuggestions: {
        fitness: {
          taskType: "Fitness",
          estimatedDuration: 60,
          ...fitnessSuggestion,
        },
        work: {
          taskType: "Work",
          estimatedDuration: 90,
          ...workSuggestion,
        },
        reading: {
          taskType: "Reading",
          estimatedDuration: 30,
          ...readingSuggestion,
        },
      },
    });
  } catch (error) {
    console.error("[Test Insights] Error:", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
