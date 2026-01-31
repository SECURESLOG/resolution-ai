/**
 * User Preferences Tools for AI Agents
 *
 * These tools allow agents to read and update learned user preferences
 * that help improve scheduling decisions over time.
 */

import prisma from "@/lib/prisma";
import { UserPreference } from "@prisma/client";

interface PreferenceValue {
  [key: string]: unknown;
}

interface UserPreferenceWithTypedValue extends Omit<UserPreference, "value"> {
  value: PreferenceValue;
}

// Known preference keys
export const PREFERENCE_KEYS = {
  // Time preferences
  PREFERRED_WORKOUT_TIME: "preferred_time_resolution_Fitness",
  PREFERRED_READING_TIME: "preferred_time_resolution_Reading",
  PREFERRED_MORNING_TASKS: "preferred_morning_tasks",
  PREFERRED_EVENING_TASKS: "preferred_evening_tasks",

  // Duration adjustments
  DURATION_ADJUSTMENT_RESOLUTION: "duration_adjustment_resolution",
  DURATION_ADJUSTMENT_HOUSEHOLD: "duration_adjustment_household",

  // Context sensitivities
  TRAFFIC_SENSITIVE: "traffic_sensitive",
  WEATHER_SENSITIVE: "weather_sensitive",

  // Energy patterns
  HIGH_ENERGY_HOURS: "high_energy_hours",
  LOW_ENERGY_HOURS: "low_energy_hours",

  // Scheduling preferences
  BUFFER_BETWEEN_TASKS: "buffer_between_tasks",
  MAX_TASKS_PER_DAY: "max_tasks_per_day",
  PREFERRED_TASK_DENSITY: "preferred_task_density",
} as const;

/**
 * Get a specific preference for a user
 */
export async function getPreference(
  userId: string,
  key: string
): Promise<UserPreferenceWithTypedValue | null> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key } },
  });

  if (!pref) return null;

  return {
    ...pref,
    value: pref.value as PreferenceValue,
  };
}

/**
 * Get all preferences for a user
 */
export async function getAllPreferences(
  userId: string
): Promise<UserPreferenceWithTypedValue[]> {
  const prefs = await prisma.userPreference.findMany({
    where: { userId },
    orderBy: { key: "asc" },
  });

  return prefs.map((p) => ({
    ...p,
    value: p.value as PreferenceValue,
  }));
}

/**
 * Get preferences matching a pattern (e.g., all time preferences)
 */
export async function getPreferencesByPattern(
  userId: string,
  pattern: string
): Promise<UserPreferenceWithTypedValue[]> {
  const prefs = await prisma.userPreference.findMany({
    where: {
      userId,
      key: { contains: pattern },
    },
  });

  return prefs.map((p) => ({
    ...p,
    value: p.value as PreferenceValue,
  }));
}

/**
 * Set a preference for a user
 */
export async function setPreference(
  userId: string,
  key: string,
  value: PreferenceValue,
  confidence: number = 0.5,
  source: "inferred" | "explicit" | "default" = "explicit"
): Promise<UserPreferenceWithTypedValue> {
  const pref = await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    update: {
      value: value as object,
      confidence,
      source,
    },
    create: {
      userId,
      key,
      value: value as object,
      confidence,
      source,
    },
  });

  return {
    ...pref,
    value: pref.value as PreferenceValue,
  };
}

/**
 * Update preference confidence based on feedback
 */
export async function updatePreferenceConfidence(
  userId: string,
  key: string,
  adjustment: number // positive or negative
): Promise<void> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key } },
  });

  if (pref) {
    const newConfidence = Math.max(0, Math.min(1, pref.confidence + adjustment));
    await prisma.userPreference.update({
      where: { id: pref.id },
      data: { confidence: newConfidence },
    });
  }
}

/**
 * Delete a preference
 */
export async function deletePreference(userId: string, key: string): Promise<void> {
  await prisma.userPreference.deleteMany({
    where: { userId, key },
  });
}

/**
 * Get preferred time slots for a task type
 */
export async function getPreferredTimeSlots(
  userId: string,
  taskType: string,
  category?: string
): Promise<{ hours: number[]; confidence: number } | null> {
  const key = `good_time_slot_${taskType}${category ? `_${category}` : ""}`;
  const pref = await getPreference(userId, key);

  if (!pref) return null;

  return {
    hours: (pref.value.hours as number[]) || [],
    confidence: pref.confidence,
  };
}

/**
 * Get duration adjustment for a task type
 */
export async function getDurationAdjustment(
  userId: string,
  taskType: string,
  category?: string
): Promise<{ adjustment: number; confidence: number } | null> {
  const key = `duration_adjustment_${taskType}${category ? `_${category}` : ""}`;
  const pref = await getPreference(userId, key);

  if (!pref) return null;

  return {
    adjustment: (pref.value.adjustment as number) || 0,
    confidence: pref.confidence,
  };
}

