/**
 * Notification Tools for AI Agents
 *
 * These tools allow agents to create, manage, and query notifications
 * for reminders, suggestions, and other agent messages.
 */

import prisma from "@/lib/prisma";
import { Notification } from "@prisma/client";
import { addMinutes, addHours, addDays, isBefore } from "date-fns";

type NotificationType =
  | "reminder"
  | "suggestion"
  | "weekly_plan"
  | "conflict"
  | "achievement"
  | "feedback_request";

type NotificationPriority = "low" | "normal" | "high" | "urgent";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
  scheduledFor?: Date;
}

interface NotificationFilters {
  userId: string;
  type?: NotificationType;
  unreadOnly?: boolean;
  priority?: NotificationPriority;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * Create a new notification
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification> {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
      actionLabel: input.actionLabel,
      priority: input.priority || "normal",
      metadata: input.metadata as object || undefined,
      scheduledFor: input.scheduledFor || new Date(),
    },
  });
}

/**
 * Create a task reminder notification
 */
export async function createTaskReminder(
  userId: string,
  taskName: string,
  scheduledTaskId: string,
  startTime: Date,
  reminderMinutesBefore: number = 30
): Promise<Notification> {
  const scheduledFor = addMinutes(startTime, -reminderMinutesBefore);

  // Don't create reminders for past times
  if (isBefore(scheduledFor, new Date())) {
    // Schedule for now if the reminder time has passed
    return createNotification({
      userId,
      type: "reminder",
      title: `Task Starting Soon: ${taskName}`,
      message: `Your task "${taskName}" is starting now or has already started.`,
      actionUrl: `/dashboard`,
      actionLabel: "View Schedule",
      priority: "high",
      metadata: { scheduledTaskId },
      scheduledFor: new Date(),
    });
  }

  return createNotification({
    userId,
    type: "reminder",
    title: `Upcoming: ${taskName}`,
    message: `Your task "${taskName}" starts in ${reminderMinutesBefore} minutes.`,
    actionUrl: `/dashboard`,
    actionLabel: "View Schedule",
    priority: "normal",
    metadata: { scheduledTaskId, startTime: startTime.toISOString() },
    scheduledFor,
  });
}

/**
 * Create a smart reminder with context
 */
export async function createSmartReminder(
  userId: string,
  taskName: string,
  scheduledTaskId: string,
  startTime: Date,
  context: {
    trafficWarning?: string;
    weatherWarning?: string;
    preparationTip?: string;
  }
): Promise<Notification> {
  let message = `Your task "${taskName}" is coming up.`;
  let priority: NotificationPriority = "normal";

  const contextParts: string[] = [];

  if (context.trafficWarning) {
    contextParts.push(`🚗 ${context.trafficWarning}`);
    priority = "high";
  }

  if (context.weatherWarning) {
    contextParts.push(`🌤 ${context.weatherWarning}`);
  }

  if (context.preparationTip) {
    contextParts.push(`💡 ${context.preparationTip}`);
  }

  if (contextParts.length > 0) {
    message += "\n\n" + contextParts.join("\n");
  }

  return createNotification({
    userId,
    type: "reminder",
    title: `Reminder: ${taskName}`,
    message,
    actionUrl: `/dashboard`,
    actionLabel: "View Schedule",
    priority,
    metadata: {
      scheduledTaskId,
      hasTrafficWarning: !!context.trafficWarning,
      hasWeatherWarning: !!context.weatherWarning,
    },
    scheduledFor: addMinutes(startTime, -45), // 45 minutes before for smart reminders
  });
}

/**
 * Create a weekly plan notification
 */
export async function createWeeklyPlanNotification(
  userId: string,
  summary: string,
  totalTasks: number
): Promise<Notification> {
  return createNotification({
    userId,
    type: "weekly_plan",
    title: "Your Weekly Schedule is Ready",
    message: `${summary}\n\n${totalTasks} tasks have been scheduled for this week.`,
    actionUrl: `/calendar`,
    actionLabel: "View Calendar",
    priority: "normal",
    metadata: { totalTasks },
  });
}

