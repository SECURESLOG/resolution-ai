import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO, subDays } from "date-fns";

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
    const includeFamily = searchParams.get("family") === "true";

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

    // Build the user filter - either just current user or all family members
    let userFilter: { assignedToUserId: string } | { assignedToUserId: { in: string[] } } = {
      assignedToUserId: session.user.id,
    };

    if (includeFamily) {
      // Get the user's family membership
      const membership = await prisma.familyMember.findUnique({
        where: { userId: session.user.id },
        include: {
          family: {
            include: {
              members: true,
            },
          },
        },
      });

      if (membership?.family) {
        const familyUserIds = membership.family.members.map((m) => m.userId);
        userFilter = { assignedToUserId: { in: familyUserIds } };
      }
    }

    const scheduledTasks = await prisma.scheduledTask.findMany({
      where: {
        ...userFilter,
        scheduledDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        task: true,
        feedback: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // Calculate streaks for each unique task
    const taskStreaks = new Map<string, number>();
    const uniqueTaskIds = Array.from(new Set(scheduledTasks.map((st) => st.taskId)));

    for (const taskId of uniqueTaskIds) {
      // Get all completed instances of this task, ordered by date descending
      const completedInstances = await prisma.scheduledTask.findMany({
        where: {
          taskId,
          assignedToUserId: session.user.id,
          status: "completed",
          scheduledDate: { lte: new Date() },
        },
        orderBy: { scheduledDate: "desc" },
        take: 100, // Limit for performance
      });

      // Count consecutive completions (streak)
      let streak = 0;
      let lastDate: Date | null = null;

      for (const instance of completedInstances) {
        const instanceDate = startOfDay(new Date(instance.scheduledDate));

        if (lastDate === null) {
          // First completed instance
          streak = 1;
          lastDate = instanceDate;
        } else {
          // Check if this is within a reasonable gap (allow up to 3 days for weekly tasks)
          const daysDiff = Math.floor((lastDate.getTime() - instanceDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff <= 7) {
            streak++;
            lastDate = instanceDate;
          } else {
            break; // Streak broken
          }
        }
      }

      taskStreaks.set(taskId, streak);
    }

    // Add streak to each scheduled task
    const tasksWithStreaks = scheduledTasks.map((task) => ({
      ...task,
      streak: taskStreaks.get(task.taskId) || 0,
    }));

    return NextResponse.json(tasksWithStreaks);
  } catch (error) {
    console.error("Error fetching scheduled tasks:", error);
    return NextResponse.json({ error: "Failed to fetch scheduled tasks" }, { status: 500 });
  }
}
