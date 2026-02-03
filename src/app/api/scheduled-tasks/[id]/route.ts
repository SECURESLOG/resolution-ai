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

    const scheduledTask = await prisma.scheduledTask.findFirst({
      where: {
        id,
        assignedToUserId: session.user.id,
      },
    });

    if (!scheduledTask) {
      return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
    }

    // Determine if learning should be enabled (default: true, unless explicitly set)
    const shouldLearn = validatedData.learningEnabled !== false;

    const updated = await prisma.scheduledTask.update({
      where: { id },
      data: {
        ...validatedData,
        learningEnabled: shouldLearn,
        outcomeRecordedAt: (validatedData.status === "completed" || validatedData.status === "skipped")
          ? new Date()
          : undefined,
      },
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

    return NextResponse.json(updated);
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
