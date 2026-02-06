import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCalendarEvents } from "@/lib/calendar";
import { generateSchedule, generateFamilySchedule } from "@/lib/ai-scheduler";
import { startOfWeek, endOfWeek, addDays, format } from "date-fns";
import { CalendarEvent } from "@/types";
import { getBlockedTimesForRange, getUserAvailabilityInfo } from "@/lib/user-availability";

/**
 * Get existing scheduled tasks for the week, grouped by task ID
 * Returns count and dates for each task
 */
async function getExistingScheduledByTask(
  taskIds: string[],
  weekStart: Date,
  weekEnd: Date
): Promise<Map<string, { count: number; dates: Set<string> }>> {
  const existingScheduled = await prisma.scheduledTask.findMany({
    where: {
      taskId: { in: taskIds },
      scheduledDate: { gte: weekStart, lte: weekEnd },
      status: { not: "skipped" },
    },
    select: {
      taskId: true,
      scheduledDate: true,
    },
  });

  const result = new Map<string, { count: number; dates: Set<string> }>();

  for (const scheduled of existingScheduled) {
    const taskId = scheduled.taskId;
    const dateStr = format(scheduled.scheduledDate, "yyyy-MM-dd");

    if (!result.has(taskId)) {
      result.set(taskId, { count: 0, dates: new Set() });
    }

    const entry = result.get(taskId)!;
    entry.count++;
    entry.dates.add(dateStr);
  }

  return result;
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Parse request body for selected task IDs and week start (optional)
  let selectedTaskIds: string[] | undefined;
  let weekStartParam: string | undefined;
  try {
    const body = await request.json();
    selectedTaskIds = body.taskIds;
    weekStartParam = body.weekStart;
  } catch {
    // No body or invalid JSON - schedule all tasks (backward compatible)
  }
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is in a family
    const familyMembership = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      include: {
        family: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    // Schedule from specified week start (or today) through end of that week
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate the FULL week range (Monday to Sunday) for querying existing scheduled tasks
    // This ensures we know what's already scheduled, even if we're mid-week
    let fullWeekStart: Date;
    let fullWeekEnd: Date;

    // Calculate the scheduling range (today onwards)
    let schedulingStart: Date;

    if (weekStartParam) {
      // Use provided week start
      const providedStart = new Date(weekStartParam + "T00:00:00");
      fullWeekStart = startOfWeek(providedStart, { weekStartsOn: 1 });
      fullWeekEnd = endOfWeek(providedStart, { weekStartsOn: 1 });
      // Only schedule from today if the provided start is in the past
      schedulingStart = providedStart < today ? today : providedStart;
    } else {
      // Default behavior - current week
      fullWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      fullWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
      // Start scheduling from today (or Monday if Sunday)
      schedulingStart = now.getDay() === 0
        ? addDays(today, 1) // Start from Monday if today is Sunday
        : today;
    }

    // For backward compatibility, keep weekStart and weekEnd
    const weekStart = schedulingStart;
    const weekEnd = fullWeekEnd;

    // If user is in a family with 2 members, use family scheduling
    if (familyMembership && familyMembership.family.members.length === 2) {
      const familyMembers = familyMembership.family.members;

      // Get all family members' data
      const membersData = await Promise.all(
        familyMembers.map(async (member) => {
          // Get calendar events
          let calendarEvents: CalendarEvent[] = [];
          try {
            calendarEvents = await getCalendarEvents(member.userId, weekStart, weekEnd);
          } catch {
            console.log(`Calendar not connected for user ${member.userId}`);
          }

          // Get blocked times (work schedule, vacations, holidays)
          const blockedTimes = await getBlockedTimesForRange(member.userId, weekStart, weekEnd);
          const availabilityInfo = await getUserAvailabilityInfo(member.userId);

          // Get tasks (personal tasks for this user)
          const tasks = await prisma.task.findMany({
            where: { userId: member.userId },
            orderBy: { priority: "asc" },
          });

          return {
            userId: member.userId,
            userName: member.user.name || "User",
            calendarEvents,
            tasks,
            blockedTimes,
            availabilityInfo,
          };
        })
      );

      // Get shared family tasks
      const familyTasks = await prisma.task.findMany({
        where: { familyId: familyMembership.family.id },
        orderBy: { priority: "asc" },
      });

      // Combine all tasks
      const allTasks = [...membersData.flatMap(m => m.tasks), ...familyTasks];

      if (allTasks.length === 0) {
        return NextResponse.json(
          { error: "No tasks to schedule. Please add some tasks first." },
          { status: 400 }
        );
      }

      // Get existing scheduled tasks for the FULL week (so we know what's already scheduled)
      const allTaskIds = allTasks.map(t => t.id);
      const existingScheduledByTask = await getExistingScheduledByTask(allTaskIds, fullWeekStart, fullWeekEnd);

      console.log(`[generate-family] Existing scheduled tasks: ${existingScheduledByTask.size} tasks have scheduled instances`);

      // Generate family schedule using AI (membersData now includes blockedTimes and availabilityInfo)
      const scheduleResult = await generateFamilySchedule({
        familyMembers: membersData,
        familyTasks,
        weekStart,
        existingScheduledByTask,
      });

      return NextResponse.json(scheduleResult);
    }

    // Single user scheduling (no family or incomplete family)
    // Get user's tasks - filter by selected IDs if provided
    const tasks = await prisma.task.findMany({
      where: {
        userId: session.user.id,
        ...(selectedTaskIds && selectedTaskIds.length > 0
          ? { id: { in: selectedTaskIds } }
          : {}),
      },
      orderBy: { priority: "asc" },
    });

    if (tasks.length === 0) {
      return NextResponse.json(
        { error: "No tasks to schedule. Please add some tasks first." },
        { status: 400 }
      );
    }

    let calendarEvents: CalendarEvent[] = [];
    try {
      calendarEvents = await getCalendarEvents(session.user.id, weekStart, weekEnd);
    } catch {
      console.log("Calendar not connected, proceeding with empty calendar");
    }

    // Get blocked times (work schedule, vacations, holidays)
    const blockedTimes = await getBlockedTimesForRange(session.user.id, weekStart, weekEnd);
    const availabilityInfo = await getUserAvailabilityInfo(session.user.id);

    // Get existing scheduled tasks for the FULL week (Monday to Sunday)
    // This ensures we know what's already scheduled, even for past days
    // The scheduling logic will only try to schedule for future days
    const taskIds = tasks.map(t => t.id);
    const existingScheduledByTask = await getExistingScheduledByTask(taskIds, fullWeekStart, fullWeekEnd);

    console.log(`\n========== OPTIMIZE MY WEEK DEBUG ==========`);
    console.log(`[generate] fullWeekStart: ${format(fullWeekStart, "yyyy-MM-dd")}, fullWeekEnd: ${format(fullWeekEnd, "yyyy-MM-dd")}`);
    console.log(`[generate] schedulingStart (weekStart): ${format(weekStart, "yyyy-MM-dd")}, weekEnd: ${format(weekEnd, "yyyy-MM-dd")}`);
    console.log(`[generate] Tasks to schedule: ${tasks.length}`);
    tasks.forEach(t => {
      const existing = existingScheduledByTask.get(t.id);
      console.log(`[generate] - ${t.name}: freq=${t.frequency}/${t.frequencyPeriod}, mode=${t.schedulingMode}, existingCount=${existing?.count || 0}, existingDates=${existing ? Array.from(existing.dates).join(',') : 'none'}`);
    });
    console.log(`============================================\n`);

    // Get learned preferences if any
    const learningData = await prisma.learningData.findMany({
      where: { userId: session.user.id },
    });

    const learnedPreferences = learningData.reduce((acc, item) => {
      acc[`${item.taskType}-${item.taskCategory || "general"}`] = {
        learnedDuration: item.learnedDuration,
        preferences: item.learnedPreferences,
      };
      return acc;
    }, {} as Record<string, unknown>);

    // Generate schedule using hybrid approach (deterministic + AI)
    const scheduleResult = await generateSchedule({
      userId: session.user.id,
      userName: user.name || "User",
      calendarEvents,
      tasks,
      learnedPreferences: Object.keys(learnedPreferences).length > 0 ? learnedPreferences : undefined,
      weekStart,
      blockedTimes,
      availabilityInfo,
      existingScheduledByTask,
    });

    return NextResponse.json(scheduleResult);
  } catch (error) {
    console.error("Error generating schedule:", error);
    const message = error instanceof Error ? error.message : "Failed to generate schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
