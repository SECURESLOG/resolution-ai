/**
 * Task Management Tools for AI Agents
 *
 * These tools allow agents to read, create, and manage tasks
 * and scheduled task instances.
 */

import prisma from "@/lib/prisma";
import { Task, ScheduledTask } from "@prisma/client";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addMinutes,
  format,
  parseISO,
} from "date-fns";

interface TaskWithDetails extends Task {
  scheduledTasks?: ScheduledTask[];
}

interface ScheduledTaskWithDetails extends ScheduledTask {
  task: Task;
  assignedTo: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface CreateScheduledTaskInput {
  taskId: string;
  assignedToUserId: string;
  scheduledDate: Date;
  startTime: Date;
  endTime: Date;
  aiReasoning?: string;
}

/**
 * Get all tasks for a user
 */
export async function getUserTasks(
  userId: string,
  filters?: {
    type?: "resolution" | "household";
    category?: string;
    includeScheduled?: boolean;
  }
): Promise<TaskWithDetails[]> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      ...(filters?.type && { type: filters.type }),
      ...(filters?.category && { category: filters.category }),
    },
    include: filters?.includeScheduled
      ? {
          scheduledTasks: {
            orderBy: { scheduledDate: "desc" },
            take: 5,
          },
        }
      : undefined,
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return tasks;
}

/**
 * Get all tasks for a family
 */
export async function getFamilyTasks(
  familyId: string,
  filters?: {
    type?: "resolution" | "household";
    category?: string;
  }
): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      ...(filters?.type && { type: filters.type }),
      ...(filters?.category && { category: filters.category }),
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return tasks;
}

/**
 * Get scheduled tasks for a user or family within a date range
 */
export async function getScheduledTasks(
  options: {
    userId?: string;
    familyId?: string;
    startDate: Date;
    endDate: Date;
    status?: "pending" | "completed" | "skipped";
  }
): Promise<ScheduledTaskWithDetails[]> {
  // Build user filter
  let userFilter: { assignedToUserId: string } | { assignedToUserId: { in: string[] } } | undefined;

  if (options.userId) {
    userFilter = { assignedToUserId: options.userId };
  } else if (options.familyId) {
    const members = await prisma.familyMember.findMany({
      where: { familyId: options.familyId },
      select: { userId: true },
    });
    userFilter = { assignedToUserId: { in: members.map((m) => m.userId) } };
  }

  const tasks = await prisma.scheduledTask.findMany({
    where: {
      ...userFilter,
      scheduledDate: {
        gte: options.startDate,
        lte: options.endDate,
      },
      ...(options.status && { status: options.status }),
    },
    include: {
      task: true,
      assignedTo: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return tasks as ScheduledTaskWithDetails[];
}

/**
 * Get today's scheduled tasks for a user
 */
export async function getTodaysTasks(userId: string): Promise<ScheduledTaskWithDetails[]> {
  const today = new Date();
  return getScheduledTasks({
    userId,
    startDate: startOfDay(today),
    endDate: endOfDay(today),
  });
}

/**
 * Get this week's scheduled tasks for a user
 */
export async function getWeeksTasks(userId: string): Promise<ScheduledTaskWithDetails[]> {
  const today = new Date();
  return getScheduledTasks({
    userId,
    startDate: startOfWeek(today, { weekStartsOn: 1 }),
    endDate: endOfWeek(today, { weekStartsOn: 1 }),
  });
}

/**
 * Get tomorrow's scheduled tasks for a user
 */
export async function getTomorrowsTasks(userId: string): Promise<ScheduledTaskWithDetails[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getScheduledTasks({
    userId,
    startDate: startOfDay(tomorrow),
    endDate: endOfDay(tomorrow),
  });
}

/**
 * Get scheduled tasks for a family member by their userId
 */
export async function getFamilyMemberTasks(
  familyMemberUserId: string,
  startDate: Date,
  endDate: Date
): Promise<ScheduledTaskWithDetails[]> {
  return getScheduledTasks({
    userId: familyMemberUserId,
    startDate,
    endDate,
  });
}

/**
 * Get tasks that haven't been scheduled yet
 */
export async function getUnscheduledTasks(
  userId: string,
  lookAheadDays: number = 7
): Promise<Task[]> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + lookAheadDays);

  // Get all user's tasks
  const tasks = await prisma.task.findMany({
    where: { userId },
    include: {
      scheduledTasks: {
        where: {
          scheduledDate: {
            gte: startOfDay(today),
            lte: endOfDay(endDate),
          },
          status: { not: "skipped" },
        },
      },
    },
  });

  // Filter to tasks without scheduled instances in the period
  return tasks.filter((t) => t.scheduledTasks.length === 0);
}

/**
 * Create a scheduled task instance
 */
export async function createScheduledTask(
  input: CreateScheduledTaskInput
): Promise<ScheduledTask> {
  const scheduledTask = await prisma.scheduledTask.create({
    data: {
      taskId: input.taskId,
      assignedToUserId: input.assignedToUserId,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      endTime: input.endTime,
      aiReasoning: input.aiReasoning,
      status: "pending",
    },
  });

  return scheduledTask;
}

/**
 * Create multiple scheduled tasks at once
 */
export async function createScheduledTasks(
  inputs: CreateScheduledTaskInput[]
): Promise<ScheduledTask[]> {
  const results: ScheduledTask[] = [];

  for (const input of inputs) {
    const task = await createScheduledTask(input);
    results.push(task);
  }

  return results;
}

/**
 * Update a scheduled task's status
 */
export async function updateScheduledTaskStatus(
  scheduledTaskId: string,
  status: "pending" | "completed" | "skipped"
): Promise<ScheduledTask> {
  return prisma.scheduledTask.update({
    where: { id: scheduledTaskId },
    data: { status },
  });
}

/**
 * Reschedule a task to a new time
 */
export async function rescheduleTask(
  scheduledTaskId: string,
  newStartTime: Date,
  newEndTime: Date,
  aiReasoning?: string
): Promise<ScheduledTask> {
  return prisma.scheduledTask.update({
    where: { id: scheduledTaskId },
    data: {
      scheduledDate: startOfDay(newStartTime),
      startTime: newStartTime,
      endTime: newEndTime,
      ...(aiReasoning && { aiReasoning }),
    },
  });
}

/**
 * Delete a scheduled task
 */
export async function deleteScheduledTask(scheduledTaskId: string): Promise<void> {
  await prisma.scheduledTask.delete({
    where: { id: scheduledTaskId },
  });
}

/**
 * Get task completion statistics
 */
export async function getTaskStats(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  total: number;
  completed: number;
  skipped: number;
  pending: number;
  completionRate: number;
  byType: Record<string, { total: number; completed: number }>;
}> {
  const tasks = await getScheduledTasks({
    userId,
    startDate,
    endDate,
  });

  const stats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    skipped: tasks.filter((t) => t.status === "skipped").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    completionRate: 0,
    byType: {} as Record<string, { total: number; completed: number }>,
  };

  stats.completionRate = stats.total > 0 ? stats.completed / stats.total : 0;

  // Group by type
  for (const task of tasks) {
    const type = task.task.type;
    if (!stats.byType[type]) {
      stats.byType[type] = { total: 0, completed: 0 };
    }
    stats.byType[type].total++;
    if (task.status === "completed") {
      stats.byType[type].completed++;
    }
  }

  return stats;
}

