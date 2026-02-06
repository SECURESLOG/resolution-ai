import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCalendarEvents, findAvailableSlots } from "@/lib/calendar";
import { getBlockedTimesForRange, getUserAvailabilityInfo } from "@/lib/user-availability";
import { calculateAchievableInstances } from "@/lib/deterministic-scheduler";
import { endOfWeek, addDays, format, parseISO, addMinutes } from "date-fns";
import { z } from "zod";

export const dynamic = "force-dynamic";

const quickFindSchema = z.object({
  taskId: z.string(),
  weekStart: z.string().optional(), // YYYY-MM-DD format
});

interface SlotOption {
  date: string;
  dayName: string;
  startTime: string;
  endTime: string;
  score: number;
}

// POST - Find the best time slots for a task (respecting frequency and fixed/flexible schedules)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, weekStart: weekStartParam } = quickFindSchema.parse(body);

    // Get the task
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: session.user.id,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Get user's availability info
    const availabilityInfo = await getUserAvailabilityInfo(session.user.id);

    // Calculate date range based on provided week or current week
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let rangeStart: Date;
    let weekEnd: Date;

    if (weekStartParam) {
      const providedStart = parseISO(weekStartParam);
      weekEnd = endOfWeek(providedStart, { weekStartsOn: 1 });
      rangeStart = providedStart < today ? today : providedStart;
    } else {
      rangeStart = today;
      weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    }

    // Get blocked times
    const blockedTimes = await getBlockedTimesForRange(session.user.id, rangeStart, weekEnd);

    // Get calendar events
    let calendarEvents: Awaited<ReturnType<typeof getCalendarEvents>> = [];
    try {
      calendarEvents = await getCalendarEvents(session.user.id, rangeStart, weekEnd);
    } catch {
      console.log("Calendar not connected");
    }

    // Get already scheduled instances of THIS task this week
    const existingScheduledForTask = await prisma.scheduledTask.findMany({
      where: {
        taskId: task.id,
        scheduledDate: { gte: rangeStart, lte: weekEnd },
        status: { not: "skipped" },
      },
    });

    // Get ALL scheduled tasks for conflict detection
    const allScheduledTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: rangeStart, lte: weekEnd },
        status: { not: "skipped" },
      },
    });

    // Task scheduling configuration
    const isFixedSchedule = task.schedulingMode === "fixed";
    const fixedDays = (task.fixedDays as string[] | null) || [];
    const fixedTime = task.fixedTime;
    const frequencyPeriod = task.frequencyPeriod || "week";
    const frequency = task.frequency || 1;
    const taskDuration = task.duration;
    const dayStart = availabilityInfo.availableTimeStart;
    const dayEnd = availabilityInfo.availableTimeEnd;

    // Map day names to day numbers (for slot finding loop)
    const dayNameToNumber: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    const allowedDayNumbers = fixedDays.map(d => dayNameToNumber[d.toLowerCase()]).filter(n => n !== undefined);

    // Build set of already scheduled dates for this task
    const alreadyScheduledDates = new Set<string>(
      existingScheduledForTask.map(st => format(st.scheduledDate, "yyyy-MM-dd"))
    );
    const alreadyScheduledCount = existingScheduledForTask.length;

    // Use SHARED UTILITY to calculate achievable slots (accounts for past days)
    // This ensures consistent behavior between Quick Schedule and Optimize My Week
    const { achievableCount: slotsNeeded, achievableDays } = calculateAchievableInstances(
      task,
      rangeStart,
      weekEnd,
      alreadyScheduledDates,
      now
    );

    console.log(`[quick-find] Using shared calculateAchievableInstances: slotsNeeded=${slotsNeeded}, achievableDays=${JSON.stringify(achievableDays)}`);

    if (slotsNeeded === 0) {
      return NextResponse.json({
        success: true,
        message: "Task is already fully scheduled for this week",
        task: { id: task.id, name: task.name, duration: task.duration, type: task.type },
        options: [],
        slotsNeeded: 0,
        alreadyScheduled: alreadyScheduledCount,
      });
    }

    // Find all available slots
    const allSlotOptions: SlotOption[] = [];

    console.log(`[quick-find] Task: ${task.name}, fixedTime: ${fixedTime}, fixedDays: ${JSON.stringify(fixedDays)}`);
    console.log(`[quick-find] rangeStart: ${format(rangeStart, "yyyy-MM-dd")}, weekEnd: ${format(weekEnd, "yyyy-MM-dd")}`);
    console.log(`[quick-find] allowedDayNumbers: ${JSON.stringify(allowedDayNumbers)}`);
    console.log(`[quick-find] blockedTimes count: ${blockedTimes.length}`);
    blockedTimes.forEach(bt => {
      console.log(`[quick-find] Blocked: ${format(bt.start, "yyyy-MM-dd HH:mm")} - ${format(bt.end, "yyyy-MM-dd HH:mm")}`);
    });

    for (let d = new Date(rangeStart); d <= weekEnd; d = addDays(d, 1)) {
      const dayStr = format(d, "yyyy-MM-dd");
      const dayOfWeek = d.getDay();

      // Skip days not in fixed schedule
      if (isFixedSchedule && allowedDayNumbers.length > 0 && !allowedDayNumbers.includes(dayOfWeek)) {
        console.log(`[quick-find] Skipping ${dayStr} - not in allowed days (dayOfWeek=${dayOfWeek})`);
        continue;
      }

      // Skip days where this task is already scheduled
      const alreadyScheduledOnDay = existingScheduledForTask.some(
        st => format(st.scheduledDate, "yyyy-MM-dd") === dayStr
      );
      if (alreadyScheduledOnDay) {
        continue;
      }

      // For fixed TIME tasks
      if (isFixedSchedule && fixedTime) {
        const [fixedHour, fixedMinute] = fixedTime.split(":").map(Number);
        const fixedStart = new Date(d);
        fixedStart.setHours(fixedHour, fixedMinute, 0, 0);
        const fixedEnd = addMinutes(fixedStart, taskDuration);

        console.log(`[quick-find] Checking ${dayStr} at ${fixedTime}: fixedStart=${fixedStart.toISOString()}, now=${now.toISOString()}, isPast=${fixedStart <= now}`);

        if (fixedStart <= now) {
          console.log(`[quick-find] Skipping ${dayStr} - fixed time in past`);
          continue;
        }

        // Check conflicts
        const hasConflict = checkConflicts(fixedStart, fixedEnd, dayStr, calendarEvents, blockedTimes, allScheduledTasks);
        console.log(`[quick-find] ${dayStr} at ${fixedTime}: hasConflict=${hasConflict}`);

        if (!hasConflict) {
          console.log(`[quick-find] Adding slot: ${dayStr} at ${fixedTime}`);
          allSlotOptions.push({
            date: dayStr,
            dayName: format(d, "EEEE"),
            startTime: fixedTime,
            endTime: format(fixedEnd, "HH:mm"),
            score: 200 + (7 - dayOfWeek), // Prefer earlier in week
          });
        }
        continue;
      }

      // For flexible schedule - find available slots
      const slots = findAvailableSlots(calendarEvents, d, dayStart, dayEnd);
      const dayBlockedTimes = blockedTimes.filter(b => format(b.start, "yyyy-MM-dd") === dayStr);
      const dayScheduledTasks = allScheduledTasks.filter(st => format(st.scheduledDate, "yyyy-MM-dd") === dayStr);

      for (const slot of slots) {
        if (slot.start <= now) continue;

        const allBlockedPeriods = [
          ...dayBlockedTimes.map(b => ({ start: b.start, end: b.end })),
          ...dayScheduledTasks.map(st => ({ start: st.startTime, end: st.endTime })),
        ].sort((a, b) => a.start.getTime() - b.start.getTime());

        let searchStart = slot.start;
        const searchEnd = slot.end;

        while (searchStart < searchEnd) {
          const nextBlocked = allBlockedPeriods.find(
            b => b.end > searchStart && b.start < searchEnd
          );

          const availableEnd = nextBlocked ? nextBlocked.start : searchEnd;
          const availableDuration = (availableEnd.getTime() - searchStart.getTime()) / 60000;

          if (searchStart > now && availableDuration >= taskDuration) {
            let score = 100;
            const hour = searchStart.getHours();
            if (task.type === "resolution") {
              if (hour >= 8 && hour <= 12) score += 20;
              else if (hour >= 14 && hour <= 17) score += 10;
            } else {
              if (hour >= 14 && hour <= 19) score += 15;
            }
            const daysFromNow = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            score -= daysFromNow * 3;

            allSlotOptions.push({
              date: dayStr,
              dayName: format(d, "EEEE"),
              startTime: format(searchStart, "HH:mm"),
              endTime: format(addMinutes(searchStart, taskDuration), "HH:mm"),
              score,
            });
          }

          if (nextBlocked) {
            searchStart = nextBlocked.end;
          } else {
            break;
          }
        }
      }
    }

    // Sort by score and select best slots (spread across different days for flexible)
    allSlotOptions.sort((a, b) => b.score - a.score);

    let selectedSlots: SlotOption[] = [];

    if (isFixedSchedule) {
      // For fixed: take all available slots (they're already filtered to fixed days)
      selectedSlots = allSlotOptions.slice(0, slotsNeeded);
    } else {
      // For flexible: spread across different days
      const usedDays = new Set<string>();
      for (const slot of allSlotOptions) {
        if (selectedSlots.length >= slotsNeeded) break;
        if (!usedDays.has(slot.date)) {
          selectedSlots.push(slot);
          usedDays.add(slot.date);
        }
      }
      // If we still need more slots, allow multiple on same day
      if (selectedSlots.length < slotsNeeded) {
        for (const slot of allSlotOptions) {
          if (selectedSlots.length >= slotsNeeded) break;
          if (!selectedSlots.includes(slot)) {
            selectedSlots.push(slot);
          }
        }
      }
    }

    // Sort selected slots by date for display
    selectedSlots.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    if (selectedSlots.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No available time slots found this week",
        task: { id: task.id, name: task.name, duration: task.duration, type: task.type },
        options: [],
        slotsNeeded,
        alreadyScheduled: alreadyScheduledCount,
      });
    }

    return NextResponse.json({
      success: true,
      task: { id: task.id, name: task.name, duration: task.duration, type: task.type },
      options: selectedSlots,
      slotsNeeded,
      foundSlots: selectedSlots.length,
      alreadyScheduled: alreadyScheduledCount,
      isFixedSchedule,
      frequency: frequencyPeriod === "day" ? `${frequency}x daily` : `${frequency}x weekly`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error finding time slot:", error);
    return NextResponse.json({ error: "Failed to find time slot" }, { status: 500 });
  }
}

