/**
 * Pattern Analyzer & Learning System
 *
 * Analyzes user behavior patterns from completed tasks and feedback
 * to improve scheduling recommendations over time.
 */

import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks, format, getHours, getDay } from "date-fns";
import { setPreference, updatePreferenceConfidence } from "./preferences";

// Pattern types
interface TimePattern {
  hour: number;
  dayOfWeek: number;
  completionRate: number;
  averageRating: number;
  sampleSize: number;
}

interface DurationPattern {
  taskType: string;
  category: string | null;
  estimatedAvg: number;
  actualAvg: number;
  accuracy: number; // ratio of actual/estimated
  adjustmentMinutes: number;
  sampleSize: number;
}

interface CompletionPattern {
  taskType: string;
  category: string | null;
  completionRate: number;
  bestHours: number[];
  worstHours: number[];
  bestDays: number[]; // 0=Sunday, 6=Saturday
  sampleSize: number;
}

interface ContextPattern {
  isTrafficSensitive: boolean;
  trafficConfidence: number;
  isWeatherSensitive: boolean;
  weatherConfidence: number;
  highEnergyHours: number[];
  lowEnergyHours: number[];
}

interface UserPatterns {
  userId: string;
  analyzedAt: Date;
  weeksCovered: number;
  totalTasksAnalyzed: number;
  timePatterns: TimePattern[];
  durationPatterns: DurationPattern[];
  completionPatterns: CompletionPattern[];
  contextPatterns: ContextPattern;
  insights: string[];
}

/**
 * Analyze patterns from a user's historical task data
 */
export async function analyzeUserPatterns(
  userId: string,
  weeksToAnalyze: number = 8
): Promise<UserPatterns> {
  const endDate = new Date();
  const startDate = subWeeks(endDate, weeksToAnalyze);

  console.log(`[Patterns] Analyzing ${weeksToAnalyze} weeks of data for user ${userId}`);

  // Get completed scheduled tasks with feedback
  const completedTasks = await prisma.scheduledTask.findMany({
    where: {
      assignedToUserId: userId,
      status: "completed",
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      task: true,
      feedback: true,
    },
    orderBy: { startTime: "asc" },
  });

  // Get skipped tasks for completion rate analysis
  const skippedTasks = await prisma.scheduledTask.findMany({
    where: {
      assignedToUserId: userId,
      status: "skipped",
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      task: true,
    },
  });

  const allTasks = [...completedTasks, ...skippedTasks];
  console.log(`[Patterns] Found ${completedTasks.length} completed, ${skippedTasks.length} skipped tasks`);

  // Analyze patterns
  const timePatterns = analyzeTimePatterns(completedTasks, skippedTasks);
  const durationPatterns = analyzeDurationPatterns(completedTasks);
  const completionPatterns = analyzeCompletionPatterns(completedTasks, skippedTasks);
  const contextPatterns = analyzeContextPatterns(completedTasks);
  const insights = generateInsights(timePatterns, durationPatterns, completionPatterns, contextPatterns);

  return {
    userId,
    analyzedAt: new Date(),
    weeksCovered: weeksToAnalyze,
    totalTasksAnalyzed: allTasks.length,
    timePatterns,
    durationPatterns,
    completionPatterns,
    contextPatterns,
    insights,
  };
}

/**
 * Analyze when tasks are most successfully completed
 */
