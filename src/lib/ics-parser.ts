import { CalendarEvent } from "@/types";
import { parseISO, isWithinInterval, addDays } from "date-fns";
import { RRule, RRuleSet, rrulestr, Frequency } from "rrule";

// Map of Windows timezone names to IANA timezone names
const WINDOWS_TO_IANA_TIMEZONE: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "UTC": "UTC",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
};

/**
 * Parse ICS calendar data and extract events, including recurring events
 */
export function parseICSData(icsData: string, startDate: Date, endDate: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // First, extract timezone definitions from the ICS
  const timezones = extractTimezones(icsData);
  console.log(`[ICS Parser] Found ${timezones.size} timezone definitions`);
  console.log(`[ICS Parser] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Split into individual events
  const eventBlocks = icsData.split("BEGIN:VEVENT");
  console.log(`[ICS Parser] Found ${eventBlocks.length - 1} VEVENT blocks in ICS data`);

  let recurringCount = 0;
  let singleCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split("END:VEVENT")[0];

    // Quick check for RRULE
    const hasRRule = block.includes("RRULE:");
    const hasRDate = block.includes("RDATE");

    // Extract summary for logging
    const summaryMatch = block.match(/SUMMARY:([^\r\n]+)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : "Unknown";

    // Extract RRULE for logging
    const rruleMatch = block.match(/RRULE:([^\r\n]+)/);
    const rrule = rruleMatch ? rruleMatch[1].trim() : null;

    try {
      const parsedEvents = parseEventBlock(block, startDate, endDate, timezones);

      if (parsedEvents.length > 0) {
        if (hasRRule || hasRDate) {
          recurringCount++;
          console.log(`[ICS Parser] ✓ Recurring event "${summary}" expanded to ${parsedEvents.length} occurrences`);
          if (rrule) {
            console.log(`[ICS Parser]   RRULE: ${rrule}`);
          }
        } else {
          singleCount++;
        }
        events.push(...parsedEvents);
      } else {
        skippedCount++;
        if (hasRRule) {
          console.log(`[ICS Parser] ⚠ Recurring event "${summary}" produced 0 occurrences in date range`);
          console.log(`[ICS Parser]   RRULE: ${rrule}`);
          // Log the DTSTART to help debug
          const dtstartMatch = block.match(/DTSTART[^:]*:([^\r\n]+)/);
          if (dtstartMatch) {
            console.log(`[ICS Parser]   DTSTART: ${dtstartMatch[1]}`);
          }
        }
      }
    } catch (error) {
      errorCount++;
      console.error(`[ICS Parser] ✗ Error parsing event "${summary}":`, error);
      if (rrule) {
        console.error(`[ICS Parser]   RRULE: ${rrule}`);
      }
    }
  }

  console.log(`[ICS Parser] Summary:`);
  console.log(`[ICS Parser]   - Total events in ICS: ${eventBlocks.length - 1}`);
  console.log(`[ICS Parser]   - Recurring events expanded: ${recurringCount}`);
  console.log(`[ICS Parser]   - Single events in range: ${singleCount}`);
  console.log(`[ICS Parser]   - Skipped (out of range): ${skippedCount}`);
  console.log(`[ICS Parser]   - Errors: ${errorCount}`);
  console.log(`[ICS Parser]   - Total occurrences returned: ${events.length}`);

  return events;
}

function extractTimezones(icsData: string): Map<string, string> {
  const timezones = new Map<string, string>();

  // Extract VTIMEZONE blocks to map TZID to standard offset
  const tzBlocks = icsData.split("BEGIN:VTIMEZONE");
  for (let i = 1; i < tzBlocks.length; i++) {
    const block = tzBlocks[i].split("END:VTIMEZONE")[0];
    const tzidMatch = block.match(/TZID:([^\r\n]+)/);
    if (tzidMatch) {
      const tzid = tzidMatch[1].trim();
      // Try to map to IANA timezone
      const ianaZone = WINDOWS_TO_IANA_TIMEZONE[tzid] || tzid;
      timezones.set(tzid, ianaZone);
    }
  }

  return timezones;
}

interface ParsedEventData {
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
  dtstartRaw: string; // Original DTSTART line for RRULE parsing
  dtend: string;
  status: string;
  rrule: string | null;
  exdates: string[];
  rdates: string[]; // Explicit recurrence dates
  recurrenceId: string | null; // For modified instances
  isPrivate: boolean;
  duration: number | null; // in milliseconds
  tzid: string | null; // Timezone ID
}

function parseEventBlock(block: string, startDate: Date, endDate: Date, timezones: Map<string, string>): CalendarEvent[] {
  const lines = unfoldLines(block);

  const eventData: ParsedEventData = {
    uid: "",
    summary: "Untitled Event",
    description: "",
    dtstart: "",
    dtstartRaw: "",
    dtend: "",
    status: "confirmed",
    rrule: null,
    exdates: [],
    rdates: [],
    recurrenceId: null,
    isPrivate: false,
    duration: null,
    tzid: null,
  };

  for (const line of lines) {
    if (line.startsWith("UID:")) {
      eventData.uid = line.substring(4).trim();
    } else if (line.startsWith("SUMMARY:")) {
      eventData.summary = unescapeICS(line.substring(8).trim());
    } else if (line.startsWith("DESCRIPTION:")) {
      eventData.description = unescapeICS(line.substring(12).trim());
    } else if (line.startsWith("DTSTART")) {
      eventData.dtstartRaw = line;
      eventData.dtstart = parseDateTimeValue(line, timezones);
      // Extract timezone
      const tzidMatch = line.match(/TZID=([^:;]+)/);
      if (tzidMatch) {
        eventData.tzid = tzidMatch[1];
      }
    } else if (line.startsWith("DTEND")) {
      eventData.dtend = parseDateTimeValue(line, timezones);
    } else if (line.startsWith("DURATION:")) {
      eventData.duration = parseDuration(line.substring(9).trim());
    } else if (line.startsWith("STATUS:")) {
      eventData.status = line.substring(7).trim().toLowerCase();
    } else if (line.startsWith("RRULE:")) {
      eventData.rrule = line.substring(6).trim();
    } else if (line.startsWith("EXDATE")) {
      // Handle exception dates (dates when recurring event doesn't occur)
      // EXDATE can have multiple dates separated by comma
      const exdateValue = line.substring(line.indexOf(":") + 1).trim();
      const dates = exdateValue.split(",");
      for (const d of dates) {
        const parsed = parseDateValue(d.trim(), timezones, eventData.tzid);
        if (parsed) {
          eventData.exdates.push(parsed);
        }
      }
    } else if (line.startsWith("RDATE")) {
      // Handle explicit recurrence dates
      const rdateValue = line.substring(line.indexOf(":") + 1).trim();
      const dates = rdateValue.split(",");
      for (const d of dates) {
        const parsed = parseDateValue(d.trim(), timezones, eventData.tzid);
        if (parsed) {
          eventData.rdates.push(parsed);
        }
      }
    } else if (line.startsWith("RECURRENCE-ID")) {
      // This is a modified instance of a recurring event
      eventData.recurrenceId = parseDateTimeValue(line, timezones);
    } else if (line.startsWith("CLASS:")) {
      const classValue = line.substring(6).trim().toUpperCase();
      eventData.isPrivate = classValue === "PRIVATE" || classValue === "CONFIDENTIAL";
    } else if (line.startsWith("X-MICROSOFT-CDO-BUSYSTATUS:")) {
      // Outlook-specific: treat OOF and BUSY as valid events
      // Skip TENTATIVE or FREE if needed
    }
  }

  if (!eventData.uid || !eventData.dtstart) {
    return [];
  }

  // Skip modified instances (they override a specific occurrence)
  // In a full implementation, we'd track these and replace the original occurrence
  if (eventData.recurrenceId) {
    // For now, treat modified instances as single events
    const eventStart = parseEventDate(eventData.dtstart);
    if (eventStart && isWithinInterval(eventStart, { start: startDate, end: endDate })) {
      return [createCalendarEvent(eventData, eventData.dtstart, eventData.dtend || eventData.dtstart)];
    }
    return [];
  }

  // Calculate end time if not provided but duration is
  if (!eventData.dtend && eventData.duration && eventData.dtstart) {
    const startMs = new Date(eventData.dtstart).getTime();
    eventData.dtend = new Date(startMs + eventData.duration).toISOString();
  }

  // If no end time and no duration, assume 1 hour for timed events
  if (!eventData.dtend && eventData.dtstart.includes("T")) {
    const startMs = new Date(eventData.dtstart).getTime();
    eventData.dtend = new Date(startMs + 60 * 60 * 1000).toISOString();
  }

  // Handle private events - show as "Busy" with limited info
  if (eventData.isPrivate) {
    eventData.summary = eventData.summary || "Busy (Private)";
    eventData.description = "";
  }

  // If this is a recurring event, expand it
  if (eventData.rrule) {
    return expandRecurringEvent(eventData, startDate, endDate);
  }

  // Handle RDATE (explicit recurrence dates without RRULE)
  if (eventData.rdates.length > 0) {
    return expandRDateEvent(eventData, startDate, endDate);
  }

  // Single event - check if it falls within date range
  const eventStart = parseEventDate(eventData.dtstart);
  if (eventStart && isWithinInterval(eventStart, { start: startDate, end: endDate })) {
    return [createCalendarEvent(eventData, eventData.dtstart, eventData.dtend)];
  }

  return [];
}

function expandRDateEvent(eventData: ParsedEventData, startDate: Date, endDate: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const eventStart = parseEventDate(eventData.dtstart);
  const eventEnd = parseEventDate(eventData.dtend || eventData.dtstart);
  const durationMs = eventStart && eventEnd ? eventEnd.getTime() - eventStart.getTime() : 60 * 60 * 1000;

  // Add the original event if in range
  if (eventStart && isWithinInterval(eventStart, { start: startDate, end: endDate })) {
    events.push(createCalendarEvent(eventData, eventData.dtstart, eventData.dtend));
  }

  // Add RDATE occurrences
  for (const rdate of eventData.rdates) {
    const rdateStart = parseEventDate(rdate);
    if (rdateStart && isWithinInterval(rdateStart, { start: startDate, end: endDate })) {
      const rdateEnd = new Date(rdateStart.getTime() + durationMs);
      events.push({
        id: `${eventData.uid}_${rdateStart.getTime()}`,
        summary: eventData.summary,
        description: eventData.description || undefined,
        start: { dateTime: rdateStart.toISOString() },
        end: { dateTime: rdateEnd.toISOString() },
        status: eventData.status,
      });
    }
  }

  return events;
}

function expandRecurringEvent(eventData: ParsedEventData, startDate: Date, endDate: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  try {
    const eventStart = parseEventDate(eventData.dtstart);
    if (!eventStart) {
      console.error(`[ICS Parser] Could not parse DTSTART for "${eventData.summary}": ${eventData.dtstart}`);
      return [];
    }

    console.log(`[ICS Parser] Expanding recurring event "${eventData.summary}"`);
    console.log(`[ICS Parser]   DTSTART parsed: ${eventStart.toISOString()}`);
    console.log(`[ICS Parser]   RRULE: ${eventData.rrule}`);

    // Calculate duration between start and end
    const eventEnd = parseEventDate(eventData.dtend || eventData.dtstart);
    const durationMs = eventEnd ? eventEnd.getTime() - eventStart.getTime() : 60 * 60 * 1000;
    console.log(`[ICS Parser]   Duration: ${durationMs / 60000} minutes`);

    // Create RRuleSet to handle exceptions
    const rruleSet = new RRuleSet();

    // Parse the RRULE manually to handle edge cases
    try {
      const ruleOptions = parseRRuleString(eventData.rrule!, eventStart);
      if (ruleOptions) {
        console.log(`[ICS Parser]   Using manual RRULE parsing`);
        const rule = new RRule(ruleOptions);
        rruleSet.rrule(rule);
        console.log(`[ICS Parser]   RRule created: ${rule.toString()}`);
      } else {
        // Fallback: try rrulestr
        console.log(`[ICS Parser]   Using rrulestr fallback`);
        const dtStartStr = formatDateForRRule(eventStart);
        const rruleString = `DTSTART:${dtStartStr}\nRRULE:${eventData.rrule}`;
        console.log(`[ICS Parser]   rrulestr input: ${rruleString.replace(/\n/g, ' | ')}`);
        const rule = rrulestr(rruleString);
        rruleSet.rrule(rule);
      }
    } catch (e) {
      console.error(`[ICS Parser] ✗ Error parsing RRULE for "${eventData.summary}"`);
      console.error(`[ICS Parser]   RRULE: ${eventData.rrule}`);
      console.error(`[ICS Parser]   Error:`, e);
      // Fall back to single event
      if (isWithinInterval(eventStart, { start: startDate, end: endDate })) {
        console.log(`[ICS Parser]   Falling back to single event (in range)`);
        return [createCalendarEvent(eventData, eventData.dtstart, eventData.dtend)];
      }
      console.log(`[ICS Parser]   Original event not in range, skipping`);
      return [];
    }

    // Add exception dates
    if (eventData.exdates.length > 0) {
      console.log(`[ICS Parser]   Adding ${eventData.exdates.length} exception dates`);
      for (const exdate of eventData.exdates) {
        const exdateDate = parseEventDate(exdate);
        if (exdateDate) {
          rruleSet.exdate(exdateDate);
        }
      }
    }

    // Add RDATE occurrences
    if (eventData.rdates.length > 0) {
      console.log(`[ICS Parser]   Adding ${eventData.rdates.length} RDATE occurrences`);
      for (const rdate of eventData.rdates) {
        const rdateDate = parseEventDate(rdate);
        if (rdateDate) {
          rruleSet.rdate(rdateDate);
        }
      }
    }

    // Get occurrences within the date range
    // Extend the range to catch events properly
    const rangeStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before
    const rangeEnd = addDays(endDate, 2); // 2 days after

    console.log(`[ICS Parser]   Getting occurrences between ${rangeStart.toISOString()} and ${rangeEnd.toISOString()}`);

    let occurrences: Date[];
    try {
      occurrences = rruleSet.between(rangeStart, rangeEnd, true);
      console.log(`[ICS Parser]   RRuleSet returned ${occurrences.length} raw occurrences`);
    } catch (e) {
      console.error(`[ICS Parser] ✗ Error getting occurrences:`, e);
      return [];
    }

    let filteredCount = 0;
    for (const occurrence of occurrences) {
      // Filter to only include occurrences that actually fall within our range
      if (occurrence < startDate || occurrence > endDate) {
        filteredCount++;
        continue;
      }

      const occurrenceEnd = new Date(occurrence.getTime() + durationMs);
      const occurrenceStartStr = occurrence.toISOString();
      const occurrenceEndStr = occurrenceEnd.toISOString();

      // Create a unique ID for this occurrence
      const occurrenceId = `${eventData.uid}_${occurrence.getTime()}`;

      events.push({
        id: occurrenceId,
        summary: eventData.summary,
        description: eventData.description || undefined,
        start: { dateTime: occurrenceStartStr },
        end: { dateTime: occurrenceEndStr },
        status: eventData.status,
      });
    }

    console.log(`[ICS Parser]   Final: ${events.length} occurrences in range (${filteredCount} filtered out)`);

  } catch (error) {
    console.error(`[ICS Parser] ✗ Error expanding recurring event "${eventData.summary}":`, error);
    // Fall back to single event
    const eventStart = parseEventDate(eventData.dtstart);
    if (eventStart && isWithinInterval(eventStart, { start: startDate, end: endDate })) {
      return [createCalendarEvent(eventData, eventData.dtstart, eventData.dtend)];
    }
  }

  return events;
}

// Parse RRULE string into RRule options
function parseRRuleString(rruleStr: string, dtstart: Date): Partial<ConstructorParameters<typeof RRule>[0]> | null {
  try {
    const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
      dtstart: dtstart,
    };

    const parts = rruleStr.split(";");
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (!key || !value) continue;

      switch (key.toUpperCase()) {
        case "FREQ":
          const freqMap: Record<string, Frequency> = {
            YEARLY: RRule.YEARLY,
            MONTHLY: RRule.MONTHLY,
            WEEKLY: RRule.WEEKLY,
            DAILY: RRule.DAILY,
            HOURLY: RRule.HOURLY,
            MINUTELY: RRule.MINUTELY,
            SECONDLY: RRule.SECONDLY,
          };
          options.freq = freqMap[value.toUpperCase()];
          break;
        case "INTERVAL":
          options.interval = parseInt(value, 10);
          break;
        case "COUNT":
          options.count = parseInt(value, 10);
          break;
        case "UNTIL":
          const untilDate = parseDateValue(value, new Map(), null);
          if (untilDate) {
            options.until = new Date(untilDate);
          }
          break;
        case "BYDAY":
          const weekdayObjects: (typeof RRule.MO | ReturnType<typeof RRule.MO.nth>)[] = [];
          for (const day of value.split(",")) {
            // Handle formats like "2TU" (second Tuesday), "-1FR" (last Friday), or just "MO"
            const dayMatch = day.trim().match(/^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i);
            if (dayMatch) {
              const nth = dayMatch[1] ? parseInt(dayMatch[1], 10) : null;
              const dayName = dayMatch[2].toUpperCase();

              const weekdayMap: Record<string, typeof RRule.MO> = {
                SU: RRule.SU,
                MO: RRule.MO,
                TU: RRule.TU,
                WE: RRule.WE,
                TH: RRule.TH,
                FR: RRule.FR,
                SA: RRule.SA,
              };

              const weekday = weekdayMap[dayName];
              if (weekday) {
                if (nth !== null) {
                  // Use nth() for ordinal days like "2TU" (second Tuesday)
                  weekdayObjects.push(weekday.nth(nth));
                } else {
                  weekdayObjects.push(weekday);
                }
              }
            }
          }
          if (weekdayObjects.length > 0) {
            options.byweekday = weekdayObjects as typeof options.byweekday;
          }
          break;
        case "BYMONTH":
          options.bymonth = value.split(",").map(v => parseInt(v, 10));
          break;
        case "BYMONTHDAY":
          options.bymonthday = value.split(",").map(v => parseInt(v, 10));
          break;
        case "BYHOUR":
          options.byhour = value.split(",").map(v => parseInt(v, 10));
          break;
        case "BYMINUTE":
          options.byminute = value.split(",").map(v => parseInt(v, 10));
          break;
        case "BYSETPOS":
          options.bysetpos = value.split(",").map(v => parseInt(v, 10));
          break;
        case "WKST":
          const wkstMap: Record<string, number> = {
            SU: RRule.SU.weekday,
            MO: RRule.MO.weekday,
            TU: RRule.TU.weekday,
            WE: RRule.WE.weekday,
            TH: RRule.TH.weekday,
            FR: RRule.FR.weekday,
            SA: RRule.SA.weekday,
          };
          options.wkst = wkstMap[value.toUpperCase()];
          break;
      }
    }

    // Validate that we at least have a frequency
    if (options.freq === undefined) {
      return null;
    }

    return options;
  } catch (e) {
    console.error("Error parsing RRULE string:", rruleStr, e);
    return null;
  }
}

function createCalendarEvent(eventData: ParsedEventData, dtstart: string, dtend: string): CalendarEvent {
  const isAllDay = dtstart.length === 10; // YYYY-MM-DD format

  return {
    id: eventData.uid,
    summary: eventData.summary,
    description: eventData.description || undefined,
    start: isAllDay ? { date: dtstart } : { dateTime: dtstart },
    end: isAllDay ? { date: dtend || dtstart } : { dateTime: dtend || dtstart },
    status: eventData.status,
  };
}

function parseEventDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Handle YYYY-MM-DD format
    if (dateStr.length === 10) {
      return parseISO(dateStr);
    }
    // Handle ISO format
    return new Date(dateStr);
  } catch {
    return null;
  }
}

function formatDateForRRule(date: Date): string {
  // Format as YYYYMMDDTHHMMSSZ for RRule
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function unfoldLines(text: string): string[] {
  // ICS files fold long lines by starting continuation lines with a space or tab
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  return unfolded.split(/\r\n|\n/).filter(line => line.trim());
}

function parseDateTimeValue(line: string, timezones: Map<string, string>): string {
  // Handle formats like:
  // DTSTART:20240115T090000Z
  // DTSTART;TZID=America/New_York:20240115T090000
  // DTSTART;VALUE=DATE:20240115
  // EXDATE;TZID=America/New_York:20240115T090000

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return "";

  // Extract TZID if present
  let tzid: string | null = null;
  const tzidMatch = line.match(/TZID=([^:;]+)/);
  if (tzidMatch) {
    tzid = tzidMatch[1];
  }

  const value = line.substring(colonIndex + 1).trim();

  return parseDateValue(value, timezones, tzid);
}

function parseDateValue(value: string, timezones: Map<string, string>, tzid: string | null): string {
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

    if (isUTC) {
      return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    }

    // For non-UTC times with a timezone, try to convert to UTC
    // For simplicity, we'll return ISO format and let the browser handle timezone
    // A more robust solution would use a timezone library
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    // If we have a timezone, try to create a proper Date and convert to ISO
    if (tzid) {
      try {
        // Create a date string that JavaScript can parse with timezone context
        // This is a simplified approach - for production, use a library like date-fns-tz
        const date = new Date(isoString);
        if (!isNaN(date.getTime())) {
          // Return as-is for now, the date will be interpreted in local timezone
          return isoString;
        }
      } catch {
        // Fall through to default
      }
    }

    return isoString;
  }

  // Already in ISO format or other format, return as-is
  return value;
}

function parseDuration(duration: string): number | null {
  // Parse ISO 8601 duration format: P[n]Y[n]M[n]DT[n]H[n]M[n]S
  // Example: PT1H30M = 1 hour 30 minutes
  try {
    let totalMs = 0;
    const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
      const days = parseInt(match[1] || "0", 10);
      const hours = parseInt(match[2] || "0", 10);
      const minutes = parseInt(match[3] || "0", 10);
      const seconds = parseInt(match[4] || "0", 10);
      totalMs = ((days * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000;
    }
    return totalMs > 0 ? totalMs : null;
  } catch {
    return null;
  }
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

  console.log(`[ICS Parser] ========================================`);
  console.log(`[ICS Parser] Fetching ICS calendar from: ${fetchUrl.substring(0, 50)}...`);

  const response = await fetch(fetchUrl, {
    headers: {
      Accept: "text/calendar",
    },
    // Some calendar servers need these
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(`[ICS Parser] ✗ Failed to fetch calendar: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch calendar: ${response.statusText}`);
  }

  const icsData = await response.text();
  console.log(`[ICS Parser] Received ${icsData.length} bytes of ICS data`);

  // Log first few lines for debugging
  const firstLines = icsData.split('\n').slice(0, 10).join('\n');
  console.log(`[ICS Parser] ICS header:\n${firstLines}`);

  const events = parseICSData(icsData, startDate, endDate);
  console.log(`[ICS Parser] ========================================`);

  return events;
}
