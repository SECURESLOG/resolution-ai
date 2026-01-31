import { CalendarEvent } from "@/types";
import { parseISO, isWithinInterval } from "date-fns";

/**
 * Parse ICS calendar data and extract events
 */
export function parseICSData(icsData: string, startDate: Date, endDate: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Split into individual events
  const eventBlocks = icsData.split("BEGIN:VEVENT");

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];

    const event = parseEventBlock(block);
    if (event) {
      // Check if event falls within date range
      const eventStart = event.start.dateTime
        ? parseISO(event.start.dateTime)
        : event.start.date
          ? parseISO(event.start.date)
          : null;

      if (eventStart && isWithinInterval(eventStart, { start: startDate, end: endDate })) {
        events.push(event);
      }
    }
  }

  return events;
}

function parseEventBlock(block: string): CalendarEvent | null {
  const lines = unfoldLines(block);

  let uid = "";
  let summary = "Untitled Event";
  let description = "";
  let dtstart = "";
  let dtend = "";
  let status = "confirmed";

  for (const line of lines) {
    if (line.startsWith("UID:")) {
      uid = line.substring(4).trim();
    } else if (line.startsWith("SUMMARY:")) {
      summary = unescapeICS(line.substring(8).trim());
    } else if (line.startsWith("DESCRIPTION:")) {
      description = unescapeICS(line.substring(12).trim());
    } else if (line.startsWith("DTSTART")) {
      dtstart = parseDateTimeValue(line);
    } else if (line.startsWith("DTEND")) {
      dtend = parseDateTimeValue(line);
    } else if (line.startsWith("STATUS:")) {
      status = line.substring(7).trim().toLowerCase();
    }
  }

  if (!uid || !dtstart) {
    return null;
  }

  const isAllDay = dtstart.length === 10; // YYYY-MM-DD format

  return {
    id: uid,
    summary,
    description: description || undefined,
    start: isAllDay
      ? { date: dtstart }
      : { dateTime: dtstart },
    end: isAllDay
      ? { date: dtend || dtstart }
      : { dateTime: dtend || dtstart },
    status,
  };
}

function unfoldLines(text: string): string[] {
  // ICS files fold long lines by starting continuation lines with a space or tab
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  return unfolded.split(/\r\n|\n/).filter(line => line.trim());
}

function parseDateTimeValue(line: string): string {
  // Handle formats like:
  // DTSTART:20240115T090000Z
  // DTSTART;TZID=America/New_York:20240115T090000
  // DTSTART;VALUE=DATE:20240115

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return "";

  const value = line.substring(colonIndex + 1).trim();

  // Check if it's a date-only value (8 digits)
  if (/^\d{8}$/.test(value)) {
    // Convert YYYYMMDD to YYYY-MM-DD
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  // Handle datetime format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const hour = value.slice(9, 11);
    const minute = value.slice(11, 13);
    const second = value.slice(13, 15);
    const isUTC = value.endsWith("Z");

    return `${year}-${month}-${day}T${hour}:${minute}:${second}${isUTC ? "Z" : ""}`;
  }

  return value;
}

function unescapeICS(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/**
 * Fetch and parse ICS calendar from URL
 */
export async function fetchICSCalendar(
  url: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  // Convert webcal:// to https://
  const fetchUrl = url.replace(/^webcal:\/\//i, "https://");

  const response = await fetch(fetchUrl, {
    headers: {
      "Accept": "text/calendar",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch calendar: ${response.statusText}`);
  }

  const icsData = await response.text();
  return parseICSData(icsData, startDate, endDate);
}
