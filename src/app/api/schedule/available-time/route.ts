import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCalendarEvents } from "@/lib/calendar";
import { findAvailableSlots } from "@/lib/calendar";
import { getBlockedTimesForRange, getUserAvailabilityInfo } from "@/lib/user-availability";
import { calculateAchievableInstances } from "@/lib/deterministic-scheduler";
import { endOfWeek, addDays, format, parseISO } from "date-fns";

export const dynamic = "force-dynamic";

// GET - Calculate available time for the specified week (or current week if not specified)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const weekStartParam = searchParams.get("weekStart");

    const now = new Date();

    // Use provided week start or default to today
    let rangeStart: Date;
    let weekEnd: Date;

    if (weekStartParam) {
      // User specified a week - use that week's start
      rangeStart = parseISO(weekStartParam);
      weekEnd = endOfWeek(rangeStart, { weekStartsOn: 1 });

      // If the week start is in the past, adjust to start from today
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (rangeStart < today) {
        rangeStart = today;
      }
    } else {
      // Default behavior - current week from today
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      weekEnd = endOfWeek(rangeStart, { weekStartsOn: 1 });

      // If today is Sunday, return 0 available time
      if (now.getDay() === 0) {
        return NextResponse.json({
          availableMinutes: 0,
          availableHours: 0,
          daysRemaining: 0,
          breakdown: [],
          unscheduledTasks: [],
          totalTaskMinutes: 0,
          totalTaskHours: 0,
          canFitAll: true,
        });
      }
    }

    // Get user's availability info
    const availabilityInfo = await getUserAvailabilityInfo(session.user.id);
    const blockedTimes = await getBlockedTimesForRange(session.user.id, rangeStart, weekEnd);

    // Get calendar events
    let calendarEvents: Awaited<ReturnType<typeof getCalendarEvents>> = [];
    try {
      calendarEvents = await getCalendarEvents(session.user.id, rangeStart, weekEnd);
    } catch {
      console.log("Calendar not connected");
    }

    // Calculate available time for each remaining day
    const breakdown: { date: string; dayName: string; availableMinutes: number }[] = [];
    let totalAvailableMinutes = 0;

    const dayStart = availabilityInfo.availableTimeStart;
    const dayEnd = availabilityInfo.availableTimeEnd;

    for (let d = new Date(rangeStart); d <= weekEnd; d = addDays(d, 1)) {
      const dayStr = format(d, "yyyy-MM-dd");
      const dayName = format(d, "EEEE");

      // Get base available slots (considering calendar events)
      let slots = findAvailableSlots(calendarEvents, d, dayStart, dayEnd);

      // Filter out blocked times (work hours, vacations, holidays)
      const dayBlockedTimes = blockedTimes.filter(
        (b) => format(b.start, "yyyy-MM-dd") === dayStr
      );

      if (dayBlockedTimes.length > 0) {
        // Simple filtering: subtract blocked time from available slots
        for (const blocked of dayBlockedTimes) {
          slots = slots.filter((slot) => {
            // Remove slots that overlap with blocked times
            if (slot.end <= blocked.start || slot.start >= blocked.end) {
              return true; // No overlap
            }
            // Partial overlap - adjust slot
            if (slot.start < blocked.start && slot.end > blocked.end) {
              // Blocked time is in the middle - skip for simplicity
              return false;
            }
            return false;
          });
        }
      }

      const dayMinutes = slots.reduce((sum, slot) => sum + slot.duration, 0);
      totalAvailableMinutes += dayMinutes;

      breakdown.push({
        date: dayStr,
        dayName,
        availableMinutes: dayMinutes,
      });
    }

    // Get all tasks
    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { priority: "asc" },
    });

    // Get scheduled instances with dates for each task this week
    const scheduledInstancesWithDates = await prisma.scheduledTask.findMany({
      where: {
        taskId: { in: tasks.map(t => t.id) },
        scheduledDate: { gte: rangeStart, lte: weekEnd },
        status: { not: "skipped" },
      },
      select: { taskId: true, scheduledDate: true },
    });

    // Group scheduled dates by task
    const scheduledDatesByTask = new Map<string, Set<string>>();
    for (const st of scheduledInstancesWithDates) {
      if (!scheduledDatesByTask.has(st.taskId)) {
        scheduledDatesByTask.set(st.taskId, new Set());
      }
      scheduledDatesByTask.get(st.taskId)!.add(format(st.scheduledDate, "yyyy-MM-dd"));
    }

    // Use SHARED UTILITY to calculate remaining instances for each task
    // This ensures consistent behavior across all scheduling endpoints
    const getAchievableCount = (task: typeof tasks[0]): number => {
      const alreadyScheduledDates = scheduledDatesByTask.get(task.id) || new Set<string>();
      const { achievableCount } = calculateAchievableInstances(
        task,
        rangeStart,
        weekEnd,
        alreadyScheduledDates,
        now
      );
      return achievableCount;
    };

    // Determine which tasks still need scheduling (frequency-aware, future-only)
    const unscheduledTasks = tasks.filter((t) => {
      return getAchievableCount(t) > 0;
    });

    // Calculate total minutes needed (accounting for frequency)
    const totalTaskMinutes = unscheduledTasks.reduce((sum, t) => {
      const remainingInstances = getAchievableCount(t);
      return sum + (t.duration * remainingInstances);
    }, 0);

    return NextResponse.json({
      availableMinutes: totalAvailableMinutes,
      availableHours: Math.round(totalAvailableMinutes / 60 * 10) / 10,
      daysRemaining: breakdown.length,
      breakdown,
      unscheduledTasks: unscheduledTasks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        duration: t.duration,
        priority: t.priority,
      })),
      totalTaskMinutes,
      totalTaskHours: Math.round(totalTaskMinutes / 60 * 10) / 10,
      canFitAll: totalTaskMinutes <= totalAvailableMinutes,
    });
  } catch (error) {
    console.error("Error calculating available time:", error);
    return NextResponse.json(
      { error: "Failed to calculate available time" },
      { status: 500 }
    );
  }
}
