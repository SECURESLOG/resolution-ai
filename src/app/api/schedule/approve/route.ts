import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/calendar";
import { z } from "zod";
import { parseISO, parse, startOfWeek, endOfWeek } from "date-fns";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  recommendations: z.array(
    z.object({
      taskId: z.string(),
      taskName: z.string(),
      taskType: z.string(),
      date: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      reasoning: z.string().optional(),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { recommendations } = approveSchema.parse(body);

    // Get all tasks to validate constraints
    const taskIds = recommendations.map(r => r.taskId);
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
    });

    // Build task info map for validation
    const dayNameToNumber: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };

    const getDayNumbers = (days: unknown[] | null): number[] => {
      if (!days || days.length === 0) return [];
      return (days as unknown[]).map(d => {
        if (typeof d === 'number') return d;
        if (typeof d === 'string') return dayNameToNumber[d.toLowerCase()] ?? -1;
        return -1;
      }).filter(n => n >= 0);
    };

    const taskInfoMap = new Map<string, {
      userId: string | null;
      type: string;
      schedulingMode: string | null;
      fixedDays: number[];
      fixedTime: string | null;
      requiredDays: number[];
    }>();

    for (const task of tasks) {
      taskInfoMap.set(task.id, {
        userId: task.userId,
        type: task.type,
        schedulingMode: task.schedulingMode,
        fixedDays: getDayNumbers(task.fixedDays as unknown[] | null),
        fixedTime: task.fixedTime,
        requiredDays: getDayNumbers(task.requiredDays as unknown[] | null),
      });
    }

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // Validate and filter recommendations
    const validatedRecommendations = recommendations.filter((rec) => {
      const taskInfo = taskInfoMap.get(rec.taskId);
      if (!taskInfo) {
        console.warn(`FILTERED: Task ${rec.taskId} (${rec.taskName}) not found`);
        return false;
      }

      // Parse date correctly to avoid timezone issues
      const dateParts = rec.date.split('-');
      const scheduledDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2])
      );
      const dayOfWeek = scheduledDate.getDay();

      // Resolution tasks must be assigned to their owner
      if (taskInfo.type === "resolution" && session.user.id !== taskInfo.userId) {
        console.warn(`FILTERED: ${rec.taskName} - resolution task not owned by current user`);
        return false;
      }

      // Validate day constraints for fixed schedules
      if (taskInfo.schedulingMode === "fixed" && taskInfo.fixedDays.length > 0) {
        if (!taskInfo.fixedDays.includes(dayOfWeek)) {
          const allowedDays = taskInfo.fixedDays.map(d => dayNames[d]).join(", ");
          console.warn(`FILTERED: ${rec.taskName} scheduled on ${dayNames[dayOfWeek]} but only allowed on: ${allowedDays}`);
          return false;
        }
      }

      // Also check requiredDays
      if (taskInfo.requiredDays.length > 0) {
        if (!taskInfo.requiredDays.includes(dayOfWeek)) {
          const allowedDays = taskInfo.requiredDays.map(d => dayNames[d]).join(", ");
          console.warn(`FILTERED: ${rec.taskName} scheduled on ${dayNames[dayOfWeek]} but required days are: ${allowedDays}`);
          return false;
        }
      }

      // Validate fixedTime constraint
      if (taskInfo.schedulingMode === "fixed" && taskInfo.fixedTime) {
        const [fixedHour, fixedMinute] = taskInfo.fixedTime.split(':').map(Number);
        const [recHour, recMinute] = rec.startTime.split(':').map(Number);
        const scheduledMinutes = recHour * 60 + recMinute;
        const fixedMinutes = fixedHour * 60 + fixedMinute;
        const timeDiff = Math.abs(scheduledMinutes - fixedMinutes);

        if (timeDiff > 15) {
          console.warn(`FILTERED: ${rec.taskName} scheduled at ${rec.startTime} but must be at ${taskInfo.fixedTime}`);
          return false;
        }
      }

      console.log(`PASSED: ${rec.taskName} on ${dayNames[dayOfWeek]}`);
      return true;
    });

    console.log(`Validation: ${validatedRecommendations.length}/${recommendations.length} tasks passed`);

    // Calculate the week range from the first recommendation
    if (validatedRecommendations.length > 0) {
      const firstDate = parseISO(validatedRecommendations[0].date);
      const weekStart = startOfWeek(firstDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(firstDate, { weekStartsOn: 1 });

      // Find existing scheduled tasks for this week
      const existingTasks = await prisma.scheduledTask.findMany({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
      });

      // Delete existing calendar events and scheduled tasks
      for (const task of existingTasks) {
        if (task.calendarEventId) {
          try {
            await deleteCalendarEvent(session.user.id, task.calendarEventId);
            console.log("Deleted calendar event:", task.calendarEventId);
          } catch (error) {
            console.log("Could not delete calendar event:", task.calendarEventId, error);
          }
        }
      }

      // Delete all existing scheduled tasks for the week
      await prisma.scheduledTask.deleteMany({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
      });

      console.log(`Cleared ${existingTasks.length} existing scheduled tasks for the week`);
    }

    const results = [];
    const filteredCount = recommendations.length - validatedRecommendations.length;

    for (const rec of validatedRecommendations) {
      try {
        // Parse date and times
        const date = parseISO(rec.date);
        const startTime = parse(rec.startTime, "HH:mm", date);
        const endTime = parse(rec.endTime, "HH:mm", date);

        // Create calendar event
        let calendarEventId: string | null = null;
        let calendarError: string | null = null;
        try {
          calendarEventId = await createCalendarEvent(
            session.user.id,
            `[ResolutionAI] ${rec.taskName}`,
            `Type: ${rec.taskType}\n\n${rec.reasoning || "Scheduled by ResolutionAI"}`,
            startTime,
            endTime
          );
          console.log("Calendar event created:", calendarEventId);
        } catch (error) {
          console.error("Could not create calendar event:", error);
          calendarError = error instanceof Error ? error.message : "Unknown calendar error";
        }

        // Create scheduled task record
        const scheduledTask = await prisma.scheduledTask.create({
          data: {
            taskId: rec.taskId,
            assignedToUserId: session.user.id,
            scheduledDate: date,
            startTime,
            endTime,
            status: "pending",
            calendarEventId,
            aiReasoning: rec.reasoning,
          },
        });

        results.push({
          success: true,
          taskId: rec.taskId,
          scheduledTaskId: scheduledTask.id,
          calendarEventId,
          calendarError,
        });
      } catch (error) {
        console.error(`Error scheduling task ${rec.taskId}:`, error);
        results.push({
          success: false,
          taskId: rec.taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    // Update onboarding progress - first schedule generated
    if (successCount > 0) {
      await prisma.onboardingProgress.upsert({
        where: { userId: session.user.id },
        update: { firstScheduleGenerated: true },
        create: { userId: session.user.id, firstScheduleGenerated: true },
      });
    }

    let message = `Successfully scheduled ${successCount} of ${validatedRecommendations.length} tasks`;
    if (filteredCount > 0) {
      message += ` (${filteredCount} tasks were filtered due to scheduling constraints)`;
    }

    return NextResponse.json({
      message,
      results,
      filteredCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error approving schedule:", error);
    return NextResponse.json({ error: "Failed to approve schedule" }, { status: 500 });
  }
}
