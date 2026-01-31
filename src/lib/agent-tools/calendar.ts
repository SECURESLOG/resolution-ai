/**
 * Calendar Tools for AI Agents
 *
 * These tools allow agents to read and analyze calendar data
 * from Google Calendar and external ICS feeds.
 */

import prisma from "@/lib/prisma";
import { google } from "googleapis";
import { parseISO, startOfDay, endOfDay, format } from "date-fns";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  source: "google" | "external";
  calendarName?: string;
}

interface CalendarTimeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

/**
 * Get all calendar events for a user within a date range
 * Combines Google Calendar events and external ICS calendar events
 */
export async function getCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  // Get Google Calendar events
  const googleEvents = await getGoogleCalendarEvents(userId, startDate, endDate);
  events.push(...googleEvents);

  // Get external calendar events
  const externalEvents = await getExternalCalendarEvents(userId, startDate, endDate);
  events.push(...externalEvents);

  // Sort by start time
  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  return events;
}

/**
 * Get events from Google Calendar
 */
async function getGoogleCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  try {
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
    });

    if (!account?.access_token) {
      return [];
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    return (response.data.items || []).map((event) => ({
      id: event.id || "",
      summary: event.summary || "Untitled",
      description: event.description || undefined,
      start: event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
        ? startOfDay(parseISO(event.start.date))
        : new Date(),
      end: event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
        ? endOfDay(parseISO(event.end.date))
        : new Date(),
      isAllDay: !event.start?.dateTime,
      source: "google" as const,
      calendarName: "Google Calendar",
    }));
  } catch (error) {
    console.error("Error fetching Google Calendar events:", error);
    return [];
  }
}

/**
 * Get events from external ICS calendars
 */
async function getExternalCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  try {
    const externalCalendars = await prisma.externalCalendar.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    const events: CalendarEvent[] = [];

    for (const calendar of externalCalendars) {
      try {
        const response = await fetch(calendar.url, {
          headers: { Accept: "text/calendar" },
        });

        if (!response.ok) continue;

        const icsContent = await response.text();
        const parsedEvents = parseICSContent(icsContent, startDate, endDate, calendar.name);
        events.push(...parsedEvents);
      } catch (error) {
        console.error(`Error fetching calendar ${calendar.name}:`, error);
      }
    }

    return events;
  } catch (error) {
    console.error("Error fetching external calendars:", error);
    return [];
  }
}

/**
 * Parse ICS content and extract events within date range
 */
function parseICSContent(
  icsContent: string,
  startDate: Date,
  endDate: Date,
  calendarName: string
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const eventBlocks = icsContent.split("BEGIN:VEVENT");

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];

    const summary = extractICSField(block, "SUMMARY") || "Untitled";
    const description = extractICSField(block, "DESCRIPTION");
    const dtstart = extractICSField(block, "DTSTART");
    const dtend = extractICSField(block, "DTEND");
    const uid = extractICSField(block, "UID") || `external-${i}`;

    if (!dtstart) continue;

    const start = parseICSDate(dtstart);
    const end = dtend ? parseICSDate(dtend) : new Date(start.getTime() + 3600000);

    // Check if event falls within date range
    if (end >= startDate && start <= endDate) {
      events.push({
        id: uid,
        summary,
        description,
        start,
        end,
        isAllDay: dtstart.length === 8, // YYYYMMDD format indicates all-day
        source: "external",
        calendarName,
      });
    }
  }

  return events;
}

function extractICSField(block: string, field: string): string | undefined {
  const regex = new RegExp(`${field}[^:]*:(.+?)(?:\\r?\\n|$)`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : undefined;
}

function parseICSDate(dateStr: string): Date {
  // Handle YYYYMMDD format
  if (dateStr.length === 8) {
    return new Date(
      parseInt(dateStr.substring(0, 4)),
      parseInt(dateStr.substring(4, 6)) - 1,
      parseInt(dateStr.substring(6, 8))
    );
  }
  // Handle YYYYMMDDTHHMMSSZ format
  const cleaned = dateStr.replace(/[TZ]/g, "");
  return new Date(
    parseInt(cleaned.substring(0, 4)),
    parseInt(cleaned.substring(4, 6)) - 1,
    parseInt(cleaned.substring(6, 8)),
    parseInt(cleaned.substring(8, 10) || "0"),
    parseInt(cleaned.substring(10, 12) || "0"),
    parseInt(cleaned.substring(12, 14) || "0")
  );
}

/**
 * Find free time slots in a user's calendar
 */
export async function findFreeTimeSlots(
  userId: string,
  date: Date,
  minDurationMinutes: number = 30,
  workingHoursStart: number = 8, // 8 AM
  workingHoursEnd: number = 21 // 9 PM
): Promise<CalendarTimeSlot[]> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Get all events for the day
  const events = await getCalendarEvents(userId, dayStart, dayEnd);

  // Filter to non-all-day events and sort
  const timedEvents = events
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const freeSlots: CalendarTimeSlot[] = [];

  // Start from working hours
  let currentTime = new Date(dayStart);
  currentTime.setHours(workingHoursStart, 0, 0, 0);

  const workEnd = new Date(dayStart);
  workEnd.setHours(workingHoursEnd, 0, 0, 0);

  for (const event of timedEvents) {
    // If there's a gap before this event
    if (event.start > currentTime && currentTime < workEnd) {
      const slotEnd = event.start < workEnd ? event.start : workEnd;
      const durationMinutes = (slotEnd.getTime() - currentTime.getTime()) / 60000;

      if (durationMinutes >= minDurationMinutes) {
        freeSlots.push({
          start: new Date(currentTime),
          end: slotEnd,
          durationMinutes,
        });
      }
    }

    // Move current time to after this event
    if (event.end > currentTime) {
      currentTime = new Date(event.end);
    }
  }

  // Check for free time after last event
  if (currentTime < workEnd) {
    const durationMinutes = (workEnd.getTime() - currentTime.getTime()) / 60000;
    if (durationMinutes >= minDurationMinutes) {
      freeSlots.push({
        start: new Date(currentTime),
        end: workEnd,
        durationMinutes,
      });
    }
  }

  return freeSlots;
}

/**
 * Get calendar density/busyness for a date
 * Returns a score from 0 (empty) to 1 (fully booked)
 */
export async function getCalendarDensity(
  userId: string,
  date: Date,
  workingHoursStart: number = 8,
  workingHoursEnd: number = 21
): Promise<number> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const events = await getCalendarEvents(userId, dayStart, dayEnd);
  const timedEvents = events.filter((e) => !e.isAllDay);

  const workingMinutes = (workingHoursEnd - workingHoursStart) * 60;
  let busyMinutes = 0;

  for (const event of timedEvents) {
    const eventStart = Math.max(
      event.start.getTime(),
      new Date(dayStart).setHours(workingHoursStart, 0, 0, 0)
    );
    const eventEnd = Math.min(
      event.end.getTime(),
      new Date(dayStart).setHours(workingHoursEnd, 0, 0, 0)
    );

    if (eventEnd > eventStart) {
      busyMinutes += (eventEnd - eventStart) / 60000;
    }
  }

  return Math.min(1, busyMinutes / workingMinutes);
}

/**
 * Format calendar events for AI context
 */
export function formatEventsForAI(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return "No calendar events.";
  }

  return events
    .map((e) => {
      const timeStr = e.isAllDay
        ? "All day"
        : `${format(e.start, "h:mm a")} - ${format(e.end, "h:mm a")}`;
      return `- ${e.summary} (${timeStr})${e.source === "external" ? ` [${e.calendarName}]` : ""}`;
    })
    .join("\n");
}
