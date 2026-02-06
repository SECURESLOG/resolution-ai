import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteCalendarEvent } from "@/lib/calendar";
import { trackTaskOutcome } from "@/lib/opik-evaluators";
import { flushOpik } from "@/lib/opik";
import { getWeek } from "date-fns";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["pending", "completed", "skipped"]).optional(),
  learningEnabled: z.boolean().optional(),
  // Rescheduling fields
  scheduledDate: z.string().optional(), // ISO date string
  startTime: z.string().optional(), // ISO datetime string
  endTime: z.string().optional(), // ISO datetime string
  // Reassignment field
  assignedToUserId: z.string().optional(),
});

export async function PATCH(
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
    const validatedData = updateSchema.parse(body);

    // First find the task to check ownership and type
    const scheduledTask = await prisma.scheduledTask.findUnique({
      where: { id },
      include: { task: true },
    });

    if (!scheduledTask) {
      return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
    }

    // Check if user can modify this task
    const isOwner = scheduledTask.assignedToUserId === session.user.id;

    // For reassignment, check family membership
    if (validatedData.assignedToUserId && validatedData.assignedToUserId !== scheduledTask.assignedToUserId) {
      // Only Life Admin (household) tasks can be reassigned
      if (scheduledTask.task.type !== "household") {
        return NextResponse.json(
          { error: "Only Life Admin tasks can be reassigned" },
          { status: 403 }
        );
      }

      // Check if both users are in the same family
      const currentUserFamily = await prisma.familyMember.findFirst({
        where: { userId: session.user.id },
      });

      if (!currentUserFamily) {
        return NextResponse.json(
          { error: "You must be in a family to reassign tasks" },
          { status: 403 }
        );
      }

      const targetInSameFamily = await prisma.familyMember.findFirst({
        where: {
          userId: validatedData.assignedToUserId,
          familyId: currentUserFamily.familyId,
        },
      });

      if (!targetInSameFamily) {
        return NextResponse.json(
          { error: "Can only reassign to family members" },
          { status: 403 }
        );
      }
    } else if (!isOwner) {
      // For non-reassignment updates, must be owner
      return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
    }

    // Determine if learning should be enabled (default: true, unless explicitly set)
    const shouldLearn = validatedData.learningEnabled !== false;

    // Build update data
    const updateData: Record<string, unknown> = {
      learningEnabled: shouldLearn,
    };

    if (validatedData.status) {
      updateData.status = validatedData.status;
    }

    if (validatedData.status === "completed" || validatedData.status === "skipped") {
      updateData.outcomeRecordedAt = new Date();
    }

    // Handle rescheduling fields
    if (validatedData.scheduledDate) {
      updateData.scheduledDate = new Date(validatedData.scheduledDate);
    }
    if (validatedData.startTime) {
      updateData.startTime = new Date(validatedData.startTime);
    }
    if (validatedData.endTime) {
      updateData.endTime = new Date(validatedData.endTime);
    }

    // Track reassignment patterns
    let reassignmentPatternInfo: {
      shouldPromptDefaultChange?: boolean;
      shouldPromptOwnership?: boolean;
      reassignmentCount?: number;
      targetUserName?: string;
    } = {};

    // Handle reassignment
    if (validatedData.assignedToUserId && validatedData.assignedToUserId !== scheduledTask.assignedToUserId) {
      updateData.assignedToUserId = validatedData.assignedToUserId;

      // Log the reassignment
      await prisma.taskReassignmentLog.create({
        data: {
          taskId: scheduledTask.taskId,
          fromUserId: scheduledTask.assignedToUserId,
          toUserId: validatedData.assignedToUserId,
          scheduledTaskId: scheduledTask.id,
        },
      });

      // Check for reassignment patterns
      const reassignmentLogs = await prisma.taskReassignmentLog.findMany({
        where: { taskId: scheduledTask.taskId },
        orderBy: { createdAt: "desc" },
        take: 10, // Last 10 reassignments
        include: {
          toUser: { select: { name: true } },
        },
      });

      // Pattern 1: Same person has been assigned 3+ times
      const reassignmentsToTarget = reassignmentLogs.filter(
        (log) => log.toUserId === validatedData.assignedToUserId
      );
      if (reassignmentsToTarget.length >= 3) {
        const targetUser = await prisma.user.findUnique({
          where: { id: validatedData.assignedToUserId },
          select: { name: true },
        });
        reassignmentPatternInfo = {
          shouldPromptDefaultChange: true,
          reassignmentCount: reassignmentsToTarget.length,
          targetUserName: targetUser?.name || "this person",
        };
      }

      // Pattern 2: Ping-pong (A->B, B->A pattern at least 2 times)
      if (reassignmentLogs.length >= 4) {
        let pingPongCount = 0;
        for (let i = 0; i < reassignmentLogs.length - 1; i++) {
          const current = reassignmentLogs[i];
          const next = reassignmentLogs[i + 1];
          // Check if this is a back-and-forth pattern
          if (current.fromUserId === next.toUserId && current.toUserId === next.fromUserId) {
            pingPongCount++;
          }
        }
        if (pingPongCount >= 2) {
          reassignmentPatternInfo.shouldPromptOwnership = true;
        }
      }

      // Get current user's name for notification
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
      });

      // Create notification for the new assignee
      await prisma.notification.create({
        data: {
          userId: validatedData.assignedToUserId,
          type: "suggestion",
          title: "Task Assigned to You",
          message: `${currentUser?.name || "A family member"} assigned "${scheduledTask.task.name}" to you for ${new Date(scheduledTask.scheduledDate).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.`,
          actionUrl: "/schedule",
          actionLabel: "View Schedule",
          priority: "normal",
          scheduledFor: new Date(),
        },
      });
    }

    const updated = await prisma.scheduledTask.update({
      where: { id },
      data: updateData,
      include: { task: true },
    });

    // Log task outcome to Opik for AI learning when status changes AND learning is enabled
    if ((validatedData.status === "completed" || validatedData.status === "skipped") && shouldLearn) {
      try {
        // Calculate time of day for preference learning
        const hour = updated.startTime.getHours();
        const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        const dayOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][updated.scheduledDate.getDay()];

        // Find or create relevant preference and add evidence
        const preferenceKey = `${updated.task.name.toLowerCase().replace(/\s+/g, "_")}_time_preference`;

        // Try to find existing preference or create new one
        const existingPreference = await prisma.userPreference.findUnique({
          where: {
            userId_key: {
              userId: session.user.id,
              key: preferenceKey,
            },
          },
        });

        let preferenceId: string;

        if (existingPreference) {
          preferenceId = existingPreference.id;

          // Update confidence based on new evidence
          const evidenceCount = await prisma.preferenceEvidence.count({
            where: { preferenceId: existingPreference.id },
          });

          // Increase confidence with more evidence (max 0.95)
          const newConfidence = Math.min(0.95, 0.5 + (evidenceCount * 0.05));

          await prisma.userPreference.update({
            where: { id: existingPreference.id },
            data: {
              confidence: newConfidence,
              value: {
                preferredTimeOfDay: timeOfDay,
                taskName: updated.task.name,
                lastOutcome: validatedData.status,
              },
            },
          });
        } else {
          // Create new preference
          const newPreference = await prisma.userPreference.create({
            data: {
              userId: session.user.id,
              key: preferenceKey,
              value: {
                preferredTimeOfDay: timeOfDay,
                taskName: updated.task.name,
                lastOutcome: validatedData.status,
              },
              confidence: 0.5,
              source: "inferred",
            },
          });
          preferenceId = newPreference.id;
        }

        // Add evidence to the preference
        await prisma.preferenceEvidence.create({
          data: {
            preferenceId,
            scheduledTaskId: updated.id,
            signalType: validatedData.status,
            signalStrength: validatedData.status === "completed" ? 1.0 : 0.8,
            taskName: updated.task.name,
            scheduledTime: updated.startTime,
            dayOfWeek,
            timeOfDay,
          },
        });

        // Log to Opik
        trackTaskOutcome({
          userId: session.user.id,
          scheduledTaskId: updated.id,
          taskName: updated.task.name,
          taskType: updated.task.type as "resolution" | "household",
          scheduledDate: updated.scheduledDate,
          scheduledTime: updated.startTime,
          outcome: validatedData.status,
          weekNumber: getWeek(updated.scheduledDate, { weekStartsOn: 1 }),
        });
        // Flush to ensure trace is sent
        await flushOpik();
      } catch (opikError) {
        // Don't fail the request if Opik logging fails
        console.error("Failed to log task outcome to Opik:", opikError);
      }
    }

    // Include reassignment pattern info in response if relevant
    return NextResponse.json({
      ...updated,
      reassignmentPatternInfo: Object.keys(reassignmentPatternInfo).length > 0
        ? reassignmentPatternInfo
        : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating scheduled task:", error);
    return NextResponse.json({ error: "Failed to update scheduled task" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scheduledTask = await prisma.scheduledTask.findFirst({
      where: {
        id,
        assignedToUserId: session.user.id,
      },
    });

    if (!scheduledTask) {
      return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
    }

    // Delete calendar event if exists
    if (scheduledTask.calendarEventId) {
      try {
        await deleteCalendarEvent(session.user.id, scheduledTask.calendarEventId);
      } catch (error) {
        console.log("Could not delete calendar event:", error);
      }
    }

    await prisma.scheduledTask.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting scheduled task:", error);
    return NextResponse.json({ error: "Failed to delete scheduled task" }, { status: 500 });
  }
}