/**
 * Format tasks for AI context
 */
export function formatTasksForAI(tasks: Task[]): string {
  if (tasks.length === 0) {
    return "No tasks.";
  }

  return tasks
    .map((t) => {
      const priority = ["High", "Medium-High", "Medium", "Low"][t.priority - 1] || "Medium";
      return `- ${t.name} (${t.type}, ${t.duration}min, ${priority} priority)${
        t.category ? ` [${t.category}]` : ""
      }`;
    })
    .join("\n");
}

/**
 * Format scheduled tasks for AI context
 */
export function formatScheduledTasksForAI(tasks: ScheduledTaskWithDetails[]): string {
  if (tasks.length === 0) {
    return "No scheduled tasks.";
  }

  return tasks
    .map((t) => {
      const timeStr = `${format(t.startTime, "h:mm a")} - ${format(t.endTime, "h:mm a")}`;
      const statusIcon =
        t.status === "completed" ? "✓" : t.status === "skipped" ? "✗" : "○";
      return `${statusIcon} ${t.task.name} (${timeStr}) - ${t.assignedTo.name || "Unknown"}`;
    })
    .join("\n");
}

/**
 * Check for scheduling conflicts
 */
export async function checkForConflicts(
  userId: string,
  startTime: Date,
  endTime: Date,
  excludeTaskId?: string
): Promise<ScheduledTaskWithDetails[]> {
  const dayTasks = await getScheduledTasks({
    userId,
    startDate: startOfDay(startTime),
    endDate: endOfDay(startTime),
  });

  return dayTasks.filter((t) => {
    if (excludeTaskId && t.id === excludeTaskId) return false;

    const taskStart = new Date(t.startTime);
    const taskEnd = new Date(t.endTime);

    // Check for overlap
    return startTime < taskEnd && endTime > taskStart;
  });
}
