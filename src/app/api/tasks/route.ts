import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const createTaskSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  type: z.enum(["resolution", "household"]),
  duration: z.number().min(5, "Duration must be at least 5 minutes"),
  isFlexible: z.boolean().default(true),
  category: z.string().optional(),
  priority: z.number().min(1).max(4).default(3),

  // Scheduling mode
  schedulingMode: z.enum(["fixed", "flexible"]).default("flexible"),

  // Fixed schedule settings
  fixedDays: z.array(z.enum(DAYS_OF_WEEK)).optional().default([]),
  fixedTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),

  // Flexible schedule settings
  frequency: z.number().min(1).max(14).optional().default(1),
  frequencyPeriod: z.enum(["day", "week"]).optional().default("week"),
  requiredDays: z.array(z.enum(DAYS_OF_WEEK)).optional().default([]),
  preferredDays: z.array(z.enum(DAYS_OF_WEEK)).optional().default([]),
  preferredTimeStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  preferredTimeEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  minDuration: z.number().min(5).optional().nullable(),
  maxDuration: z.number().min(5).optional().nullable(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        scheduledTasks: {
          where: {
            scheduledDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
          orderBy: { scheduledDate: "asc" },
        },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createTaskSchema.parse(body);

    // Extract fields for Prisma create
    const {
      schedulingMode,
      fixedDays,
      fixedTime,
      frequency,
      frequencyPeriod,
      requiredDays,
      preferredDays,
      preferredTimeStart,
      preferredTimeEnd,
      minDuration,
      maxDuration,
      ...baseData
    } = validatedData;

    const task = await prisma.task.create({
      data: {
        ...baseData,
        userId: session.user.id,
        schedulingMode,
        fixedDays: fixedDays || [],
        fixedTime: fixedTime || null,
        frequency: frequency || 1,
        frequencyPeriod: frequencyPeriod || "week",
        requiredDays: requiredDays || [],
        preferredDays: preferredDays || [],
        preferredTimeStart: preferredTimeStart || null,
        preferredTimeEnd: preferredTimeEnd || null,
        minDuration: minDuration || null,
        maxDuration: maxDuration || null,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error creating task:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
