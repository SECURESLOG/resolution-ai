import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCalendarEvents } from "@/lib/calendar";
import { startOfWeek, endOfWeek, parseISO } from "date-fns";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startStr = searchParams.get("start");
    const endStr = searchParams.get("end");
    const includeFamily = searchParams.get("family") === "true";

    const now = new Date();
    const startDate = startStr ? parseISO(startStr) : startOfWeek(now, { weekStartsOn: 1 });
    const endDate = endStr ? parseISO(endStr) : endOfWeek(now, { weekStartsOn: 1 });

    // Get current user's events
    const userEvents = await getCalendarEvents(session.user.id, startDate, endDate);
    const eventsWithOwner = userEvents.map(event => ({
      ...event,
      userId: session.user.id,
      userName: session.user.name || "You",
      isOwn: true,
    }));

    // If family view requested, also get family members' events
    if (includeFamily) {
      const membership = await prisma.familyMember.findUnique({
        where: { userId: session.user.id },
        include: {
          family: {
            include: {
              members: {
                include: {
                  user: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });

      if (membership?.family) {
        for (const member of membership.family.members) {
          // Skip current user (already added)
          if (member.userId === session.user.id) continue;

          const memberEvents = await getCalendarEvents(member.userId, startDate, endDate);
          const memberEventsWithOwner = memberEvents.map(event => ({
            ...event,
            userId: member.userId,
            userName: member.user.name || "Family Member",
            isOwn: false,
          }));
          eventsWithOwner.push(...memberEventsWithOwner);
        }
      }
    }

    // Helper to extract start time for sorting
    const getStartTime = (event: typeof eventsWithOwner[0]): number => {
      const start = event.start;
      if (typeof start === 'string') {
        return new Date(start).getTime();
      }
      if (start instanceof Date) {
        return start.getTime();
      }
      // It's an object with dateTime or date
      const dateStr = start.dateTime || start.date;
      return dateStr ? new Date(dateStr).getTime() : 0;
    };

    // Sort all events by start time
    eventsWithOwner.sort((a, b) => getStartTime(a) - getStartTime(b));

    return NextResponse.json(eventsWithOwner);
  } catch (error) {
    console.error("Error fetching calendar:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
