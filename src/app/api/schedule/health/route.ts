import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks, parseISO, format } from "date-fns";
import { getBlockedTimesForRange, BlockedTime } from "@/lib/user-availability";

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

    // Get blocked times (work hours, commute, vacation, holidays) for this week
    let workScheduleConflicts = 0;
    let vacationConflicts = 0;
    let holidayConflicts = 0;
    const recommendations: string[] = [];

    try {
      const blockedTimes = await getBlockedTimesForRange(session.user.id, weekStart, weekEnd);

      // Get all scheduled tasks this week to check for conflicts with blocked times
      const scheduledTasksThisWeek = await prisma.scheduledTask.findMany({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        include: { task: true },
      });

      // Check each scheduled task for conflicts with blocked times
      for (const task of scheduledTasksThisWeek) {
        const taskStart = task.startTime;
        const taskEnd = task.endTime;

        for (const blocked of blockedTimes) {
          // Check for overlap
          if (taskStart < blocked.end && taskEnd > blocked.start) {
            switch (blocked.type) {
              case "work":
              case "commute":
                workScheduleConflicts++;
                break;
              case "vacation":
                vacationConflicts++;
                break;
              case "holiday":
                holidayConflicts++;
                break;
            }
          }
        }
      }

      // Generate recommendations based on detected issues
      if (workScheduleConflicts > 0) {
        recommendations.push(`${workScheduleConflicts} task${workScheduleConflicts > 1 ? 's' : ''} scheduled during work hours - consider moving to personal time.`);
      }
      if (vacationConflicts > 0) {
        recommendations.push(`${vacationConflicts} task${vacationConflicts > 1 ? 's' : ''} scheduled during vacation - these may need rescheduling.`);
      }
      if (holidayConflicts > 0) {
        recommendations.push(`${holidayConflicts} task${holidayConflicts > 1 ? 's' : ''} scheduled on public holidays.`);
      }
    } catch (error) {
      console.error("Error checking blocked time conflicts:", error);
    }

    // Calculate impact percentage
    const totalTasks = completedTasksThisWeek + skippedTasksThisWeek;
    const impactPercentage = totalTasks > 0
      ? Math.round((overlappedAndSkipped / totalTasks) * 100)
      : 0;

    // Calculate total conflicts
    const totalBlockedTimeConflicts = workScheduleConflicts + vacationConflicts + holidayConflicts;
    const totalConflicts = overlapsThisWeek + totalBlockedTimeConflicts;

    // Generate AI insight based on data
    let insight = "";
    let severity: "low" | "medium" | "high" = "low";

    if (totalConflicts === 0) {
      insight = "Your schedule is balanced. No overcommitments detected - you're protecting your time well.";
      severity = "low";
    } else if (totalConflicts <= 2) {
      insight = `${totalConflicts} potential burnout ${totalConflicts === 1 ? 'risk' : 'risks'} this week. Minor, but worth reviewing to stay sustainable.`;
      severity = "low";
    } else if (totalConflicts <= 5) {
      if (workScheduleConflicts > 0) {
        insight = `${totalConflicts} conflicts detected, including ${workScheduleConflicts} during work hours. Consider moving tasks to your free time.`;
      } else {
        insight = `${totalConflicts} overcommitments detected. This level of schedule conflict often leads to dropped tasks. Consider protecting more focus time.`;
      }
      severity = "medium";
    } else {
      insight = `Warning: ${totalConflicts} conflicts this week. ${overlappedAndSkipped > 0 ? `You've already dropped ${overlappedAndSkipped} things.` : ''} Your schedule needs rebalancing to be sustainable.`;
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
      // New metrics for work schedule conflicts
      workScheduleConflicts,
      vacationConflicts,
      holidayConflicts,
      totalBlockedTimeConflicts,
      recommendations,
    });
  } catch (error) {
    console.error("Error fetching schedule health:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule health" },
      { status: 500 }
    );
  }
}
