import { google } from "googleapis";
import prisma from "./prisma";
import { CalendarEvent, TimeSlot } from "@/types";
import { startOfWeek, endOfWeek, addDays, format, parseISO, differenceInMinutes } from "date-fns";
import { fetchICSCalendar } from "./ics-parser";

// Determine which calendar provider a user has connected
export async function getUserCalendarProvider(userId: string): Promise<"google" | "azure-ad" | null> {
  const googleAccount = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (googleAccount?.access_token) return "google";

  const azureAccount = await prisma.account.findFirst({
    where: { userId, provider: "azure-ad" },
  });
  if (azureAccount?.access_token) return "azure-ad";

  return null;
}

// Get all connected calendar providers for a user
export async function getUserCalendarProviders(userId: string): Promise<string[]> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      provider: { in: ["google", "azure-ad"] },
    },
    select: { provider: true, access_token: true },
  });

  return accounts
    .filter((a) => a.access_token)
    .map((a) => a.provider);
}

// Get events from all external (ICS) calendars
async function getExternalCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const externalCalendars = await prisma.externalCalendar.findMany({
    where: {
      userId,
      isActive: true,
    },
  });

  const allEvents: CalendarEvent[] = [];

  for (const calendar of externalCalendars) {
    try {
      const events = await fetchICSCalendar(calendar.url, startDate, endDate);
      // Prefix event IDs to avoid collisions
      const prefixedEvents = events.map((e) => ({
        ...e,
        id: `ext_${calendar.id}_${e.id}`,
        summary: `[${calendar.name}] ${e.summary}`,
      }));
      allEvents.push(...prefixedEvents);

      // Update last sync time
      await prisma.externalCalendar.update({
        where: { id: calendar.id },
        data: { lastSync: new Date() },
      });
    } catch (error) {
      console.error(`Error fetching external calendar ${calendar.name}:`, error);
      // Continue with other calendars
    }
  }

  return allEvents;
}

// ============ GOOGLE CALENDAR ============

export async function getGoogleCalendarClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  if (!account?.access_token) {
    throw new Error("No Google account connected");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Handle token refresh
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? account.refresh_token,
        },
      });
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

// ============ MICROSOFT GRAPH ============

async function getMicrosoftAccessToken(userId: string): Promise<{ accessToken: string; accountId: string }> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "azure-ad",
    },
  });

  if (!account?.access_token) {
    throw new Error("No Microsoft account connected");
  }

  // Check if token is expired
  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now && account.refresh_token) {
    // Refresh the token
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || "common"}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.AZURE_AD_CLIENT_ID!,
          client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: account.refresh_token,
          scope: "openid email profile offline_access Calendars.ReadWrite",
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error("Failed to refresh Microsoft access token");
    }

    const tokens = await tokenResponse.json();

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? account.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      },
    });

    return { accessToken: tokens.access_token, accountId: account.id };
  }

  return { accessToken: account.access_token, accountId: account.id };
}

async function getMicrosoftCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const { accessToken } = await getMicrosoftAccessToken(userId);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&$orderby=start/dateTime&$top=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Microsoft Graph API error:", error);
    throw new Error("Failed to fetch Microsoft calendar events");
  }

  const data = await response.json();

  return (data.value || []).map((event: Record<string, unknown>) => ({
    id: event.id as string,
    summary: (event.subject as string) || "Untitled Event",
    description: (event.bodyPreview as string) || undefined,
    start: {
      dateTime: (event.start as { dateTime: string })?.dateTime
        ? new Date((event.start as { dateTime: string }).dateTime + "Z").toISOString()
        : undefined,
      date: event.isAllDay ? (event.start as { dateTime: string })?.dateTime?.split("T")[0] : undefined,
    },
    end: {
      dateTime: (event.end as { dateTime: string })?.dateTime
        ? new Date((event.end as { dateTime: string }).dateTime + "Z").toISOString()
        : undefined,
      date: event.isAllDay ? (event.end as { dateTime: string })?.dateTime?.split("T")[0] : undefined,
    },
    status: event.isCancelled ? "cancelled" : "confirmed",
  }));
}

async function createMicrosoftCalendarEvent(
  userId: string,
  summary: string,
  description: string,
  startTime: Date,
  endTime: Date
): Promise<string> {
  const { accessToken } = await getMicrosoftAccessToken(userId);

  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: summary,
      body: {
        contentType: "text",
        content: description,
      },
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Microsoft Graph API error:", error);
    throw new Error("Failed to create Microsoft calendar event");
  }

  const event = await response.json();
  return event.id;
}