function analyzeTimePatterns(
  completed: Array<{ startTime: Date; feedback: Array<{ timeSlotRating: number | null }> }>,
  skipped: Array<{ startTime: Date }>
): TimePattern[] {
  // Create 24x7 grid for hour x day combinations
  const grid: Map<string, { completed: number; skipped: number; totalRating: number; ratingCount: number }> = new Map();

  // Initialize grid
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      grid.set(`${day}-${hour}`, { completed: 0, skipped: 0, totalRating: 0, ratingCount: 0 });
    }
  }

  // Count completed tasks
  for (const task of completed) {
    const hour = getHours(task.startTime);
    const day = getDay(task.startTime);
    const key = `${day}-${hour}`;
    const slot = grid.get(key)!;
    slot.completed++;

    // Add ratings if available
    for (const fb of task.feedback) {
      if (fb.timeSlotRating) {
        slot.totalRating += fb.timeSlotRating;
        slot.ratingCount++;
      }
    }
  }

  // Count skipped tasks
  for (const task of skipped) {
    const hour = getHours(task.startTime);
    const day = getDay(task.startTime);
    const key = `${day}-${hour}`;
    grid.get(key)!.skipped++;
  }

  // Convert to patterns (only include slots with data)
  const patterns: TimePattern[] = [];
  const gridEntries = Array.from(grid.entries());
  for (const [key, data] of gridEntries) {
    const total = data.completed + data.skipped;
    if (total >= 2) { // Minimum sample size
      const [day, hour] = key.split("-").map(Number);
      patterns.push({
        hour,
        dayOfWeek: day,
        completionRate: data.completed / total,
        averageRating: data.ratingCount > 0 ? data.totalRating / data.ratingCount : 0,
        sampleSize: total,
      });
    }
  }

  // Sort by completion rate descending
  return patterns.sort((a, b) => b.completionRate - a.completionRate);
}

/**
 * Analyze how accurate task duration estimates are
 */
function analyzeDurationPatterns(
  completed: Array<{
    task: { type: string; category: string | null; duration: number };
    feedback: Array<{ actualDuration: number | null }>;
  }>
): DurationPattern[] {
  const byTypeCategory: Map<string, { estimated: number[]; actual: number[] }> = new Map();

  for (const task of completed) {
    const key = `${task.task.type}|${task.task.category || "none"}`;

    if (!byTypeCategory.has(key)) {
      byTypeCategory.set(key, { estimated: [], actual: [] });
    }

    const data = byTypeCategory.get(key)!;
    data.estimated.push(task.task.duration);

    // Use actual duration from feedback if available
    for (const fb of task.feedback) {
      if (fb.actualDuration) {
        data.actual.push(fb.actualDuration);
      }
    }
  }

  const patterns: DurationPattern[] = [];
  for (const [key, data] of Array.from(byTypeCategory.entries())) {
    if (data.estimated.length >= 3 && data.actual.length >= 2) {
      const [type, category] = key.split("|");
      const estimatedAvg = data.estimated.reduce((a, b) => a + b, 0) / data.estimated.length;
      const actualAvg = data.actual.reduce((a, b) => a + b, 0) / data.actual.length;
      const accuracy = actualAvg / estimatedAvg;

      patterns.push({
        taskType: type,
        category: category === "none" ? null : category,
        estimatedAvg: Math.round(estimatedAvg),
        actualAvg: Math.round(actualAvg),
        accuracy: Math.round(accuracy * 100) / 100,
        adjustmentMinutes: Math.round(actualAvg - estimatedAvg),
        sampleSize: data.actual.length,
      });
    }
  }

  return patterns;
}

/**
 * Analyze completion rates by task type and time
 */
