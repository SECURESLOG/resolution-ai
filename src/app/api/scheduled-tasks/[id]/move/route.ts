import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, parseISO, isSameDay, areIntervalsOverlapping } from "date-fns";
import { z } from "zod";

export const dynamic = "force-dynamic";

const moveTaskSchema = z.object({
  newStartTime: z.string(), // ISO datetime string
  newEndTime: z.string(), // ISO datetime string
  reason: z.string().optional(),
});

interface ConflictInfo {
  type: "displaced" | "shortened" | "overlapping";
  conflictingTask: {
    id: string;
    name: string;
    startTime: Date;
    endTime: Date;
  };
  resolution?: {
    newStartTime?: Date;
    newEndTime?: Date;
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { newStartTime, newEndTime, reason } = moveTaskSchema.parse(body);

    const newStart = parseISO(newStartTime);
    const newEnd = parseISO(newEndTime);

    // Get the scheduled task being moved
    const scheduledTask = await prisma.scheduledTask.findFirst({
      where: {
        id,
        assignedToUserId: session.user.id,
      },
      include: {
        task: true,
      },
    });

    if (!scheduledTask) {
      return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
    }

    // Find other scheduled tasks on the same day that might conflict
    const sameDayTasks = await prisma.scheduledTask.findMany({
      where: {
        id: { not: id },
        assignedToUserId: session.user.id,
        scheduledDate: scheduledTask.scheduledDate,
        status: { not: "skipped" },
      },
      include: {
        task: true,
      },
      orderBy: { startTime: "asc" },
    });

    // Check for conflicts
    const conflicts: ConflictInfo[] = [];

    for (const otherTask of sameDayTasks) {
      const otherStart = new Date(otherTask.startTime);
      const otherEnd = new Date(otherTask.endTime);

      // Check if the new time overlaps with this task
      const overlaps = areIntervalsOverlapping(
        { start: newStart, end: newEnd },
        { start: otherStart, end: otherEnd }
      );

      if (overlaps) {
        // Determine conflict type
        const movedTaskDuration = newEnd.getTime() - newStart.getTime();
        const otherTaskDuration = otherEnd.getTime() - otherStart.getTime();
        const overlapStart = new Date(Math.max(newStart.getTime(), otherStart.getTime()));
        const overlapEnd = new Date(Math.min(newEnd.getTime(), otherEnd.getTime()));
        const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();

        // If the overlap is partial, we might shorten the other task
        if (overlapDuration < otherTaskDuration * 0.5) {
          // Less than 50% overlap - shorten the conflicting task
          let newOtherStart = otherStart;
          let newOtherEnd = otherEnd;

          if (newStart <= otherStart) {
            // Moved task starts before or at same time - push other task later
            newOtherStart = newEnd;
            newOtherEnd = new Date(newEnd.getTime() + (otherEnd.getTime() - otherStart.getTime() - overlapDuration));
          } else {
            // Moved task starts after - end other task earlier
            newOtherEnd = newStart;
          }

          conflicts.push({
            type: "shortened",
            conflictingTask: {
              id: otherTask.id,
              name: otherTask.task.name,
              startTime: otherStart,
              endTime: otherEnd,
            },
            resolution: {
              newStartTime: newOtherStart,
              newEndTime: newOtherEnd,
            },
          });
        } else {
          // Significant overlap - mark as displaced
          conflicts.push({
            type: "displaced",
            conflictingTask: {
              id: otherTask.id,
              name: otherTask.task.name,
              startTime: otherStart,
              endTime: otherEnd,
            },
          });
        }
      }
    }

    // Return conflicts for user confirmation if any exist
    if (conflicts.length > 0) {
      // Check if user has already confirmed (via query param)
      const confirmed = request.nextUrl.searchParams.get("confirmed") === "true";

      if (!confirmed) {
        return NextResponse.json({
          requiresConfirmation: true,
          conflicts: conflicts.map((c) => ({
            type: c.type,
            taskName: c.conflictingTask.name,
            taskId: c.conflictingTask.id,
            originalTime: {
              start: c.conflictingTask.startTime,
              end: c.conflictingTask.endTime,
            },
            resolution: c.resolution,
          })),
          message: `Moving this task will affect ${conflicts.length} other task(s). Do you want to proceed?`,
        });
      }
    }

    // Proceed with the move
    const weekOf = startOfWeek(scheduledTask.scheduledDate, { weekStartsOn: 1 });

    // Update the moved task
    const updatedTask = await prisma.scheduledTask.update({
      where: { id },
      data: {
        startTime: newStart,
        endTime: newEnd,
        wasManuallyMoved: true,
        originalStartTime: scheduledTask.wasManuallyMoved
          ? scheduledTask.originalStartTime
          : scheduledTask.startTime,
        originalEndTime: scheduledTask.wasManuallyMoved
          ? scheduledTask.originalEndTime
          : scheduledTask.endTime,
        movedAt: new Date(),
        movedBy: session.user.id,
        moveReason: reason,
      },
      include: {
        task: true,
      },
    });

    // Handle conflicts - update conflicting tasks and create conflict records
    for (const conflict of conflicts) {
      if (conflict.type === "shortened" && conflict.resolution) {
        // Update the shortened task
        await prisma.scheduledTask.update({
          where: { id: conflict.conflictingTask.id },
          data: {
            startTime: conflict.resolution.newStartTime,
            endTime: conflict.resolution.newEndTime,
            wasShortened: true,
            originalDuration: Math.round(
              (conflict.conflictingTask.endTime.getTime() - conflict.conflictingTask.startTime.getTime()) / 60000
            ),
          },
        });
      }

      // Create conflict record
      await prisma.scheduleConflict.create({
        data: {
          userId: session.user.id,
          weekOf,
          movedScheduledTaskId: id,
          movedTaskId: scheduledTask.taskId,
          displacedScheduledTaskId: conflict.conflictingTask.id,
          displacedTaskId: await getTaskIdForScheduledTask(conflict.conflictingTask.id),
          originalStartTime: scheduledTask.startTime,
          originalEndTime: scheduledTask.endTime,
          newStartTime: newStart,
          newEndTime: newEnd,
          resolutionType: conflict.type,
          displacedTaskNewStart: conflict.resolution?.newStartTime,
          displacedTaskNewEnd: conflict.resolution?.newEndTime,
          userAccepted: true,
        },
      });
    }

    // Also create a conflict record for the moved task itself (for tracking purposes)
    if (conflicts.length === 0) {
      // Simple move without conflicts - still track it
      await prisma.scheduleConflict.create({
        data: {
          userId: session.user.id,
          weekOf,
          movedScheduledTaskId: id,
          movedTaskId: scheduledTask.taskId,
          originalStartTime: scheduledTask.startTime,
          originalEndTime: scheduledTask.endTime,
          newStartTime: newStart,
          newEndTime: newEnd,
          resolutionType: "displaced",
          userAccepted: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      scheduledTask: updatedTask,
      conflictsResolved: conflicts.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error moving scheduled task:", error);
    return NextResponse.json({ error: "Failed to move scheduled task" }, { status: 500 });
  }
}

async function getTaskIdForScheduledTask(scheduledTaskId: string): Promise<string | null> {
  const st = await prisma.scheduledTask.findUnique({
    where: { id: scheduledTaskId },
    select: { taskId: true },
  });
  return st?.taskId || null;
}
