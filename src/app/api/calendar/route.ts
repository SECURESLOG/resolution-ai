import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCalendarEvents } from "@/lib/calendar";
import { startOfWeek, endOfWeek, parseISO } from "date-fns";

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

    const now = new Date();
    const startDate = startStr ? parseISO(startStr) : startOfWeek(now, { weekStartsOn: 1 });
    const endDate = endStr ? parseISO(endStr) : endOfWeek(now, { weekStartsOn: 1 });

    const events = await getCalendarEvents(session.user.id, startDate, endDate);

    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching calendar:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
