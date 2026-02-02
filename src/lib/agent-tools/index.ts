/**
 * AI Agent Tools Library
 *
 * This module exports all tools available to AI agents and provides
 * type definitions for Claude's tool-use feature.
 */

// Export all tool modules
export * from "./calendar";
export * from "./tasks";
export * from "./family";
export * from "./preferences";
export * from "./notifications";
export * from "./context";

// Import for tool definitions
import * as calendarTools from "./calendar";
import * as taskTools from "./tasks";
import * as familyTools from "./family";
import * as preferenceTools from "./preferences";
import * as notificationTools from "./notifications";
import * as contextTools from "./context";

/**
 * Tool definitions for Claude's tool-use feature
 * These match Anthropic's tool schema format
 */
export const AGENT_TOOL_DEFINITIONS = [
  // Calendar Tools
  {
    name: "get_calendar_events",
    description:
      "Get all calendar events for the current user within a date range. Combines Google Calendar and external ICS calendars. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        startDate: { type: "string", description: "Start date in ISO format (e.g., 2026-02-02)" },
        endDate: { type: "string", description: "End date in ISO format (e.g., 2026-02-02)" },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "find_free_time_slots",
    description:
      "Find available time slots in a user's calendar for a given day. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date in ISO format (e.g., 2026-02-02)" },
        minDurationMinutes: {
          type: "number",
          description: "Minimum duration of free slot in minutes (default: 30)",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "get_calendar_density",
    description:
      "Get how busy the current user's calendar is for a given day (0-1 score). User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date in ISO format (e.g., 2026-02-02)" },
      },
      required: ["date"],
    },
  },

  // Task Tools
  {
    name: "get_user_tasks",
    description: "Get all task definitions for the current user. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["resolution", "household"],
          description: "Filter by task type (optional)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_scheduled_tasks",
    description: "Get scheduled task instances within a date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: { type: "string", description: "User ID (optional if familyId provided)" },
        familyId: { type: "string", description: "Family ID for family-wide view" },
        startDate: { type: "string", description: "Start date in ISO format" },
        endDate: { type: "string", description: "End date in ISO format" },
        status: {
          type: "string",
          enum: ["pending", "completed", "skipped"],
          description: "Filter by status",
        },
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_todays_tasks",
    description: "Get all scheduled tasks for today. Use this when user asks about today's tasks or schedule. No parameters needed - user ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_weeks_tasks",
    description: "Get all scheduled tasks for this week. Use this when user asks about this week's tasks or schedule. No parameters needed - user ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_tomorrows_tasks",
    description: "Get all scheduled tasks for tomorrow. Use this when user asks about tomorrow's tasks or schedule. No parameters needed - user ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_family_member_tasks",
    description: "Get scheduled tasks for a specific family member. Use this when user asks about another family member's tasks. First use get_family_info to get the family member's userId.",
    input_schema: {
      type: "object" as const,
      properties: {
        familyMemberUserId: { type: "string", description: "The family member's user ID (get this from get_family_info)" },
        startDate: { type: "string", description: "Start date in ISO format (e.g., 2026-02-01)" },
        endDate: { type: "string", description: "End date in ISO format (e.g., 2026-02-01)" },
      },
      required: ["familyMemberUserId", "startDate", "endDate"],
    },
  },
  {
    name: "get_unscheduled_tasks",
    description: "Get tasks that haven't been scheduled in the upcoming period. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        lookAheadDays: { type: "number", description: "Number of days to look ahead (default: 7)" },
      },
      required: [],
    },
  },
  {
    name: "create_scheduled_task",
    description: "Schedule a task for a specific time.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: "The task definition ID" },
        assignedToUserId: { type: "string", description: "User to assign the task to" },
        scheduledDate: { type: "string", description: "Date in ISO format" },
        startTime: { type: "string", description: "Start time in ISO format" },
        endTime: { type: "string", description: "End time in ISO format" },
        aiReasoning: { type: "string", description: "Explanation for why this time was chosen" },
      },
      required: ["taskId", "assignedToUserId", "scheduledDate", "startTime", "endTime"],
    },
  },
  {
    name: "reschedule_task",
    description: "Move a scheduled task to a different time.",
    input_schema: {
      type: "object" as const,
      properties: {
        scheduledTaskId: { type: "string", description: "The scheduled task instance ID" },
        newStartTime: { type: "string", description: "New start time in ISO format" },
        newEndTime: { type: "string", description: "New end time in ISO format" },
        aiReasoning: { type: "string", description: "Explanation for the reschedule" },
      },
      required: ["scheduledTaskId", "newStartTime", "newEndTime"],
    },
  },
  {
    name: "check_for_conflicts",
    description: "Check if a proposed time slot conflicts with existing scheduled tasks. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        startTime: { type: "string", description: "Proposed start time in ISO format" },
        endTime: { type: "string", description: "Proposed end time in ISO format" },
      },
      required: ["startTime", "endTime"],
    },
  },

  // Family Tools
  {
    name: "get_family_info",
    description: "Get information about the current user's family, including all members. No parameters needed - user ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "analyze_task_fairness",
    description:
      "Analyze how fairly household tasks are distributed between family members. Family ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        weeksToAnalyze: { type: "number", description: "Number of weeks to analyze (default: 4)" },
      },
      required: [],
    },
  },
  {
    name: "suggest_task_assignment",
    description:
      "Suggest which family member should be assigned a task based on fairness. Family ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskType: {
          type: "string",
          enum: ["resolution", "household"],
          description: "Type of task to assign",
        },
      },
      required: ["taskType"],
    },
  },

  // Preference Tools
  {
    name: "get_user_preferences",
    description: "Get all learned preferences for the current user. No parameters needed - user ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_scheduling_context",
    description:
      "Get user preferences formatted for scheduling decisions (buffer time, energy hours, etc). No parameters needed - user ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_preferred_time_slots",
    description: "Get the user's preferred time slots for a specific task type. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskType: { type: "string", description: "The task type (e.g., 'resolution', 'household')" },
        category: { type: "string", description: "Optional task category" },
      },
      required: ["taskType"],
    },
  },

  // Context Tools
  {
    name: "get_weather",
    description: "Get weather information for a location and time.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "Location name or coordinates" },
        dateTime: { type: "string", description: "Date and time in ISO format" },
      },
      required: ["location", "dateTime"],
    },
  },
  {
    name: "get_traffic",
    description: "Get traffic conditions for a route.",
    input_schema: {
      type: "object" as const,
      properties: {
        origin: { type: "string", description: "Starting location" },
        destination: { type: "string", description: "Destination location" },
        departureTime: { type: "string", description: "Departure time in ISO format" },
      },
      required: ["origin", "destination", "departureTime"],
    },
  },
  {
    name: "is_weather_suitable",
    description: "Check if weather is suitable for a specific activity type.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "Location name" },
        dateTime: { type: "string", description: "Date and time in ISO format" },
        activityType: {
          type: "string",
          enum: ["outdoor_exercise", "outdoor_errand", "indoor", "any"],
          description: "Type of activity",
        },
      },
      required: ["location", "dateTime", "activityType"],
    },
  },

  // Notification Tools
  {
    name: "create_reminder",
    description: "Create a reminder notification for a task. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskName: { type: "string", description: "Name of the task" },
        scheduledTaskId: { type: "string", description: "The scheduled task ID" },
        startTime: { type: "string", description: "Task start time in ISO format" },
        reminderMinutesBefore: {
          type: "number",
          description: "Minutes before task to send reminder (default: 15)",
        },
      },
      required: ["taskName", "scheduledTaskId", "startTime"],
    },
  },
  {
    name: "create_smart_reminder",
    description: "Create a context-aware reminder with traffic/weather info. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        taskName: { type: "string", description: "Name of the task" },
        scheduledTaskId: { type: "string", description: "The scheduled task ID" },
        startTime: { type: "string", description: "Task start time in ISO format" },
        trafficWarning: { type: "string", description: "Traffic warning message" },
        weatherWarning: { type: "string", description: "Weather warning message" },
        preparationTip: { type: "string", description: "Preparation tip" },
      },
      required: ["taskName", "scheduledTaskId", "startTime"],
    },
  },
  {
    name: "create_conflict_notification",
    description: "Notify user about a scheduling conflict. User ID is automatically determined.",
    input_schema: {
      type: "object" as const,
      properties: {
        conflictDescription: { type: "string", description: "Description of the conflict" },
        suggestedResolution: { type: "string", description: "Suggested way to resolve" },
      },
      required: ["conflictDescription"],
    },
  },
];

