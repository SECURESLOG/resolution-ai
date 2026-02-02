/**
 * User Insights API
 *
 * GET - Fetch user's learned patterns and insights
 * POST - Trigger pattern analysis (manual refresh)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  analyzeUserPatterns,
  applyPatternsToPreferences,
  getProgressTracking,
  getSchedulingSuggestions,
} from "@/lib/agent-tools/patterns";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const weeks = parseInt(url.searchParams.get("weeks") || "8");
    const refresh = url.searchParams.get("refresh") === "true";

    // Check for cached insights
    const cachedInsights = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "cached_insights",
        },
      },
    });

    // Use cache if less than 24 hours old and not forcing refresh
    const cacheAge = cachedInsights
      ? (Date.now() - new Date(cachedInsights.updatedAt).getTime()) / (1000 * 60 * 60)
      : Infinity;

    if (cachedInsights && cacheAge < 24 && !refresh) {
      const cached = cachedInsights.value as unknown as {
        patterns: Awaited<ReturnType<typeof analyzeUserPatterns>>;
        progress: Awaited<ReturnType<typeof getProgressTracking>>;
      };

      return NextResponse.json({
        ...cached,
        fromCache: true,
        cacheAgeHours: Math.round(cacheAge * 10) / 10,
      });
    }

    // Analyze patterns
    const patterns = await analyzeUserPatterns(session.user.id, weeks);
    const progress = await getProgressTracking(session.user.id, 4);

    // Cache the results
    await prisma.userPreference.upsert({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "cached_insights",
        },
      },
      update: {
        value: { patterns, progress } as object,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        key: "cached_insights",
        value: { patterns, progress } as object,
        source: "inferred",
        confidence: 1,
      },
    });

    return NextResponse.json({
      patterns,
      progress,
      fromCache: false,
    });
  } catch (error) {
    console.error("Error fetching insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const weeks = body.weeks || 8;

    console.log(`[Insights] Analyzing patterns for user ${session.user.id}`);

    // Analyze patterns
    const patterns = await analyzeUserPatterns(session.user.id, weeks);

    // Apply to preferences
    const applied = await applyPatternsToPreferences(session.user.id, patterns);

    // Get progress tracking
    const progress = await getProgressTracking(session.user.id, 4);

    // Update cache
    await prisma.userPreference.upsert({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "cached_insights",
        },
      },
      update: {
        value: { patterns, progress } as object,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        key: "cached_insights",
        value: { patterns, progress } as object,
        source: "inferred",
        confidence: 1,
      },
    });

    return NextResponse.json({
      success: true,
      patterns,
      progress,
      preferencesUpdated: applied.updated,
      updatedPreferences: applied.preferences,
    });
  } catch (error) {
    console.error("Error analyzing patterns:", error);
    return NextResponse.json(
      { error: "Failed to analyze patterns" },
      { status: 500 }
    );
  }
}
