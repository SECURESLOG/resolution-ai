import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, format, addDays } from "date-fns";

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

    // Get weekly progress (completed tasks per day for the current week)
    const weeklyProgress = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const [scheduled, completed] = await Promise.all([
        prisma.scheduledTask.count({
          where: {
            assignedToUserId: session.user.id,
            scheduledDate: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.scheduledTask.count({
          where: {
            assignedToUserId: session.user.id,
            scheduledDate: { gte: dayStart, lte: dayEnd },
            status: "completed",
          },
        }),
      ]);

      weeklyProgress.push({
        day: format(day, "EEE"),
        date: format(day, "MMM d"),
        scheduled,
        completed,
        isToday: format(day, "yyyy-MM-dd") === format(now, "yyyy-MM-dd"),
      });
    }

    // Calculate completion rate
    const completionRate = weekTasks > 0 ? Math.round((completedWeek / weekTasks) * 100) : 0;

    // Get resolution completion stats (last 30 days)
    const thirtyDaysAgo = subDays(now, 30);
    const resolutionScheduled = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: thirtyDaysAgo },
        task: { type: "resolution" },
      },
    });
    const resolutionCompleted = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: thirtyDaysAgo },
        task: { type: "resolution" },
        status: "completed",
      },
    });
    const resolutionRate = resolutionScheduled > 0
      ? Math.round((resolutionCompleted / resolutionScheduled) * 100)
      : 0;

    // Get top performing resolution (by completion rate)
    const taskCompletionStats = await prisma.scheduledTask.groupBy({
      by: ["taskId"],
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: thirtyDaysAgo },
        task: { type: "resolution" },
      },
      _count: { id: true },
    });

    let topResolution = null;
    if (taskCompletionStats.length > 0) {
      const taskStats = await Promise.all(
        taskCompletionStats.map(async (stat) => {
          const task = await prisma.task.findUnique({
            where: { id: stat.taskId },
            select: { name: true },
          });
          const completed = await prisma.scheduledTask.count({
            where: {
              taskId: stat.taskId,
              assignedToUserId: session.user.id,
              scheduledDate: { gte: thirtyDaysAgo },
              status: "completed",
            },
          });
          return {
            name: task?.name || "Unknown",
            total: stat._count.id,
            completed,
            rate: stat._count.id > 0 ? Math.round((completed / stat._count.id) * 100) : 0,
          };
        })
      );
      // Sort by completion rate, then by total completed
      taskStats.sort((a, b) => b.rate - a.rate || b.completed - a.completed);
      if (taskStats.length > 0 && taskStats[0].completed > 0) {
        topResolution = taskStats[0];
      }
    }

    return NextResponse.json({
      todayTasks,
      completedToday,
      weekTasks,
      completedWeek,
      streakDays,
      totalTasks,
      resolutionTasks,
      householdTasks,
      // New stats
      weeklyProgress,
      completionRate,
      resolutionRate,
      topResolution,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
