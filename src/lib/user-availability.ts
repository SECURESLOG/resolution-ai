/**
 * User Availability Helper
 *
 * Combines work schedule, vacations, and public holidays to determine
 * when a user is available for task scheduling.
 */

import prisma from "./prisma";
import { isPublicHoliday, getPublicHolidaysInRange } from "./public-holidays";
import { format, addDays, startOfDay, endOfDay, parseISO, isSameDay } from "date-fns";

interface WorkScheduleDay {
  dayOfWeek: string;
  isWorking: boolean;
  startTime: string | null;
  endTime: string | null;
  location: string;
  commuteToMin: number | null;
  commuteFromMin: number | null;
}

interface BlockedTime {
  start: Date;
  end: Date;
  reason: string;
  type: "work" | "commute" | "vacation" | "holiday";
}

interface UserAvailabilityInfo {
  country: string;
  bufferMinutes: number;
  availableTimeStart: number; // Hour (0-23), default 6am
  availableTimeEnd: number; // Hour (0-23), default 10pm
  workSchedule: WorkScheduleDay[];
  vacations: { startDate: Date; endDate: Date; note: string | null }[];
  blockedTimes: BlockedTime[];
}

const DEFAULT_WORK_SCHEDULE: WorkScheduleDay[] = [
  { dayOfWeek: "monday", isWorking: true, startTime: "09:00", endTime: "17:00", location: "home", commuteToMin: null, commuteFromMin: null },
  { dayOfWeek: "tuesday", isWorking: true, startTime: "09:00", endTime: "17:00", location: "home", commuteToMin: null, commuteFromMin: null },
  { dayOfWeek: "wednesday", isWorking: true, startTime: "09:00", endTime: "17:00", location: "home", commuteToMin: null, commuteFromMin: null },
  { dayOfWeek: "thursday", isWorking: true, startTime: "09:00", endTime: "17:00", location: "home", commuteToMin: null, commuteFromMin: null },
  { dayOfWeek: "friday", isWorking: true, startTime: "09:00", endTime: "17:00", location: "home", commuteToMin: null, commuteFromMin: null },
  { dayOfWeek: "saturday", isWorking: false, startTime: null, endTime: null, location: "home", commuteToMin: null, commuteFromMin: null },
  { dayOfWeek: "sunday", isWorking: false, startTime: null, endTime: null, location: "home", commuteToMin: null, commuteFromMin: null },
];

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Get user's availability information including work schedule, vacations, and country
 * If no work schedule exists, creates the default schedule in the database
 */
export async function getUserAvailabilityInfo(userId: string): Promise<UserAvailabilityInfo> {
  // Fetch user data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { country: true, bufferMinutes: true, availableTimeStart: true, availableTimeEnd: true },
  });

  // Fetch work schedule
  let workScheduleData = await prisma.userWorkSchedule.findMany({
    where: { userId },
  });

  // If no work schedule exists, create default schedule in database
  if (workScheduleData.length === 0) {
    try {
      await prisma.userWorkSchedule.createMany({
        data: DEFAULT_WORK_SCHEDULE.map((day) => ({
          userId,
          dayOfWeek: day.dayOfWeek,
          isWorking: day.isWorking,
          startTime: day.startTime,
          endTime: day.endTime,
          location: day.location,
          commuteToMin: day.commuteToMin,
          commuteFromMin: day.commuteFromMin,
        })),
        skipDuplicates: true,
      });
      // Re-fetch after creation
      workScheduleData = await prisma.userWorkSchedule.findMany({
        where: { userId },
      });
    } catch (error) {
      console.error("Error creating default work schedule:", error);
    }
  }

  // Fetch vacations
  const vacations = await prisma.userVacation.findMany({
    where: {
      userId,
      endDate: { gte: new Date() },
    },
    orderBy: { startDate: "asc" },
  });

  // Build work schedule, using defaults for missing days
  const workSchedule: WorkScheduleDay[] = DEFAULT_WORK_SCHEDULE.map((defaultDay) => {
    const userDay = workScheduleData.find((d) => d.dayOfWeek === defaultDay.dayOfWeek);
    if (userDay) {
      return {
        dayOfWeek: userDay.dayOfWeek,
        isWorking: userDay.isWorking,
        startTime: userDay.startTime,
        endTime: userDay.endTime,
        location: userDay.location,
        commuteToMin: userDay.commuteToMin,
        commuteFromMin: userDay.commuteFromMin,
      };
    }
    return defaultDay;
  });

  return {
    country: user?.country || "UK",
    bufferMinutes: user?.bufferMinutes ?? 0,
    availableTimeStart: user?.availableTimeStart ?? 6,
    availableTimeEnd: user?.availableTimeEnd ?? 22,
    workSchedule,
    vacations: vacations.map((v) => ({
      startDate: v.startDate,
      endDate: v.endDate,
      note: v.note,
    })),
    blockedTimes: [],
  };
}

/**
 * Get blocked time slots for a user on a specific date range
 * This includes work hours, commute time, vacations, and public holidays
 */