async function deleteMicrosoftCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const { accessToken } = await getMicrosoftAccessToken(userId);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    console.error("Microsoft Graph API error:", error);
    throw new Error("Failed to delete Microsoft calendar event");
  }
}

export async function getCalendarEvents(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = startDate || startOfWeek(now, { weekStartsOn: 1 });
  const timeMax = endDate || endOfWeek(now, { weekStartsOn: 1 });

  const allEvents: CalendarEvent[] = [];

  // Get events from primary calendar (Google or Microsoft)
  const provider = await getUserCalendarProvider(userId);

  if (provider === "azure-ad") {
    try {
      const msEvents = await getMicrosoftCalendarEvents(userId, timeMin, timeMax);
      allEvents.push(...msEvents);
    } catch (error) {
      console.error("Error fetching Microsoft calendar:", error);
    }
  } else if (provider === "google") {
    try {
      const calendar = await getGoogleCalendarClient(userId);
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const googleEvents = (response.data.items || []).map((event) => ({
        id: event.id!,
        summary: event.summary || "Untitled Event",
        description: event.description || undefined,
        start: {
          dateTime: event.start?.dateTime || undefined,
          date: event.start?.date || undefined,
          timeZone: event.start?.timeZone || undefined,
        },
        end: {
          dateTime: event.end?.dateTime || undefined,
          date: event.end?.date || undefined,
          timeZone: event.end?.timeZone || undefined,
        },
        status: event.status || undefined,
      }));
      allEvents.push(...googleEvents);
    } catch (error) {
      console.error("Error fetching Google calendar:", error);
    }
  }

  // Get events from external (ICS) calendars
  try {
    const externalEvents = await getExternalCalendarEvents(userId, timeMin, timeMax);
    allEvents.push(...externalEvents);
  } catch (error) {
    console.error("Error fetching external calendars:", error);
  }

  // Sort all events by start time
  return allEvents.sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date || "";
    const bTime = b.start.dateTime || b.start.date || "";
    return aTime.localeCompare(bTime);
  });
}

export async function createCalendarEvent(
  userId: string,
  summary: string,
  description: string,
  startTime: Date,
  endTime: Date
): Promise<string> {
  const provider = await getUserCalendarProvider(userId);

  if (provider === "azure-ad") {
    return createMicrosoftCalendarEvent(userId, summary, description, startTime, endTime);
  }

  // Default to Google Calendar
  const calendar = await getGoogleCalendarClient(userId);

  const event = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      colorId: "9", // Blue color for ResolutionAI events
    },
  });

  return event.data.id!;
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const provider = await getUserCalendarProvider(userId);

  if (provider === "azure-ad") {
    return deleteMicrosoftCalendarEvent(userId, eventId);
  }

  // Default to Google Calendar
  const calendar = await getGoogleCalendarClient(userId);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}

export function findAvailableSlots(
  events: CalendarEvent[],
  date: Date,
  workdayStart: number = 8, // 8 AM
  workdayEnd: number = 21 // 9 PM
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayStart = new Date(date);
  dayStart.setHours(workdayStart, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(workdayEnd, 0, 0, 0);

  // Filter events for this day
  const dayEvents = events
    .filter((event) => {
      const eventStart = event.start.dateTime
        ? parseISO(event.start.dateTime)
        : parseISO(event.start.date!);
      return format(eventStart, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
    })
    .map((event) => ({
      start: event.start.dateTime
        ? parseISO(event.start.dateTime)
        : parseISO(event.start.date!),
      end: event.end.dateTime
        ? parseISO(event.end.dateTime)
        : addDays(parseISO(event.end.date!), 1),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let currentTime = dayStart;

  for (const event of dayEvents) {
    if (event.start > currentTime) {
      const duration = differenceInMinutes(event.start, currentTime);
      if (duration >= 15) {
        // Minimum 15 minute slot
        slots.push({
          start: new Date(currentTime),
          end: new Date(event.start),
          duration,
        });
      }
    }
    if (event.end > currentTime) {
      currentTime = event.end;
    }
  }

  // Add remaining time until end of day
  if (currentTime < dayEnd) {
    const duration = differenceInMinutes(dayEnd, currentTime);
    if (duration >= 15) {
      slots.push({
        start: new Date(currentTime),
        end: new Date(dayEnd),
        duration,
      });
    }
  }

  return slots;
}
