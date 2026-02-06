import { Task } from "@prisma/client";
import { format, addDays } from "date-fns";
import { TimeSlot } from "@/types";
import { BlockedTime } from "./user-availability";
import { findAvailableSlots } from "./calendar";
import { CalendarEvent } from "@/types";

/**
 * Represents a single instance of a task that needs to be scheduled
 */
export interface TaskInstance {
  taskId: string;
  taskName: string;
  taskType: string;
  duration: number;
  priority: number;
  category: string | null;
  instanceNumber: number;
  totalInstances: number;
  assignedDay: string; // YYYY-MM-DD
  dayName: string; // Monday, Tuesday, etc.
  // Constraints
  fixedTime: string | null; // HH:mm if task has fixed time
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  // For conflict reporting
  originalTask: Task;
}

/**
 * Result of scheduling a task instance
 */
export interface ScheduledInstance {
  taskInstance: TaskInstance;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  reasoning: string;
  isConflict: boolean;
  conflictReason?: string;
}

/**
 * Available slots organized by day
 */
export interface DayAvailability {
  date: string; // YYYY-MM-DD
  dayName: string;
  slots: TimeSlot[];
  totalMinutes: number;
}

export const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

const NUMBER_TO_DAY_NAME: string[] = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

/**
 * SHARED UTILITY: Calculate achievable instances for a task based on FUTURE available days
 * This accounts for:
 * - Past days that can no longer be scheduled (ignored, not conflicts)
 * - Today's fixed time if it has passed (ignored, not conflicts)
 * - Days already scheduled (subtracted from needed count)
 *
 * Used by both "Optimize My Week" and "Quick Schedule"
 */
export function calculateAchievableInstances(
  task: Task,
  weekStart: Date,
  weekEnd: Date,
  alreadyScheduledDates: Set<string>,
  now?: Date
): { achievableCount: number; achievableDays: string[] } {
  const currentTime = now || new Date();
  const today = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());

  const isFixedSchedule = task.schedulingMode === "fixed";
  const fixedDays = (task.fixedDays as string[] | null) || [];
  const requiredDays = (task.requiredDays as string[] | null) || [];
  const fixedTime = task.fixedTime;
  const frequency = task.frequency || 1;
  const frequencyPeriod = task.frequencyPeriod || "week";

  // Convert day names to numbers for fixed/required days
  const allowedDayNumbers = new Set<number>();
  if (isFixedSchedule && fixedDays.length > 0) {
    fixedDays.forEach(d => {
      const num = DAY_NAME_TO_NUMBER[d.toLowerCase()];
      if (num !== undefined) allowedDayNumbers.add(num);
    });
  } else if (requiredDays.length > 0) {
    requiredDays.forEach(d => {
      const num = DAY_NAME_TO_NUMBER[d.toLowerCase()];
      if (num !== undefined) allowedDayNumbers.add(num);
    });
  }

  const achievableDays: string[] = [];

  // Iterate through the week and count achievable days
  for (let d = new Date(weekStart); d <= weekEnd; d = addDays(d, 1)) {
    const dateStr = format(d, "yyyy-MM-dd");
    const dayNumber = d.getDay();
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    // Skip past days
    if (dayStart < today) {
      continue;
    }

    // For today with fixed time: skip if fixed time has already passed
    if (dayStart.getTime() === today.getTime() && fixedTime) {
      const [fixedHour, fixedMin] = fixedTime.split(":").map(Number);
      const fixedDateTime = new Date(d);
      fixedDateTime.setHours(fixedHour, fixedMin, 0, 0);
      if (fixedDateTime <= currentTime) {
        continue; // Fixed time already passed today - ignore, not a conflict
      }
    }

    // Skip days already scheduled for this task
    if (alreadyScheduledDates.has(dateStr)) {
      continue;
    }

    // For fixed schedule: skip days not in allowed days
    if (isFixedSchedule && allowedDayNumbers.size > 0 && !allowedDayNumbers.has(dayNumber)) {
      continue;
    }

    // For flexible with required days: skip days not in required days
    if (!isFixedSchedule && allowedDayNumbers.size > 0 && !allowedDayNumbers.has(dayNumber)) {
      continue;
    }

    achievableDays.push(dateStr);
  }

  // Calculate achievable count based on task type
  // IMPORTANT: Must subtract already scheduled instances to avoid duplicates
  const alreadyScheduledCount = alreadyScheduledDates.size;
  let achievableCount: number;

  if (isFixedSchedule && fixedDays.length > 0) {
    // Fixed schedule: can only schedule on achievable fixed days
    // The achievableDays already excludes scheduled dates, so just use its length
    achievableCount = achievableDays.length;
  } else if (frequencyPeriod === "day") {
    // Daily frequency: need instances for each achievable day
    // achievableDays already excludes scheduled dates
    achievableCount = achievableDays.length * frequency;
  } else {
    // Weekly frequency: need (frequency - alreadyScheduled) more instances
    // Limited by available days
    const stillNeeded = Math.max(0, frequency - alreadyScheduledCount);
    achievableCount = Math.min(stillNeeded, achievableDays.length);
  }

  console.log(`[calculateAchievableInstances] ${task.name}: freq=${frequency}/${frequencyPeriod}, alreadyScheduled=${alreadyScheduledCount}, achievableDays=${achievableDays.length}, achievableCount=${achievableCount}`);

  return { achievableCount, achievableDays };
}