function analyzeCompletionPatterns(
  completed: Array<{
    startTime: Date;
    task: { type: string; category: string | null };
  }>,
  skipped: Array<{
    startTime: Date;
    task: { type: string; category: string | null };
  }>
): CompletionPattern[] {
  const byTypeCategory: Map<string, {
    completed: Array<{ hour: number; day: number }>;
    skipped: Array<{ hour: number; day: number }>;
  }> = new Map();

  // Group completed tasks
  for (const task of completed) {
    const key = `${task.task.type}|${task.task.category || "none"}`;
    if (!byTypeCategory.has(key)) {
      byTypeCategory.set(key, { completed: [], skipped: [] });
    }
    byTypeCategory.get(key)!.completed.push({
      hour: getHours(task.startTime),
      day: getDay(task.startTime),
    });
  }

  // Group skipped tasks
  for (const task of skipped) {
    const key = `${task.task.type}|${task.task.category || "none"}`;
    if (!byTypeCategory.has(key)) {
      byTypeCategory.set(key, { completed: [], skipped: [] });
    }
    byTypeCategory.get(key)!.skipped.push({
      hour: getHours(task.startTime),
      day: getDay(task.startTime),
    });
  }

  const patterns: CompletionPattern[] = [];
  for (const [key, data] of Array.from(byTypeCategory.entries())) {
    const total = data.completed.length + data.skipped.length;
    if (total >= 3) {
      const [type, category] = key.split("|");

      // Calculate completion rate by hour
      const hourRates: Map<number, { completed: number; total: number }> = new Map();
      for (const t of data.completed) {
        if (!hourRates.has(t.hour)) hourRates.set(t.hour, { completed: 0, total: 0 });
        hourRates.get(t.hour)!.completed++;
        hourRates.get(t.hour)!.total++;
      }
      for (const t of data.skipped) {
        if (!hourRates.has(t.hour)) hourRates.set(t.hour, { completed: 0, total: 0 });
        hourRates.get(t.hour)!.total++;
      }

      // Calculate completion rate by day
      const dayRates: Map<number, { completed: number; total: number }> = new Map();
      for (const t of data.completed) {
        if (!dayRates.has(t.day)) dayRates.set(t.day, { completed: 0, total: 0 });
        dayRates.get(t.day)!.completed++;
        dayRates.get(t.day)!.total++;
      }
      for (const t of data.skipped) {
        if (!dayRates.has(t.day)) dayRates.set(t.day, { completed: 0, total: 0 });
        dayRates.get(t.day)!.total++;
      }

      // Find best/worst hours (min 2 samples)
      const hourEntries = Array.from(hourRates.entries())
        .filter(([_, v]) => v.total >= 2)
        .map(([h, v]) => ({ hour: h, rate: v.completed / v.total }))
        .sort((a, b) => b.rate - a.rate);

      const bestHours = hourEntries.filter(e => e.rate >= 0.7).map(e => e.hour);
      const worstHours = hourEntries.filter(e => e.rate <= 0.3).map(e => e.hour);

      // Find best days
      const dayEntries = Array.from(dayRates.entries())
        .filter(([_, v]) => v.total >= 2)
        .map(([d, v]) => ({ day: d, rate: v.completed / v.total }))
        .sort((a, b) => b.rate - a.rate);

      const bestDays = dayEntries.filter(e => e.rate >= 0.7).map(e => e.day);

      patterns.push({
        taskType: type,
        category: category === "none" ? null : category,
        completionRate: data.completed.length / total,
        bestHours,
        worstHours,
        bestDays,
        sampleSize: total,
      });
    }
  }

  return patterns.sort((a, b) => b.sampleSize - a.sampleSize);
}

/**
 * Analyze context sensitivity patterns
 */
function analyzeContextPatterns(
  completed: Array<{
    feedback: Array<{
      trafficImpact: boolean | null;
      weatherImpact: boolean | null;
      energyLevel: string | null;
    }>;
    startTime: Date;
  }>
): ContextPattern {
  let trafficPositive = 0;
  let trafficNegative = 0;
  let weatherPositive = 0;
  let weatherNegative = 0;

  const energyByHour: Map<number, { high: number; low: number; medium: number }> = new Map();

  for (const task of completed) {
    const hour = getHours(task.startTime);

    for (const fb of task.feedback) {
      // Traffic impact (boolean: true = had impact, false = no impact)
      if (fb.trafficImpact === false) {
        trafficPositive++;
      } else if (fb.trafficImpact === true) {
        trafficNegative++;
      }

      // Weather impact (boolean: true = had impact, false = no impact)
      if (fb.weatherImpact === false) {
        weatherPositive++;
      } else if (fb.weatherImpact === true) {
        weatherNegative++;
      }

      // Energy levels
      if (fb.energyLevel) {
        if (!energyByHour.has(hour)) {
          energyByHour.set(hour, { high: 0, low: 0, medium: 0 });
        }
        const levels = energyByHour.get(hour)!;
        if (fb.energyLevel === "high") levels.high++;
        else if (fb.energyLevel === "low") levels.low++;
        else levels.medium++;
      }
    }
  }

  // Calculate traffic sensitivity
  const trafficTotal = trafficPositive + trafficNegative;
  const isTrafficSensitive = trafficTotal > 0 && trafficNegative / trafficTotal > 0.3;
  const trafficConfidence = trafficTotal >= 5 ? 0.8 : trafficTotal >= 3 ? 0.6 : 0.4;

  // Calculate weather sensitivity
  const weatherTotal = weatherPositive + weatherNegative;
  const isWeatherSensitive = weatherTotal > 0 && weatherNegative / weatherTotal > 0.3;
  const weatherConfidence = weatherTotal >= 5 ? 0.8 : weatherTotal >= 3 ? 0.6 : 0.4;

  // Find high/low energy hours
  const highEnergyHours: number[] = [];
  const lowEnergyHours: number[] = [];

  for (const [hour, levels] of Array.from(energyByHour.entries())) {
    const total = levels.high + levels.medium + levels.low;
    if (total >= 2) {
      if (levels.high / total > 0.5) highEnergyHours.push(hour);
      if (levels.low / total > 0.5) lowEnergyHours.push(hour);
    }
  }

  return {
    isTrafficSensitive,
    trafficConfidence,
    isWeatherSensitive,
    weatherConfidence,
    highEnergyHours: highEnergyHours.sort((a, b) => a - b),
    lowEnergyHours: lowEnergyHours.sort((a, b) => a - b),
  };
}

