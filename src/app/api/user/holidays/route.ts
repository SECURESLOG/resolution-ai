import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getUpcomingHolidays, SUPPORTED_COUNTRIES } from "@/lib/public-holidays";

export const dynamic = "force-dynamic";

// GET - Get upcoming public holidays for user's country
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const months = parseInt(url.searchParams.get("months") || "12");

    // Get user's country
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { country: true },
    });

    const country = user?.country || "UK";
    const holidays = getUpcomingHolidays(country, months);

    // Format for frontend
    const formattedHolidays = holidays.map(h => ({
      date: (h.observed || h.date).toISOString(),
      name: h.name,
      isObserved: !!h.observed,
    }));

    return NextResponse.json({
      country,
      holidays: formattedHolidays,
      supportedCountries: SUPPORTED_COUNTRIES,
    });
  } catch (error) {
    console.error("Error fetching holidays:", error);
    return NextResponse.json({ error: "Failed to fetch holidays" }, { status: 500 });
  }
}