/**
 * @deprecated Use calculateAchievableInstances instead for accurate future-aware calculation
 * Kept for backward compatibility - calculates total needed without date context
 */
export function calculateInstancesNeeded(task: Task, alreadyScheduledCount: number): number {
  const isFixedSchedule = task.schedulingMode === "fixed";
  const fixedDays = (task.fixedDays as string[] | null) || [];
  const frequency = task.frequency || 1;
  const frequencyPeriod = task.frequencyPeriod || "week";

  let totalNeeded: number;

  if (isFixedSchedule && fixedDays.length > 0) {
    // Fixed schedule: need one instance per fixed day
    totalNeeded = fixedDays.length;
  } else if (frequencyPeriod === "day") {
    // Daily frequency: need instances for each day of week (7 days)
    totalNeeded = 7 * frequency;
  } else {
    // Weekly frequency
    totalNeeded = frequency;
  }

  // Subtract already scheduled instances
  return Math.max(0, totalNeeded - alreadyScheduledCount);
}

/**
 * Get available days in the week range, respecting constraints
 */
function getAvailableDays(
  weekStart: Date,
  weekEnd: Date,
  task: Task,
  alreadyScheduledDates: Set<string>
): { date: Date; dateStr: string; dayName: string; dayNumber: number }[] {
  const isFixedSchedule = task.schedulingMode === "fixed";
  const fixedDays = (task.fixedDays as string[] | null) || [];
  const requiredDays = (task.requiredDays as string[] | null) || [];
  const fixedTime = task.fixedTime;

  // Convert day names to numbers
  const allowedDayNumbers = new Set<number>();

  if (isFixedSchedule && fixedDays.length > 0) {
    fixedDays.forEach(d => {
      const num = DAY_NAME_TO_NUMBER[d.toLowerCase()];
      if (num !== undefined) allowedDayNumbers.add(num);
    });
  } else if (requiredDays.length > 0) {
    requiredDays.forEach(d => {
      const num = DAY_NAME_TO_NUMBER[d.toLowerCase()];
      if (num !== undefined) allowedDayNumbers.add(num);
    });
  }

  const availableDays: { date: Date; dateStr: string; dayName: string; dayNumber: number }[] = [];
  const now = new Date();

  console.log(`[getAvailableDays] now: ${now.toISOString()}, weekStart: ${format(weekStart, "yyyy-MM-dd")}, fixedTime: ${fixedTime}`);
  console.log(`[getAvailableDays] allowedDayNumbers:`, Array.from(allowedDayNumbers));

  for (let d = new Date(weekStart); d <= weekEnd; d = addDays(d, 1)) {
    const dateStr = format(d, "yyyy-MM-dd");
    const dayNumber = d.getDay();
    const dayName = NUMBER_TO_DAY_NAME[dayNumber];

    // Skip past dates (but allow today)
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    if (dayStart < todayStart) {
      console.log(`[getAvailableDays] Skipping ${dateStr} - past date`);
      continue;
    }

    // For today with fixed time: skip if fixed time has already passed
    if (dayStart.getTime() === todayStart.getTime() && fixedTime) {
      const [fixedHour, fixedMin] = fixedTime.split(":").map(Number);
      const fixedDateTime = new Date(d);
      fixedDateTime.setHours(fixedHour, fixedMin, 0, 0);
      if (fixedDateTime <= now) {
        console.log(`[getAvailableDays] Skipping ${dateStr} - fixed time ${fixedTime} already passed (now: ${format(now, "HH:mm")})`);
        continue; // Fixed time already passed today
      }
    }

    // Skip days where this task is already scheduled
    if (alreadyScheduledDates.has(dateStr)) {
      console.log(`[getAvailableDays] Skipping ${dateStr} - already scheduled`);
      continue;
    }

    // Skip days not in allowed days (if constraints exist)
    if (allowedDayNumbers.size > 0 && !allowedDayNumbers.has(dayNumber)) {
      console.log(`[getAvailableDays] Skipping ${dateStr} (${dayName}) - not in allowed days`);
      continue;
    }

    console.log(`[getAvailableDays] Including ${dateStr} (${dayName})`);
    availableDays.push({ date: new Date(d), dateStr, dayName, dayNumber });
  }

  return availableDays;
}