/**
 * Generate human-readable insights from patterns
 */
function generateInsights(
  timePatterns: TimePattern[],
  durationPatterns: DurationPattern[],
  completionPatterns: CompletionPattern[],
  contextPatterns: ContextPattern
): string[] {
  const insights: string[] = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Best time slots
  const topTimeSlots = timePatterns.filter(p => p.completionRate >= 0.8 && p.sampleSize >= 3).slice(0, 3);
  if (topTimeSlots.length > 0) {
    const formatted = topTimeSlots.map(p =>
      `${dayNames[p.dayOfWeek]} at ${p.hour}:00 (${Math.round(p.completionRate * 100)}% completion)`
    ).join(", ");
    insights.push(`Your most productive time slots: ${formatted}`);
  }

  // Duration adjustments
  for (const dp of durationPatterns) {
    if (Math.abs(dp.adjustmentMinutes) >= 10 && dp.sampleSize >= 3) {
      const direction = dp.adjustmentMinutes > 0 ? "longer" : "shorter";
      const category = dp.category ? ` (${dp.category})` : "";
      insights.push(
        `${dp.taskType}${category} tasks typically take ${Math.abs(dp.adjustmentMinutes)} minutes ${direction} than estimated`
      );
    }
  }

  // Completion patterns
  for (const cp of completionPatterns) {
    if (cp.completionRate >= 0.85 && cp.sampleSize >= 5) {
      const category = cp.category ? ` (${cp.category})` : "";
      insights.push(
        `You have a ${Math.round(cp.completionRate * 100)}% completion rate for ${cp.taskType}${category} tasks`
      );
    }
    if (cp.bestHours.length > 0 && cp.sampleSize >= 5) {
      const hours = cp.bestHours.slice(0, 3).map(h => `${h}:00`).join(", ");
      const category = cp.category ? ` ${cp.category}` : "";
      insights.push(`Best hours for${category} ${cp.taskType} tasks: ${hours}`);
    }
  }

  // Energy patterns
  if (contextPatterns.highEnergyHours.length > 0) {
    const hours = contextPatterns.highEnergyHours.map(h => `${h}:00`).join(", ");
    insights.push(`You report high energy levels around: ${hours}`);
  }

  // Context sensitivity
  if (contextPatterns.isTrafficSensitive && contextPatterns.trafficConfidence >= 0.6) {
    insights.push("Traffic conditions have noticeably affected your task completion");
  }
  if (contextPatterns.isWeatherSensitive && contextPatterns.weatherConfidence >= 0.6) {
    insights.push("Weather conditions have noticeably affected your task completion");
  }

  return insights;
}

/**
 * Update user preferences based on analyzed patterns
 */
