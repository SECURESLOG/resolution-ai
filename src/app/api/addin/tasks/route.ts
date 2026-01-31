import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek } from "date-fns";

// GET - Fetch pending tasks for the add-in to sync
export async function GET(request: NextRequest) {
  try {
    // Get user token from header (add-in will send this)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    // Validate the token (simple token-based auth for add-in)
    const addinToken = await prisma.addinToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!addinToken || addinToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const userId = addinToken.userId;

    // Get current week's scheduled tasks that haven't been synced to work calendar
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const pendingTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: userId,
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
        // Only get tasks not yet synced to work calendar
        workCalendarEventId: null,
      },
      include: {
        task: true,
      },
      orderBy: {
        startTime: "asc",
      },
    });

    // Format tasks for the add-in
    const tasks = pendingTasks.map((st) => ({
      id: st.id,
      taskId: st.taskId,
      title: st.task.name,
      type: st.task.type,
      category: st.task.category,
      startTime: st.startTime.toISOString(),
      endTime: st.endTime.toISOString(),
      description: st.aiReasoning || `Scheduled by ResolutionAI`,
    }));

    return NextResponse.json({
      tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error("Error fetching add-in tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST - Mark tasks as synced to work calendar
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    const addinToken = await prisma.addinToken.findUnique({
      where: { token },
    });

    if (!addinToken || addinToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, workCalendarEventId } = body;

    if (!taskId || !workCalendarEventId) {
      return NextResponse.json(
        { error: "taskId and workCalendarEventId are required" },
        { status: 400 }
      );
    }

    // Verify the task belongs to this user
    const task = await prisma.scheduledTask.findFirst({
      where: {
        id: taskId,
        assignedToUserId: addinToken.userId,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Update the task with the work calendar event ID
    await prisma.scheduledTask.update({
      where: { id: taskId },
      data: { workCalendarEventId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating synced task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}