/**
 * Assign days for flexible frequency tasks (spread evenly)
 */
function assignDaysForFlexibleTask(
  availableDays: { date: Date; dateStr: string; dayName: string; dayNumber: number }[],
  instancesNeeded: number
): { date: Date; dateStr: string; dayName: string; dayNumber: number }[] {
  if (instancesNeeded >= availableDays.length) {
    // Need more instances than available days - use all days
    // (some days might need multiple instances, handled elsewhere)
    return availableDays.slice(0, instancesNeeded);
  }

  // Spread evenly across available days
  const assigned: typeof availableDays = [];
  const spacing = availableDays.length / instancesNeeded;

  for (let i = 0; i < instancesNeeded; i++) {
    const index = Math.min(Math.floor(i * spacing), availableDays.length - 1);
    if (!assigned.includes(availableDays[index])) {
      assigned.push(availableDays[index]);
    } else {
      // Find next available day not yet assigned
      for (const day of availableDays) {
        if (!assigned.includes(day)) {
          assigned.push(day);
          break;
        }
      }
    }
  }

  return assigned;
}

/**
 * PHASE 1: Expand tasks into individual instances with assigned days
 *
 * Key behavior:
 * - Only schedules tasks in the FUTURE (past days are ignored, not conflicts)
 * - Respects already scheduled instances (won't duplicate)
 * - Uses calculateAchievableInstances() for accurate instance counts
 */