/**
 * Create a conflict notification
 */
export async function createConflictNotification(
  userId: string,
  conflictDescription: string,
  suggestedResolution?: string
): Promise<Notification> {
  let message = `A scheduling conflict was detected:\n\n${conflictDescription}`;

  if (suggestedResolution) {
    message += `\n\nSuggested resolution: ${suggestedResolution}`;
  }

  return createNotification({
    userId,
    type: "conflict",
    title: "Scheduling Conflict Detected",
    message,
    actionUrl: `/calendar`,
    actionLabel: "Resolve Conflict",
    priority: "high",
  });
}

/**
 * Create an achievement notification
 */
export async function createAchievementNotification(
  userId: string,
  achievement: string,
  details?: string
): Promise<Notification> {
  return createNotification({
    userId,
    type: "achievement",
    title: `🎉 ${achievement}`,
    message: details || `Great job! You've earned this achievement.`,
    actionUrl: `/dashboard`,
    priority: "low",
  });
}

/**
 * Create a feedback request notification
 */
export async function createFeedbackRequestNotification(
  userId: string,
  taskName: string,
  scheduledTaskId: string
): Promise<Notification> {
  return createNotification({
    userId,
    type: "feedback_request",
    title: `How was "${taskName}"?`,
    message: `Your feedback helps improve future scheduling. Take a moment to rate your experience.`,
    actionUrl: `/dashboard?feedback=${scheduledTaskId}`,
    actionLabel: "Give Feedback",
    priority: "low",
    metadata: { scheduledTaskId },
  });
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  filters: NotificationFilters
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: {
      userId: filters.userId,
      ...(filters.type && { type: filters.type }),
      ...(filters.unreadOnly && { readAt: null }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.startDate && {
        scheduledFor: { gte: filters.startDate },
      }),
      ...(filters.endDate && {
        scheduledFor: { lte: filters.endDate },
      }),
      scheduledFor: { lte: new Date() }, // Only show notifications that are due
    },
    orderBy: [{ priority: "desc" }, { scheduledFor: "desc" }],
    take: filters.limit || 50,
  });
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
      scheduledFor: { lte: new Date() },
    },
  });
}

/**
 * Get pending notifications (scheduled but not yet sent)
 */
export async function getPendingNotifications(
  beforeTime?: Date
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: {
      sentAt: null,
      scheduledFor: { lte: beforeTime || new Date() },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

/**
 * Mark a notification as sent
 */
export async function markAsSent(notificationId: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: { sentAt: new Date() },
  });
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

/**
 * Dismiss a notification
 */
export async function dismissNotification(notificationId: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notificationId },
    data: { dismissedAt: new Date() },
  });
}

/**
 * Delete old notifications (cleanup)
 */
export async function cleanupOldNotifications(olderThanDays: number = 30): Promise<number> {
  const cutoffDate = addDays(new Date(), -olderThanDays);

  const result = await prisma.notification.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
      OR: [{ readAt: { not: null } }, { dismissedAt: { not: null } }],
    },
  });

  return result.count;
}

/**
 * Check if a similar notification already exists (to avoid duplicates)
 */
export async function notificationExists(
  userId: string,
  type: NotificationType,
  metadata: Record<string, unknown>,
  withinHours: number = 24
): Promise<boolean> {
  const cutoffTime = addHours(new Date(), -withinHours);

  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      createdAt: { gte: cutoffTime },
      dismissedAt: null,
    },
  });

  if (!existing) return false;

  // Check if metadata matches (for task-specific notifications)
  const existingMeta = existing.metadata as Record<string, unknown> | null;
  if (metadata.scheduledTaskId && existingMeta?.scheduledTaskId === metadata.scheduledTaskId) {
    return true;
  }

  return false;
}

/**
 * Format notifications for display
 */
export function formatNotificationsForDisplay(
  notifications: Notification[]
): { unread: Notification[]; read: Notification[] } {
  return {
    unread: notifications.filter((n) => !n.readAt),
    read: notifications.filter((n) => n.readAt),
  };
}