function checkConflicts(
  start: Date,
  end: Date,
  dayStr: string,
  calendarEvents: Awaited<ReturnType<typeof getCalendarEvents>>,
  blockedTimes: { start: Date; end: Date }[],
  scheduledTasks: { scheduledDate: Date; startTime: Date; endTime: Date }[]
): boolean {
  // Check calendar events
  const hasCalendarConflict = calendarEvents.some(event => {
    const eventStart = typeof event.start === 'string' ? parseISO(event.start) :
      event.start instanceof Date ? event.start :
      event.start.dateTime ? parseISO(event.start.dateTime) : null;
    const eventEnd = typeof event.end === 'string' ? parseISO(event.end) :
      event.end instanceof Date ? event.end :
      event.end.dateTime ? parseISO(event.end.dateTime) : null;
    if (!eventStart || !eventEnd) return false;
    const conflicts = start < eventEnd && end > eventStart;
    if (conflicts) {
      console.log(`[checkConflicts] Calendar conflict: ${event.summary} (${eventStart.toISOString()} - ${eventEnd.toISOString()})`);
    }
    return conflicts;
  });
  if (hasCalendarConflict) return true;

  // Check blocked times
  const hasBlockedConflict = blockedTimes.some(b => {
    const conflicts = format(b.start, "yyyy-MM-dd") === dayStr && start < b.end && end > b.start;
    if (conflicts) {
      console.log(`[checkConflicts] Blocked time conflict: ${format(b.start, "yyyy-MM-dd HH:mm")} - ${format(b.end, "HH:mm")}`);
    }
    return conflicts;
  });
  if (hasBlockedConflict) return true;

  // Check scheduled tasks
  const hasScheduledConflict = scheduledTasks.some(st => {
    const conflicts = format(st.scheduledDate, "yyyy-MM-dd") === dayStr && start < st.endTime && end > st.startTime;
    if (conflicts) {
      console.log(`[checkConflicts] Scheduled task conflict on ${dayStr}: ${format(st.startTime, "HH:mm")} - ${format(st.endTime, "HH:mm")}`);
    }
    return conflicts;
  });
  return hasScheduledConflict;
}