export async function applyPatternsToPreferences(
  userId: string,
  patterns: UserPatterns
): Promise<{ updated: number; preferences: string[] }> {
  const updated: string[] = [];

  // Update high/low energy hours
  if (patterns.contextPatterns.highEnergyHours.length > 0) {
    await setPreference(
      userId,
      "high_energy_hours",
      { hours: patterns.contextPatterns.highEnergyHours },
      0.7,
      "inferred"
    );
    updated.push("high_energy_hours");
  }

  if (patterns.contextPatterns.lowEnergyHours.length > 0) {
    await setPreference(
      userId,
      "low_energy_hours",
      { hours: patterns.contextPatterns.lowEnergyHours },
      0.7,
      "inferred"
    );
    updated.push("low_energy_hours");
  }

  // Update traffic/weather sensitivity
  if (patterns.contextPatterns.trafficConfidence >= 0.6) {
    await setPreference(
      userId,
      "traffic_sensitive",
      { sensitive: patterns.contextPatterns.isTrafficSensitive },
      patterns.contextPatterns.trafficConfidence,
      "inferred"
    );
    updated.push("traffic_sensitive");
  }

  if (patterns.contextPatterns.weatherConfidence >= 0.6) {
    await setPreference(
      userId,
      "weather_sensitive",
      { sensitive: patterns.contextPatterns.isWeatherSensitive },
      patterns.contextPatterns.weatherConfidence,
      "inferred"
    );
    updated.push("weather_sensitive");
  }

  // Update duration adjustments
  for (const dp of patterns.durationPatterns) {
    if (Math.abs(dp.adjustmentMinutes) >= 5 && dp.sampleSize >= 3) {
      const key = dp.category
        ? `duration_adjustment_${dp.taskType}_${dp.category}`
        : `duration_adjustment_${dp.taskType}`;
      await setPreference(userId, key, { minutes: dp.adjustmentMinutes }, 0.7, "inferred");
      updated.push(key);
    }
  }

  // Update preferred time slots by task type
  for (const cp of patterns.completionPatterns) {
    if (cp.bestHours.length > 0 && cp.sampleSize >= 5) {
      const key = cp.category
        ? `preferred_hours_${cp.taskType}_${cp.category}`
        : `preferred_hours_${cp.taskType}`;
      await setPreference(userId, key, { hours: cp.bestHours }, 0.7, "inferred");
      updated.push(key);
    }
  }

  // Store learning data for the model
  for (const dp of patterns.durationPatterns) {
    await prisma.learningData.upsert({
      where: {
        userId_taskType_taskCategory: {
          userId,
          taskType: dp.taskType,
          taskCategory: dp.category || "general",
        },
      },
      update: {
        learnedDuration: dp.actualAvg,
        learnedPreferences: {
          adjustmentMinutes: dp.adjustmentMinutes,
          accuracy: dp.accuracy,
          sampleSize: dp.sampleSize,
        },
        updatedAt: new Date(),
      },
      create: {
        userId,
        taskType: dp.taskType,
        taskCategory: dp.category || "general",
        learnedDuration: dp.actualAvg,
        learnedPreferences: {
          adjustmentMinutes: dp.adjustmentMinutes,
          accuracy: dp.accuracy,
          sampleSize: dp.sampleSize,
        },
      },
    });
  }

  console.log(`[Patterns] Updated ${updated.length} preferences for user ${userId}`);

  return {
    updated: updated.length,
    preferences: updated,
  };
}

/**
 * Get optimal scheduling suggestions based on learned patterns
 */
