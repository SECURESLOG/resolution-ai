import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = subWeeks(weekStart, 1);

    // Get overlaps this week
    const overlapsThisWeek = await prisma.scheduleOverlap.count({
      where: {
        userId: session.user.id,
        weekOf: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    // Get overlaps last week for comparison
    const overlapsLastWeek = await prisma.scheduleOverlap.count({
      where: {
        userId: session.user.id,
        weekOf: {
          gte: lastWeekStart,
          lt: weekStart,
        },
      },
    });

    // Get skipped tasks this week (could be due to conflicts)
    const skippedTasksThisWeek = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        status: "skipped",
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    // Get completed tasks this week
    const completedTasksThisWeek = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        status: "completed",
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    // Get tasks with overlaps that were skipped
    const overlappedAndSkipped = await prisma.scheduleOverlap.count({
      where: {
        userId: session.user.id,
        weekOf: {
          gte: weekStart,
          lte: weekEnd,
        },
        scheduledTask: {
          status: "skipped",
        },
      },
    });

    // Calculate impact percentage
    const totalTasks = completedTasksThisWeek + skippedTasksThisWeek;
    const impactPercentage = totalTasks > 0
      ? Math.round((overlappedAndSkipped / totalTasks) * 100)
      : 0;

    // Generate AI insight based on data
    let insight = "";
    let severity: "low" | "medium" | "high" = "low";

    if (overlapsThisWeek === 0) {
      insight = "Your schedule is balanced. No overcommitments detected - you're protecting your time well.";
      severity = "low";
    } else if (overlapsThisWeek <= 2) {
      insight = `${overlapsThisWeek} potential burnout ${overlapsThisWeek === 1 ? 'risk' : 'risks'} this week. Minor, but worth reviewing to stay sustainable.`;
      severity = "low";
    } else if (overlapsThisWeek <= 5) {
      insight = `${overlapsThisWeek} overcommitments detected. This level of schedule conflict often leads to dropped tasks. Consider protecting more focus time.`;
      severity = "medium";
    } else {
      insight = `Warning: ${overlapsThisWeek} overcommitments this week. ${overlappedAndSkipped > 0 ? `You've already dropped ${overlappedAndSkipped} things.` : ''} Your schedule needs rebalancing to be sustainable.`;
      severity = "high";
    }

    // Add trend insight
    if (overlapsLastWeek > 0) {
      if (overlapsThisWeek < overlapsLastWeek) {
        insight += ` Good progress - down from ${overlapsLastWeek} last week.`;
      } else if (overlapsThisWeek > overlapsLastWeek) {
        insight += ` Trending up from ${overlapsLastWeek} last week - watch your commitments.`;
      }
    }

    return NextResponse.json({
      overlapsThisWeek,
      overlapsLastWeek,
      skippedTasksThisWeek,
      completedTasksThisWeek,
      overlappedAndSkipped,
      impactPercentage,
      insight,
      severity,
    });
  } catch (error) {
    console.error("Error fetching schedule health:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule health" },
      { status: 500 }
    );
  }
}
