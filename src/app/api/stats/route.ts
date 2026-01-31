import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Get today's tasks
    const todayTasks = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // Get today's completed tasks
    const completedToday = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: {
          gte: todayStart,
          lte: todayEnd,
        },
        status: "completed",
      },
    });

    // Get this week's tasks
    const weekTasks = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    // Get this week's completed tasks
    const completedWeek = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
        status: "completed",
      },
    });

    // Calculate streak (consecutive days with at least one completed task)
    let streakDays = 0;
    let checkDate = subDays(now, 1);

    while (true) {
      const dayStart = startOfDay(checkDate);
      const dayEnd = endOfDay(checkDate);

      const completed = await prisma.scheduledTask.count({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: {
            gte: dayStart,
            lte: dayEnd,
          },
          status: "completed",
        },
      });

      if (completed > 0) {
        streakDays++;
        checkDate = subDays(checkDate, 1);
      } else {
        break;
      }

      // Limit streak check to 365 days
      if (streakDays >= 365) break;
    }

    // Get total tasks count
    const totalTasks = await prisma.task.count({
      where: { userId: session.user.id },
    });

    // Get resolution vs household breakdown
    const resolutionTasks = await prisma.task.count({
      where: { userId: session.user.id, type: "resolution" },
    });

    const householdTasks = await prisma.task.count({
      where: { userId: session.user.id, type: "household" },
    });

    return NextResponse.json({
      todayTasks,
      completedToday,
      weekTasks,
      completedWeek,
      streakDays,
      totalTasks,
      resolutionTasks,
      householdTasks,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