export function expandTasksToInstances(
  tasks: Task[],
  weekStart: Date,
  weekEnd: Date,
  existingScheduledByTask: Map<string, { count: number; dates: Set<string> }>
): { instances: TaskInstance[]; conflicts: { taskId: string; taskName: string; reason: string }[] } {
  const instances: TaskInstance[] = [];
  const conflicts: { taskId: string; taskName: string; reason: string }[] = [];
  const now = new Date();

  console.log("[expandTasksToInstances] weekStart:", format(weekStart, "yyyy-MM-dd"), "weekEnd:", format(weekEnd, "yyyy-MM-dd"), "now:", format(now, "yyyy-MM-dd HH:mm"));

  for (const task of tasks) {
    const existing = existingScheduledByTask.get(task.id) || { count: 0, dates: new Set<string>() };

    // Use the new shared utility to calculate achievable instances
    const { achievableCount, achievableDays } = calculateAchievableInstances(
      task,
      weekStart,
      weekEnd,
      existing.dates,
      now
    );

    console.log(`[expandTasksToInstances] Task: ${task.name}, achievableCount: ${achievableCount}, achievableDays: ${JSON.stringify(achievableDays)}, existing.count: ${existing.count}`);

    if (achievableCount === 0) {
      // No achievable instances - either fully scheduled or all days are in the past
      // This is NOT a conflict - past days are simply ignored
      console.log(`[expandTasksToInstances] Skipping ${task.name} - no achievable instances (fully scheduled or past)`);
      continue;
    }

    // Get available days with full details for instance creation
    const availableDays = getAvailableDays(weekStart, weekEnd, task, existing.dates);
    console.log(`[expandTasksToInstances] availableDays for ${task.name}:`, availableDays.map(d => d.dateStr));

    if (availableDays.length === 0) {
      // No available days in the future - this is NOT a conflict for past days
      // Only report as conflict if there were theoretically achievable days but none available
      console.log(`[expandTasksToInstances] No available days for ${task.name} - skipping (past days ignored)`);
      continue;
    }

    // Assign days based on scheduling mode
    const isFixedSchedule = task.schedulingMode === "fixed";
    let assignedDays: typeof availableDays;

    if (isFixedSchedule) {
      // Fixed schedule: use all available days (already filtered to fixed days)
      assignedDays = availableDays.slice(0, achievableCount);
    } else {
      // Flexible: spread across days
      assignedDays = assignDaysForFlexibleTask(availableDays, achievableCount);
    }

    // Create instances for assigned days
    // Note: No conflict is created for past days - they are simply ignored
    const totalInstances = existing.count + assignedDays.length;

    for (let i = 0; i < assignedDays.length; i++) {
      const day = assignedDays[i];
      instances.push({
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
        duration: task.duration,
        priority: task.priority,
        category: task.category,
        instanceNumber: existing.count + i + 1,
        totalInstances,
        assignedDay: day.dateStr,
        dayName: day.dayName,
        fixedTime: task.fixedTime,
        preferredTimeStart: task.preferredTimeStart,
        preferredTimeEnd: task.preferredTimeEnd,
        originalTask: task,
      });
    }
  }

  // Sort instances by priority, then by day
  instances.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.assignedDay.localeCompare(b.assignedDay);
  });

  return { instances, conflicts };
}

/**
 * Calculate available time slots for a day, excluding blocked times and calendar events
 */
export function calculateDayAvailability(
  date: Date,
  calendarEvents: CalendarEvent[],
  blockedTimes: BlockedTime[],
  scheduledInstances: ScheduledInstance[],
  dayStart: number,
  dayEnd: number
): DayAvailability {
  const dateStr = format(date, "yyyy-MM-dd");
  const dayName = NUMBER_TO_DAY_NAME[date.getDay()];

  // Get base available slots from calendar
  let slots = findAvailableSlots(calendarEvents, date, dayStart, dayEnd);

  // Filter out blocked times
  const dayBlockedTimes = blockedTimes.filter(
    b => format(b.start, "yyyy-MM-dd") === dateStr
  );

  if (dayBlockedTimes.length > 0) {
    slots = filterSlotsAroundBlockedTimes(slots, dayBlockedTimes);
  }

  // Filter out already scheduled instances for this day
  const dayScheduled = scheduledInstances.filter(
    s => s.taskInstance.assignedDay === dateStr && !s.isConflict
  );

  if (dayScheduled.length > 0) {
    slots = filterSlotsAroundScheduled(slots, dayScheduled, date);
  }

  const totalMinutes = slots.reduce((sum, s) => sum + s.duration, 0);

  return { date: dateStr, dayName, slots, totalMinutes };
}

