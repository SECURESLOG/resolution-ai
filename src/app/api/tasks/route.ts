import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createTaskSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  type: z.enum(["resolution", "household"]),
  duration: z.number().min(5, "Duration must be at least 5 minutes"),
  isFlexible: z.boolean().default(true),
  category: z.string().optional(),
  priority: z.number().min(1).max(4).default(3),
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

    const task = await prisma.task.create({
      data: {
        ...validatedData,
        userId: session.user.id,
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
