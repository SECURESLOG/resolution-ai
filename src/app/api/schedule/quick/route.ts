import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/calendar";
import { z } from "zod";
import { parse, parseISO, startOfWeek } from "date-fns";

export const dynamic = "force-dynamic";

const quickScheduleSchema = z.object({
  taskId: z.string(),
  date: z.string(), // YYYY-MM-DD
  startTime: z.string(), // HH:mm
  endTime: z.string(), // HH:mm
  recordOverlap: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, date, startTime, endTime, recordOverlap } = quickScheduleSchema.parse(body);

    // Verify task belongs to user
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        userId: session.user.id,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Parse dates
    const scheduledDate = parseISO(date);
    const startDateTime = parse(startTime, "HH:mm", scheduledDate);
    const endDateTime = parse(endTime, "HH:mm", scheduledDate);

    // Create calendar event
    let calendarEventId: string | null = null;
    try {
      calendarEventId = await createCalendarEvent(
        session.user.id,
        `[ResolutionAI] ${task.name}`,
        `Type: ${task.type}\n\nScheduled via drag-and-drop`,
        startDateTime,
        endDateTime
      );
    } catch (error) {
      console.error("Could not create calendar event:", error);
    }

    // Create scheduled task
    const scheduledTask = await prisma.scheduledTask.create({
      data: {
        taskId,
        assignedToUserId: session.user.id,
        scheduledDate,
        startTime: startDateTime,
        endTime: endDateTime,
        status: "pending",
        calendarEventId,
        aiReasoning: "Manually scheduled via drag-and-drop",
      },
    });

    // Record overlap if user chose to schedule despite conflict
    if (recordOverlap) {
      await prisma.scheduleOverlap.create({
        data: {
          userId: session.user.id,
          scheduledTaskId: scheduledTask.id,
          overlapMinutes: task.duration,
          userAccepted: true,
          weekOf: startOfWeek(scheduledDate, { weekStartsOn: 1 }),
        },
      });
    }

    // Update onboarding progress
    await prisma.onboardingProgress.upsert({
      where: { userId: session.user.id },
      update: { firstScheduleGenerated: true },
      create: { userId: session.user.id, firstScheduleGenerated: true },
    });

    return NextResponse.json({
      success: true,
      scheduledTask,
      calendarEventId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error quick scheduling:", error);
    return NextResponse.json({ error: "Failed to schedule task" }, { status: 500 });
  }
}
