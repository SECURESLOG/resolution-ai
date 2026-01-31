import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteCalendarEvent } from "@/lib/calendar";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["pending", "completed", "skipped"]).optional(),
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

    const updated = await prisma.scheduledTask.update({
      where: { id },
      data: validatedData,
      include: { task: true },
    });

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