/**
 * Execute a tool by name with given arguments
 * This is the main entry point for the agent to call tools
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    // Calendar Tools
    case "get_calendar_events":
      return calendarTools.getCalendarEvents(
        args.userId as string,
        new Date(args.startDate as string),
        new Date(args.endDate as string)
      );
    case "find_free_time_slots":
      return calendarTools.findFreeTimeSlots(
        args.userId as string,
        new Date(args.date as string),
        args.minDurationMinutes as number | undefined
      );
    case "get_calendar_density":
      return calendarTools.getCalendarDensity(
        args.userId as string,
        new Date(args.date as string)
      );

    // Task Tools
    case "get_user_tasks":
      return taskTools.getUserTasks(args.userId as string, {
        type: args.type as "resolution" | "household" | undefined,
      });
    case "get_scheduled_tasks":
      return taskTools.getScheduledTasks({
        userId: args.userId as string | undefined,
        familyId: args.familyId as string | undefined,
        startDate: new Date(args.startDate as string),
        endDate: new Date(args.endDate as string),
        status: args.status as "pending" | "completed" | "skipped" | undefined,
      });
    case "get_todays_tasks":
      return taskTools.getTodaysTasks(args.userId as string);
    case "get_weeks_tasks":
      return taskTools.getWeeksTasks(args.userId as string);
    case "get_tomorrows_tasks":
      return taskTools.getTomorrowsTasks(args.userId as string);
    case "get_family_member_tasks":
      return taskTools.getFamilyMemberTasks(
        args.familyMemberUserId as string,
        new Date(args.startDate as string),
        new Date(args.endDate as string)
      );
    case "get_unscheduled_tasks":
      return taskTools.getUnscheduledTasks(
        args.userId as string,
        args.lookAheadDays as number | undefined
      );
    case "create_scheduled_task":
      return taskTools.createScheduledTask({
        taskId: args.taskId as string,
        assignedToUserId: args.assignedToUserId as string,
        scheduledDate: new Date(args.scheduledDate as string),
        startTime: new Date(args.startTime as string),
        endTime: new Date(args.endTime as string),
        aiReasoning: args.aiReasoning as string | undefined,
      });
    case "reschedule_task":
      return taskTools.rescheduleTask(
        args.scheduledTaskId as string,
        new Date(args.newStartTime as string),
        new Date(args.newEndTime as string),
        args.aiReasoning as string | undefined
      );
    case "check_for_conflicts":
      return taskTools.checkForConflicts(
        args.userId as string,
        new Date(args.startTime as string),
        new Date(args.endTime as string)
      );

    // Family Tools
    case "get_family_info":
      return familyTools.getFamilyForUser(args.userId as string);
    case "analyze_task_fairness":
      return familyTools.analyzeFairness(
        args.familyId as string,
        args.weeksToAnalyze as number | undefined
      );
    case "suggest_task_assignment":
      return familyTools.suggestTaskAssignment(
        args.familyId as string,
        args.taskType as "resolution" | "household"
      );

    // Preference Tools
    case "get_user_preferences":
      return preferenceTools.getAllPreferences(args.userId as string);
    case "get_scheduling_context":
      return preferenceTools.getSchedulingContext(args.userId as string);
    case "get_preferred_time_slots":
      return preferenceTools.getPreferredTimeSlots(
        args.userId as string,
        args.taskType as string,
        args.category as string | undefined
      );

    // Context Tools
    case "get_weather":
      return contextTools.getWeather(
        args.location as string,
        new Date(args.dateTime as string)
      );
    case "get_traffic":
      return contextTools.getTraffic(
        args.origin as string,
        args.destination as string,
        new Date(args.departureTime as string)
      );
    case "is_weather_suitable":
      return contextTools.isWeatherSuitable(
        args.location as string,
        new Date(args.dateTime as string),
        args.activityType as "outdoor_exercise" | "outdoor_errand" | "indoor" | "any"
      );

    // Notification Tools
    case "create_reminder":
      return notificationTools.createTaskReminder(
        args.userId as string,
        args.taskName as string,
        args.scheduledTaskId as string,
        new Date(args.startTime as string),
        args.reminderMinutesBefore as number | undefined
      );
    case "create_smart_reminder":
      return notificationTools.createSmartReminder(
        args.userId as string,
        args.taskName as string,
        args.scheduledTaskId as string,
        new Date(args.startTime as string),
        {
          trafficWarning: args.trafficWarning as string | undefined,
          weatherWarning: args.weatherWarning as string | undefined,
          preparationTip: args.preparationTip as string | undefined,
        }
      );
    case "create_conflict_notification":
      return notificationTools.createConflictNotification(
        args.userId as string,
        args.conflictDescription as string,
        args.suggestedResolution as string | undefined
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Type for tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Safe tool execution with error handling
 */
export async function safeExecuteTool(
  toolName: string,
  args: Record<string, unknown> | null | undefined
): Promise<ToolResult> {
  try {
    // Ensure args is always an object
    const safeArgs = args ?? {};

    const data = await executeTool(toolName, safeArgs);
    return { success: true, data };
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    console.error(`Tool args:`, JSON.stringify(args));
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
