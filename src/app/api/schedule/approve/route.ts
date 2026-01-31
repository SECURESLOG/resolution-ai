import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/calendar";
import { z } from "zod";
import { parseISO, parse, startOfWeek, endOfWeek, addDays } from "date-fns";

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

    // Calculate the week range from the first recommendation
    if (recommendations.length > 0) {
      const firstDate = parseISO(recommendations[0].date);
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

    for (const rec of recommendations) {
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

    return NextResponse.json({
      message: `Successfully scheduled ${successCount} of ${recommendations.length} tasks`,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error approving schedule:", error);
    return NextResponse.json({ error: "Failed to approve schedule" }, { status: 500 });
  }
}