/**
 * Check if user is sensitive to traffic for a task type
 */
export async function isTrafficSensitive(
  userId: string,
  taskType: string,
  category?: string
): Promise<boolean> {
  const key = `traffic_sensitive_${taskType}${category ? `_${category}` : ""}`;
  const pref = await getPreference(userId, key);

  return pref?.value.sensitive === true && pref.confidence >= 0.6;
}

/**
 * Check if user is sensitive to weather for a task type
 */
export async function isWeatherSensitive(
  userId: string,
  taskType: string,
  category?: string
): Promise<boolean> {
  const key = `weather_sensitive_${taskType}${category ? `_${category}` : ""}`;
  const pref = await getPreference(userId, key);

  return pref?.value.sensitive === true && pref.confidence >= 0.6;
}

/**
 * Initialize default preferences for a new user
 */
export async function initializeDefaultPreferences(userId: string): Promise<void> {
  const defaults: { key: string; value: PreferenceValue }[] = [
    { key: "buffer_between_tasks", value: { minutes: 15 } },
    { key: "max_tasks_per_day", value: { count: 5 } },
    { key: "preferred_task_density", value: { level: "medium" } },
    { key: "high_energy_hours", value: { hours: [9, 10, 11, 14, 15, 16] } },
    { key: "low_energy_hours", value: { hours: [13, 21, 22] } },
  ];

  for (const { key, value } of defaults) {
    const existing = await getPreference(userId, key);
    if (!existing) {
      await setPreference(userId, key, value, 0.3, "default");
    }
  }
}

/**
 * Get scheduling context from preferences
 * Returns a summary object useful for AI scheduling decisions
 */
export async function getSchedulingContext(userId: string): Promise<{
  bufferMinutes: number;
  maxTasksPerDay: number;
  highEnergyHours: number[];
  lowEnergyHours: number[];
  trafficSensitiveTasks: string[];
  weatherSensitiveTasks: string[];
  preferredTimes: Record<string, number[]>;
  durationAdjustments: Record<string, number>;
}> {
  const allPrefs = await getAllPreferences(userId);

  const context = {
    bufferMinutes: 15,
    maxTasksPerDay: 5,
    highEnergyHours: [9, 10, 11, 14, 15, 16],
    lowEnergyHours: [13, 21, 22],
    trafficSensitiveTasks: [] as string[],
    weatherSensitiveTasks: [] as string[],
    preferredTimes: {} as Record<string, number[]>,
    durationAdjustments: {} as Record<string, number>,
  };

  for (const pref of allPrefs) {
    if (pref.key === "buffer_between_tasks" && pref.value.minutes) {
      context.bufferMinutes = pref.value.minutes as number;
    }
    if (pref.key === "max_tasks_per_day" && pref.value.count) {
      context.maxTasksPerDay = pref.value.count as number;
    }
    if (pref.key === "high_energy_hours" && pref.value.hours) {
      context.highEnergyHours = pref.value.hours as number[];
    }
    if (pref.key === "low_energy_hours" && pref.value.hours) {
      context.lowEnergyHours = pref.value.hours as number[];
    }
    if (pref.key.startsWith("traffic_sensitive_") && pref.value.sensitive) {
      context.trafficSensitiveTasks.push(pref.key.replace("traffic_sensitive_", ""));
    }
    if (pref.key.startsWith("weather_sensitive_") && pref.value.sensitive) {
      context.weatherSensitiveTasks.push(pref.key.replace("weather_sensitive_", ""));
    }
    if (pref.key.startsWith("good_time_slot_") && pref.value.hours) {
      const taskType = pref.key.replace("good_time_slot_", "");
      context.preferredTimes[taskType] = pref.value.hours as number[];
    }
    if (pref.key.startsWith("duration_adjustment_") && pref.value.adjustment !== undefined) {
      const taskType = pref.key.replace("duration_adjustment_", "");
      context.durationAdjustments[taskType] = pref.value.adjustment as number;
    }
  }

  return context;
}

/**
 * Format preferences for AI context
 */
export function formatPreferencesForAI(
  prefs: UserPreferenceWithTypedValue[]
): string {
  if (prefs.length === 0) {
    return "No learned preferences yet.";
  }

  const highConfidence = prefs.filter((p) => p.confidence >= 0.7);
  const mediumConfidence = prefs.filter((p) => p.confidence >= 0.4 && p.confidence < 0.7);

  let result = "";

  if (highConfidence.length > 0) {
    result += "Strong preferences:\n";
    result += highConfidence
      .map((p) => `- ${p.key}: ${JSON.stringify(p.value)}`)
      .join("\n");
  }

  if (mediumConfidence.length > 0) {
    result += "\n\nLearning preferences:\n";
    result += mediumConfidence
      .map((p) => `- ${p.key}: ${JSON.stringify(p.value)} (${Math.round(p.confidence * 100)}% confident)`)
      .join("\n");
  }

  return result || "No significant preferences learned yet.";
}
