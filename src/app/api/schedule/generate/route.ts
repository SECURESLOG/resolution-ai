import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCalendarEvents } from "@/lib/calendar";
import { generateSchedule, generateFamilySchedule } from "@/lib/ai-scheduler";
import { startOfWeek, endOfWeek, addDays } from "date-fns";
import { CalendarEvent } from "@/types";

export const dynamic = "force-dynamic";

export async function POST() {
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

    // Get calendar events for the next week
    const now = new Date();
    const weekStart = now.getDay() === 0 ? addDays(now, 1) : startOfWeek(addDays(now, 1), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

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

      // Generate family schedule using AI
      const scheduleResult = await generateFamilySchedule({
        familyMembers: membersData,
        familyTasks,
        weekStart,
      });

      return NextResponse.json(scheduleResult);
    }

    // Single user scheduling (no family or incomplete family)
    // Get user's tasks
    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
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

    // Generate schedule using AI
    const scheduleResult = await generateSchedule({
      userId: session.user.id,
      userName: user.name || "User",
      calendarEvents,
      tasks,
      learnedPreferences: Object.keys(learnedPreferences).length > 0 ? learnedPreferences : undefined,
      weekStart,
    });

    return NextResponse.json(scheduleResult);
  } catch (error) {
    console.error("Error generating schedule:", error);
    const message = error instanceof Error ? error.message : "Failed to generate schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
