import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const updateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["resolution", "household"]).optional(),
  duration: z.number().min(5).optional(),
  isFlexible: z.boolean().optional(),
  category: z.string().optional(),
  priority: z.number().min(1).max(4).optional(),

  // Default assignee for Life Admin tasks (learned from reassignment patterns)
  defaultAssigneeId: z.string().optional().nullable(),

  // Scheduling mode
  schedulingMode: z.enum(["fixed", "flexible"]).optional(),

  // Fixed schedule settings
  fixedDays: z.array(z.enum(DAYS_OF_WEEK)).optional(),
  fixedTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),

  // Flexible schedule settings
  frequency: z.number().min(1).max(14).optional(),
  frequencyPeriod: z.enum(["day", "week"]).optional(),
  requiredDays: z.array(z.enum(DAYS_OF_WEEK)).optional(),
  preferredDays: z.array(z.enum(DAYS_OF_WEEK)).optional(),
  preferredTimeStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  preferredTimeEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  minDuration: z.number().min(5).optional().nullable(),
  maxDuration: z.number().min(5).optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const task = await prisma.task.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        scheduledTasks: {
          orderBy: { scheduledDate: "desc" },
          take: 10,
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

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
    const validatedData = updateTaskSchema.parse(body);

    // Fetch existing task to validate constraints
    const existingTask = await prisma.task.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Determine the final scheduling mode and fixed time after update
    const finalSchedulingMode = validatedData.schedulingMode ?? existingTask.schedulingMode;
    const finalFixedTime = validatedData.fixedTime !== undefined
      ? validatedData.fixedTime
      : existingTask.fixedTime;

    // Validate: fixed scheduling mode requires fixedTime
    if (finalSchedulingMode === "fixed" && !finalFixedTime) {
      return NextResponse.json(
        { error: "Fixed schedule tasks require a specific time to be set" },
        { status: 400 }
      );
    }

    const task = await prisma.task.updateMany({
      where: {
        id,
        userId: session.user.id,
      },
      data: validatedData,
    });

    if (task.count === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updatedTask = await prisma.task.findUnique({ where: { id } });
    return NextResponse.json(updatedTask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating task:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
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

    const result = await prisma.task.deleteMany({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