/**
 * Filter slots to exclude blocked times
 */
function filterSlotsAroundBlockedTimes(slots: TimeSlot[], blockedTimes: BlockedTime[]): TimeSlot[] {
  const filtered: TimeSlot[] = [];

  for (const slot of slots) {
    let currentStart = slot.start;
    const slotEnd = slot.end;

    const relevantBlocks = blockedTimes
      .filter(b => b.start < slotEnd && b.end > slot.start)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (relevantBlocks.length === 0) {
      filtered.push(slot);
      continue;
    }

    for (const block of relevantBlocks) {
      if (currentStart < block.start) {
        const duration = Math.floor((block.start.getTime() - currentStart.getTime()) / 60000);
        if (duration >= 15) {
          filtered.push({
            start: new Date(currentStart),
            end: new Date(block.start),
            duration,
          });
        }
      }
      if (block.end > currentStart) {
        currentStart = block.end;
      }
    }

    if (currentStart < slotEnd) {
      const duration = Math.floor((slotEnd.getTime() - currentStart.getTime()) / 60000);
      if (duration >= 15) {
        filtered.push({
          start: new Date(currentStart),
          end: new Date(slotEnd),
          duration,
        });
      }
    }
  }

  return filtered;
}

/**
 * Filter slots to exclude already scheduled instances
 */
function filterSlotsAroundScheduled(
  slots: TimeSlot[],
  scheduled: ScheduledInstance[],
  date: Date
): TimeSlot[] {
  // Convert scheduled instances to blocked time format
  const scheduledBlocks = scheduled.map(s => {
    const [startHour, startMin] = s.startTime.split(":").map(Number);
    const [endHour, endMin] = s.endTime.split(":").map(Number);

    const start = new Date(date);
    start.setHours(startHour, startMin, 0, 0);

    const end = new Date(date);
    end.setHours(endHour, endMin, 0, 0);

    return { start, end };
  });

  return filterSlotsAroundBlockedTimes(slots, scheduledBlocks as BlockedTime[]);
}

/**
 * Find the first available slot that fits the duration
 */
export function findFirstAvailableSlot(
  availability: DayAvailability,
  duration: number,
  fixedTime: string | null,
  preferredTimeStart: string | null,
  preferredTimeEnd: string | null
): { startTime: string; endTime: string } | null {
  const { slots, date } = availability;

  // If fixed time, check if that specific time is available
  if (fixedTime) {
    const [fixedHour, fixedMin] = fixedTime.split(":").map(Number);
    const fixedStart = new Date(date + "T00:00:00");
    fixedStart.setHours(fixedHour, fixedMin, 0, 0);
    const fixedEnd = new Date(fixedStart);
    fixedEnd.setMinutes(fixedEnd.getMinutes() + duration);

    for (const slot of slots) {
      if (slot.start <= fixedStart && slot.end >= fixedEnd) {
        return {
          startTime: fixedTime,
          endTime: format(fixedEnd, "HH:mm"),
        };
      }
    }
    // Fixed time not available
    return null;
  }

  // If preferred time range, try to find slot within that range first
  if (preferredTimeStart && preferredTimeEnd) {
    const [prefStartHour, prefStartMin] = preferredTimeStart.split(":").map(Number);
    const [prefEndHour, prefEndMin] = preferredTimeEnd.split(":").map(Number);

    for (const slot of slots) {
      const slotStartHour = slot.start.getHours();
      const slotStartMin = slot.start.getMinutes();
      const slotStartTotal = slotStartHour * 60 + slotStartMin;
      const prefStartTotal = prefStartHour * 60 + prefStartMin;
      const prefEndTotal = prefEndHour * 60 + prefEndMin;

      // Check if slot overlaps with preferred range
      if (slotStartTotal >= prefStartTotal && slotStartTotal < prefEndTotal) {
        if (slot.duration >= duration) {
          const endTime = new Date(slot.start);
          endTime.setMinutes(endTime.getMinutes() + duration);
          return {
            startTime: format(slot.start, "HH:mm"),
            endTime: format(endTime, "HH:mm"),
          };
        }
      }
    }
  }

  // Fallback: first available slot that fits
  for (const slot of slots) {
    if (slot.duration >= duration) {
      const endTime = new Date(slot.start);
      endTime.setMinutes(endTime.getMinutes() + duration);
      return {
        startTime: format(slot.start, "HH:mm"),
        endTime: format(endTime, "HH:mm"),
      };
    }
  }

  return null;
}

