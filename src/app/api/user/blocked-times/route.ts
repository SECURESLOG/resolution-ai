import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBlockedTimesForRange } from "@/lib/user-availability";
import { parseISO, startOfDay, endOfDay } from "date-fns";

export const dynamic = "force-dynamic";

// GET - Get blocked times for a date range (work hours, commute, vacations, holidays)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const startStr = url.searchParams.get("start");
    const endStr = url.searchParams.get("end");

    if (!startStr || !endStr) {
      return NextResponse.json(
        { error: "start and end query parameters are required" },
        { status: 400 }
      );
    }

    const startDate = startOfDay(parseISO(startStr));
    const endDate = endOfDay(parseISO(endStr));

    const blockedTimes = await getBlockedTimesForRange(
      session.user.id,
      startDate,
      endDate
    );

    // Format for frontend
    const formattedBlocks = blockedTimes.map((block) => ({
      start: block.start.toISOString(),
      end: block.end.toISOString(),
      reason: block.reason,
      type: block.type,
    }));

    return NextResponse.json(formattedBlocks);
  } catch (error) {
    console.error("Error fetching blocked times:", error);
    return NextResponse.json(
      { error: "Failed to fetch blocked times" },
      { status: 500 }
    );
  }
}
