import { Task, ScheduledTask } from "@prisma/client";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  } | Date | string;
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  } | Date | string;
  status?: string;
  source?: "google" | "external";
  calendarName?: string;
  // Family sharing fields
  userId?: string;
  userName?: string;
  isOwn?: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  duration: number; // in minutes
}

export interface ScheduleRecommendation {
  taskId: string;
  taskName: string;
  taskType: string;
  assignedToUserId: string;
  date: string;
  startTime: string;
  endTime: string;
  reasoning: string;
}

export interface AIScheduleResponse {
  schedule: ScheduleRecommendation[];
  conflicts: {
    taskId: string;
    reason: string;
    alternatives?: string[];
  }[];
  fairnessScore?: number;
  summary: string;
}

export interface TaskWithSchedule extends Task {
  scheduledTasks?: ScheduledTask[];
}

export interface DashboardStats {
  todayTasks: number;
  weekTasks: number;
  completedToday: number;
  completedWeek: number;
  streakDays: number;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