/**
 * PHASE 3: Schedule all instances deterministically (fallback if AI fails)
 */
export function scheduleInstancesDeterministically(
  instances: TaskInstance[],
  calendarEvents: CalendarEvent[],
  blockedTimes: BlockedTime[],
  dayStart: number,
  dayEnd: number
): ScheduledInstance[] {
  const results: ScheduledInstance[] = [];

  // Group instances by day for efficient processing
  const instancesByDay = new Map<string, TaskInstance[]>();
  for (const instance of instances) {
    const day = instance.assignedDay;
    if (!instancesByDay.has(day)) {
      instancesByDay.set(day, []);
    }
    instancesByDay.get(day)!.push(instance);
  }

  // Process each day
  Array.from(instancesByDay.entries()).forEach(([dateStr, dayInstances]) => {
    const date = new Date(dateStr + "T12:00:00"); // Noon to avoid timezone issues

    // Calculate current availability for this day
    const availability = calculateDayAvailability(
      date,
      calendarEvents,
      blockedTimes,
      results, // Pass already scheduled results
      dayStart,
      dayEnd
    );

    // Schedule each instance
    for (const instance of dayInstances) {
      const slot = findFirstAvailableSlot(
        availability,
        instance.duration,
        instance.fixedTime,
        instance.preferredTimeStart,
        instance.preferredTimeEnd
      );

      if (slot) {
        const result: ScheduledInstance = {
          taskInstance: instance,
          startTime: slot.startTime,
          endTime: slot.endTime,
          reasoning: generateDeterministicReasoning(instance, slot),
          isConflict: false,
        };
        results.push(result);

        // Update availability for next instance on same day
        // Recalculate to account for newly scheduled instance
        const updatedAvailability = calculateDayAvailability(
          date,
          calendarEvents,
          blockedTimes,
          results,
          dayStart,
          dayEnd
        );
        Object.assign(availability, updatedAvailability);
      } else {
        // No slot available - mark as conflict
        results.push({
          taskInstance: instance,
          startTime: "",
          endTime: "",
          reasoning: "",
          isConflict: true,
          conflictReason: instance.fixedTime
            ? `No available slot at ${instance.fixedTime} on ${instance.dayName}`
            : `No ${instance.duration}-minute slot available on ${instance.dayName}`,
        });
      }
    }
  });

  return results;
}

/**
 * Generate reasoning for deterministically scheduled tasks
 */
function generateDeterministicReasoning(instance: TaskInstance, slot: { startTime: string; endTime: string }): string {
  const parts: string[] = [];

  if (instance.fixedTime) {
    parts.push(`Scheduled at your fixed time of ${instance.fixedTime}`);
  } else if (instance.preferredTimeStart && instance.preferredTimeEnd) {
    parts.push(`Scheduled within your preferred time window (${instance.preferredTimeStart}-${instance.preferredTimeEnd})`);
  } else {
    parts.push(`Scheduled at first available slot (${slot.startTime})`);
  }

  if (instance.totalInstances > 1) {
    parts.push(`This is session ${instance.instanceNumber} of ${instance.totalInstances} for the week`);
  }

  return parts.join(". ") + ".";
}