export async function getBlockedTimesForRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<BlockedTime[]> {
  const availabilityInfo = await getUserAvailabilityInfo(userId);
  const blockedTimes: BlockedTime[] = [];

  // Get public holidays for the date range
  const holidays = getPublicHolidaysInRange(availabilityInfo.country, startDate, endDate);

  // Iterate through each day in the range
  let currentDate = startOfDay(startDate);
  const end = endOfDay(endDate);

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const dayName = Object.keys(DAY_NAME_TO_INDEX).find(
      (name) => DAY_NAME_TO_INDEX[name] === dayOfWeek
    )!;
    const workDay = availabilityInfo.workSchedule.find((d) => d.dayOfWeek === dayName);

    // Check if this date is a vacation day
    const isOnVacation = availabilityInfo.vacations.some(
      (v) => currentDate >= startOfDay(v.startDate) && currentDate <= endOfDay(v.endDate)
    );

    if (isOnVacation) {
      // Block entire day for vacation
      blockedTimes.push({
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
        reason: "On vacation",
        type: "vacation",
      });
    } else {
      // Check if this is a public holiday
      const holiday = holidays.find((h) => {
        const effectiveDate = h.observed || h.date;
        return isSameDay(effectiveDate, currentDate);
      });

      if (holiday) {
        // Block entire day for public holiday
        blockedTimes.push({
          start: startOfDay(currentDate),
          end: endOfDay(currentDate),
          reason: `Public holiday: ${holiday.name}`,
          type: "holiday",
        });
      } else if (workDay && workDay.isWorking && workDay.startTime && workDay.endTime) {
        // Block work hours
        const [startHour, startMin] = workDay.startTime.split(":").map(Number);
        const [endHour, endMin] = workDay.endTime.split(":").map(Number);

        const workStart = new Date(currentDate);
        workStart.setHours(startHour, startMin, 0, 0);

        const workEnd = new Date(currentDate);
        workEnd.setHours(endHour, endMin, 0, 0);

        blockedTimes.push({
          start: workStart,
          end: workEnd,
          reason: "Working hours",
          type: "work",
        });

        // Add commute time for office days
        if (workDay.location === "office") {
          if (workDay.commuteToMin && workDay.commuteToMin > 0) {
            const commuteStart = new Date(workStart);
            commuteStart.setMinutes(commuteStart.getMinutes() - workDay.commuteToMin);
            blockedTimes.push({
              start: commuteStart,
              end: workStart,
              reason: "Commute to office",
              type: "commute",
            });
          }
          if (workDay.commuteFromMin && workDay.commuteFromMin > 0) {
            const commuteEnd = new Date(workEnd);
            commuteEnd.setMinutes(commuteEnd.getMinutes() + workDay.commuteFromMin);
            blockedTimes.push({
              start: workEnd,
              end: commuteEnd,
              reason: "Commute from office",
              type: "commute",
            });
          }
        }
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  return blockedTimes;
}

/**
 * Get available time boundaries for a specific date
 * Returns the start and end of available hours for personal tasks
 */
export function getAvailableHoursForDate(
  date: Date,
  workSchedule: WorkScheduleDay[],
  blockedTimes: BlockedTime[]
): { dayStart: number; dayEnd: number; isFullyBlocked: boolean } {
  // Check if the entire day is blocked (vacation or holiday)
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const fullDayBlock = blockedTimes.find(
    (b) =>
      (b.type === "vacation" || b.type === "holiday") &&
      b.start <= dayStart &&
      b.end >= dayEnd
  );

  if (fullDayBlock) {
    return { dayStart: 8, dayEnd: 8, isFullyBlocked: true };
  }

  // Default available hours: 8 AM to 9 PM
  return { dayStart: 8, dayEnd: 21, isFullyBlocked: false };
}

/**
 * Check if a user is available at a specific time
 */
export function isUserAvailableAt(
  date: Date,
  blockedTimes: BlockedTime[]
): { available: boolean; reason?: string } {
  for (const blocked of blockedTimes) {
    if (date >= blocked.start && date < blocked.end) {
      return { available: false, reason: blocked.reason };
    }
  }
  return { available: true };
}

/**
 * Format blocked times for display in the AI scheduler prompt
 */
export function formatBlockedTimesForPrompt(blockedTimes: BlockedTime[]): string {
  const grouped: Record<string, BlockedTime[]> = {};

  for (const blocked of blockedTimes) {
    const dateStr = format(blocked.start, "yyyy-MM-dd");
    if (!grouped[dateStr]) {
      grouped[dateStr] = [];
    }
    grouped[dateStr].push(blocked);
  }

  const lines: string[] = [];
  for (const [date, blocks] of Object.entries(grouped)) {
    const dayBlocks = blocks
      .map((b) => {
        if (b.type === "vacation" || b.type === "holiday") {
          return `  - ${b.reason} (entire day blocked)`;
        }
        return `  - ${format(b.start, "HH:mm")}-${format(b.end, "HH:mm")}: ${b.reason}`;
      })
      .join("\n");
    lines.push(`${date}:\n${dayBlocks}`);
  }

  return lines.join("\n");
}

export type { BlockedTime, UserAvailabilityInfo, WorkScheduleDay };
