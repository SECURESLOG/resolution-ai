import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const view = searchParams.get("view") || "week"; // "day" or "week"
    const dateStr = searchParams.get("date");

    const baseDate = dateStr ? parseISO(dateStr) : new Date();

    let startDate: Date;
    let endDate: Date;

    if (view === "day") {
      startDate = startOfDay(baseDate);
      endDate = endOfDay(baseDate);
    } else {
      startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
      endDate = endOfWeek(baseDate, { weekStartsOn: 1 });
    }

    const scheduledTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        task: true,
        feedback: true,
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json(scheduledTasks);
  } catch (error) {
    console.error("Error fetching scheduled tasks:", error);
    return NextResponse.json({ error: "Failed to fetch scheduled tasks" }, { status: 500 });
  }
}