export async function getSchedulingSuggestions(
  userId: string,
  taskType: string,
  category: string | null,
  estimatedDuration: number
): Promise<{
  suggestedHours: number[];
  suggestedDays: number[];
  adjustedDuration: number;
  confidence: number;
  reasoning: string[];
}> {
  // Get stored learning data
  const learningData = await prisma.learningData.findUnique({
    where: {
      userId_taskType_taskCategory: {
        userId,
        taskType,
        taskCategory: category || "general",
      },
    },
  });

  // Get user preferences
  const preferredHoursKey = category
    ? `preferred_hours_${taskType}_${category}`
    : `preferred_hours_${taskType}`;

  const durationAdjustKey = category
    ? `duration_adjustment_${taskType}_${category}`
    : `duration_adjustment_${taskType}`;

  const preferences = await prisma.userPreference.findMany({
    where: {
      userId,
      key: {
        in: [preferredHoursKey, durationAdjustKey, "high_energy_hours"],
      },
    },
  });

  const reasoning: string[] = [];
  let suggestedHours: number[] = [9, 10, 14, 15, 16]; // Defaults
  let suggestedDays: number[] = [1, 2, 3, 4, 5]; // Weekdays by default
  let adjustedDuration = estimatedDuration;
  let confidence = 0.3; // Low confidence if no data

  // Apply learned preferences
  for (const pref of preferences) {
    const value = pref.value as Record<string, unknown>;

    if (pref.key === preferredHoursKey) {
      // Extract hours from { hours: [...] } or direct array
      const hours = Array.isArray(value) ? value : (value?.hours as number[] | undefined);
      if (hours && Array.isArray(hours)) {
        suggestedHours = hours;
        confidence = Math.max(confidence, pref.confidence);
        reasoning.push(`Based on your completion history, best hours are: ${suggestedHours.map(h => `${h}:00`).join(", ")}`);
      }
    }

    if (pref.key === durationAdjustKey) {
      // Extract minutes from { minutes: N } or direct number
      const minutes = typeof value === "number" ? value : (value?.minutes as number | undefined);
      if (typeof minutes === "number") {
        adjustedDuration = estimatedDuration + minutes;
        reasoning.push(`Adjusted duration by ${minutes > 0 ? "+" : ""}${minutes} minutes based on past experience`);
      }
    }

    if (pref.key === "high_energy_hours") {
      // Extract hours from { hours: [...] } or direct array
      const hours = Array.isArray(value) ? value : (value?.hours as number[] | undefined);
      if (hours && Array.isArray(hours)) {
        // Prefer high energy hours for demanding tasks
        const overlap = suggestedHours.filter(h => hours.includes(h));
        if (overlap.length > 0) {
          suggestedHours = overlap;
          reasoning.push("Prioritizing your high-energy hours");
        }
      }
    }
  }

  // Use learning data if available
  if (learningData) {
    if (learningData.learnedDuration) {
      adjustedDuration = learningData.learnedDuration;
      confidence = Math.max(confidence, 0.7);
      reasoning.push(`Using learned duration of ${adjustedDuration} minutes`);
    }
  }

  if (reasoning.length === 0) {
    reasoning.push("Using default scheduling - complete more tasks to improve suggestions");
  }

  return {
    suggestedHours,
    suggestedDays,
    adjustedDuration: Math.round(adjustedDuration),
    confidence,
    reasoning,
  };
}

/**
 * Get progress tracking for a user
 */
export async function getProgressTracking(
  userId: string,
  weeksBack: number = 4
): Promise<{
  weeklyProgress: Array<{
    weekStart: Date;
    completed: number;
    total: number;
    rate: number;
  }>;
  streak: number;
  totalCompleted: number;
  improvement: number; // % change from first to last week
}> {
  const progress: Array<{ weekStart: Date; completed: number; total: number; rate: number }> = [];
  const now = new Date();

  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i));
    const weekEnd = endOfWeek(weekStart);

    const [completed, total] = await Promise.all([
      prisma.scheduledTask.count({
        where: {
          assignedToUserId: userId,
          status: "completed",
          startTime: { gte: weekStart, lte: weekEnd },
        },
      }),
      prisma.scheduledTask.count({
        where: {
          assignedToUserId: userId,
          startTime: { gte: weekStart, lte: weekEnd },
        },
      }),
    ]);

    progress.push({
      weekStart,
      completed,
      total,
      rate: total > 0 ? completed / total : 0,
    });
  }

  // Calculate streak (consecutive days with at least one completed task)
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const completedToday = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: userId,
        status: "completed",
        startTime: { gte: dayStart, lt: dayEnd },
      },
    });

    if (completedToday > 0) {
      streak++;
    } else if (i > 0) {
      break; // Streak broken
    }
  }

  // Calculate improvement
  const totalCompleted = progress.reduce((sum, w) => sum + w.completed, 0);
  let improvement = 0;
  if (progress.length >= 2) {
    const firstWeekRate = progress[0].rate;
    const lastWeekRate = progress[progress.length - 1].rate;
    if (firstWeekRate > 0) {
      improvement = ((lastWeekRate - firstWeekRate) / firstWeekRate) * 100;
    }
  }

  return {
    weeklyProgress: progress,
    streak,
    totalCompleted,
    improvement: Math.round(improvement),
  };
}
