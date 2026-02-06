import Anthropic from "@anthropic-ai/sdk";
import { CalendarEvent, AIScheduleResponse, ScheduleRecommendation, TimeSlot } from "@/types";
import { Task } from "@prisma/client";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { findAvailableSlots } from "./calendar";
import { BlockedTime, UserAvailabilityInfo, formatBlockedTimesForPrompt } from "./user-availability";
import {
  TaskInstance,
  ScheduledInstance,
  DayAvailability,
  expandTasksToInstances,
  calculateDayAvailability,
  findFirstAvailableSlot,
  scheduleInstancesDeterministically,
} from "./deterministic-scheduler";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ScheduleInput {
  userId: string;
  userName: string;
  calendarEvents: CalendarEvent[];
  tasks: Task[];
  learnedPreferences?: Record<string, unknown>;
  weekStart?: Date;
  blockedTimes?: BlockedTime[];
  availabilityInfo?: UserAvailabilityInfo;
  existingScheduledByTask?: Map<string, { count: number; dates: Set<string> }>;
}

/**
 * NEW HYBRID APPROACH:
 * Phase 1: Deterministically expand tasks into instances with assigned days
 * Phase 2: AI picks optimal times (or fallback to deterministic)
 * Phase 3: Validate and guarantee all instances are scheduled
 */
export async function generateSchedule(input: ScheduleInput): Promise<AIScheduleResponse> {
  const {
    userId,
    userName,
    calendarEvents,
    tasks,
    learnedPreferences,
    weekStart,
    blockedTimes,
    availabilityInfo,
    existingScheduledByTask,
  } = input;

  const now = new Date();
  const weekStartDate = weekStart || startOfWeek(now, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });
  const dayStart = availabilityInfo?.availableTimeStart ?? 6;
  const dayEnd = availabilityInfo?.availableTimeEnd ?? 22;

  // PHASE 1: Expand tasks into individual instances with assigned days
  const existing = existingScheduledByTask || new Map();
  console.log(`\n[generateSchedule] PHASE 1: Expanding tasks...`);
  console.log(`[generateSchedule] weekStartDate: ${format(weekStartDate, "yyyy-MM-dd")}, weekEndDate: ${format(weekEndDate, "yyyy-MM-dd")}`);
  console.log(`[generateSchedule] existingScheduledByTask size: ${existing.size}`);

  const { instances, conflicts: expansionConflicts } = expandTasksToInstances(
    tasks,
    weekStartDate,
    weekEndDate,
    existing
  );

  console.log(`[generateSchedule] PHASE 1 RESULT: ${instances.length} instances to schedule, ${expansionConflicts.length} expansion conflicts`);
  instances.forEach(i => console.log(`[generateSchedule]   - ${i.taskName} on ${i.assignedDay} (instance ${i.instanceNumber}/${i.totalInstances})`));
  expansionConflicts.forEach(c => console.log(`[generateSchedule]   - CONFLICT: ${c.taskName}: ${c.reason}`));

  if (instances.length === 0) {
    return {
      schedule: [],
      conflicts: expansionConflicts.map(c => ({
        taskId: c.taskId,
        reason: c.reason,
        alternatives: ["Try next week", "Reduce frequency"],
      })),
      summary: expansionConflicts.length > 0
        ? "Could not schedule any tasks due to conflicts."
        : "All tasks are already scheduled for this week!",
    };
  }

  // PHASE 2: Try AI for optimal time selection
  let scheduledInstances: ScheduledInstance[];

  try {
    scheduledInstances = await getAITimeSelections(
      instances,
      calendarEvents,
      blockedTimes || [],
      dayStart,
      dayEnd,
      userName,
      learnedPreferences
    );
  } catch (error) {
    console.error("AI time selection failed, using deterministic fallback:", error);
    scheduledInstances = scheduleInstancesDeterministically(
      instances,
      calendarEvents,
      blockedTimes || [],
      dayStart,
      dayEnd
    );
  }

  // PHASE 3: Validate and fill gaps with deterministic scheduling
  console.log(`\n[generateSchedule] PHASE 3: Validating and filling gaps...`);
  scheduledInstances = validateAndFillGaps(
    scheduledInstances,
    instances,
    calendarEvents,
    blockedTimes || [],
    dayStart,
    dayEnd
  );

  const successfullyScheduled = scheduledInstances.filter(s => !s.isConflict);
  const failedToSchedule = scheduledInstances.filter(s => s.isConflict);
  console.log(`[generateSchedule] PHASE 3 RESULT: ${successfullyScheduled.length} scheduled, ${failedToSchedule.length} conflicts`);
  successfullyScheduled.forEach(s => console.log(`[generateSchedule]   - OK: ${s.taskInstance.taskName} on ${s.taskInstance.assignedDay} at ${s.startTime}`));
  failedToSchedule.forEach(s => console.log(`[generateSchedule]   - FAIL: ${s.taskInstance.taskName} on ${s.taskInstance.assignedDay}: ${s.conflictReason}`));

  // Convert to API response format
  const schedule: ScheduleRecommendation[] = scheduledInstances
    .filter(s => !s.isConflict)
    .map(s => ({
      taskId: s.taskInstance.taskId,
      taskName: s.taskInstance.taskName,
      taskType: s.taskInstance.taskType,
      assignedToUserId: userId,
      date: s.taskInstance.assignedDay,
      startTime: s.startTime,
      endTime: s.endTime,
      reasoning: s.reasoning,
    }));

  const conflicts = [
    ...expansionConflicts.map(c => ({
      taskId: c.taskId,
      reason: c.reason,
      alternatives: ["Try next week", "Adjust frequency settings"],
    })),
    ...scheduledInstances
      .filter(s => s.isConflict)
      .map(s => ({
        taskId: s.taskInstance.taskId,
        reason: s.conflictReason || `Could not schedule ${s.taskInstance.taskName} on ${s.taskInstance.dayName}`,
        alternatives: ["Double-book anyway", "Try a different day", "Skip this instance"],
      })),
  ];

  // Generate summary
  const scheduledCount = schedule.length;
  const conflictCount = conflicts.length;
  let summary = `Scheduled ${scheduledCount} task session${scheduledCount !== 1 ? "s" : ""} for the week.`;
  if (conflictCount > 0) {
    summary += ` ${conflictCount} session${conflictCount !== 1 ? "s" : ""} could not be scheduled due to time conflicts.`;
  }

  return { schedule, conflicts, summary };
}

/**
 * PHASE 2: Ask AI to pick optimal times for each instance
 */
async function getAITimeSelections(
  instances: TaskInstance[],
  calendarEvents: CalendarEvent[],
  blockedTimes: BlockedTime[],
  dayStart: number,
  dayEnd: number,
  userName: string,
  learnedPreferences?: Record<string, unknown>
): Promise<ScheduledInstance[]> {
  // Group instances by day
  const instancesByDay = new Map<string, TaskInstance[]>();
  for (const instance of instances) {
    if (!instancesByDay.has(instance.assignedDay)) {
      instancesByDay.set(instance.assignedDay, []);
    }
    instancesByDay.get(instance.assignedDay)!.push(instance);
  }

  // Calculate availability for each day
  const dayAvailabilities = new Map<string, DayAvailability>();
  const results: ScheduledInstance[] = [];

  Array.from(instancesByDay.entries()).forEach(([dateStr]) => {
    const date = new Date(dateStr + "T12:00:00");

    // Get fresh availability (accounting for already scheduled in results)
    const availability = calculateDayAvailability(
      date,
      calendarEvents,
      blockedTimes,
      results,
      dayStart,
      dayEnd
    );
    dayAvailabilities.set(dateStr, availability);
  });

  // Build prompt for AI
  const prompt = buildTimeSelectionPrompt(
    instances,
    dayAvailabilities,
    userName,
    learnedPreferences
  );

  // Call AI
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";

  // Parse AI response
  const aiSelections = parseAITimeSelections(responseText);

  // Map AI selections to instances
  for (const instance of instances) {
    const key = `${instance.taskId}-${instance.assignedDay}-${instance.instanceNumber}`;
    const aiSelection = aiSelections.get(key);

    if (aiSelection && aiSelection.startTime) {
      // Calculate end time
      const [hour, min] = aiSelection.startTime.split(":").map(Number);
      const endDate = new Date();
      endDate.setHours(hour, min + instance.duration, 0, 0);
      const endTime = format(endDate, "HH:mm");

      results.push({
        taskInstance: instance,
        startTime: aiSelection.startTime,
        endTime,
        reasoning: aiSelection.reasoning || generateDefaultReasoning(instance),
        isConflict: false,
      });
    } else {
      // AI didn't provide selection - will be filled by validation phase
      results.push({
        taskInstance: instance,
        startTime: "",
        endTime: "",
        reasoning: "",
        isConflict: true,
        conflictReason: "AI did not provide time selection",
      });
    }
  }

  return results;
}

/**
 * Build a focused prompt for AI to select optimal times
 */
function buildTimeSelectionPrompt(
  instances: TaskInstance[],
  dayAvailabilities: Map<string, DayAvailability>,
  userName: string,
  learnedPreferences?: Record<string, unknown>
): string {
  // Group by day for cleaner prompt
  const byDay = new Map<string, TaskInstance[]>();
  for (const inst of instances) {
    if (!byDay.has(inst.assignedDay)) {
      byDay.set(inst.assignedDay, []);
    }
    byDay.get(inst.assignedDay)!.push(inst);
  }

  let prompt = `You are ResolutionAI, helping ${userName} schedule their week optimally.

Your job is SIMPLE: For each task instance below, pick the BEST start time from the available slots.
The days and number of instances have already been determined - you just need to pick times.

## Guidelines for optimal time selection:
- Exercise/Gym tasks: Morning (6-9am) is typically best for energy and consistency
- Deep work/Focus tasks: Morning (8-11am) when mental energy is highest
- Learning/Reading: Evening (6-9pm) can work well for wind-down activities
- Errands/Chores: Afternoon or whenever convenient
- Consider spacing tasks throughout the day (don't cluster everything)
${learnedPreferences ? `\n## User's learned preferences:\n${JSON.stringify(learnedPreferences, null, 2)}` : ""}

## Tasks to schedule by day:
`;

  Array.from(byDay.entries()).forEach(([dateStr, dayInstances]) => {
    const availability = dayAvailabilities.get(dateStr);
    const dayName = dayInstances[0]?.dayName || dateStr;

    prompt += `\n### ${dayName} (${dateStr})\n`;
    prompt += `Available time slots:\n`;

    if (availability && availability.slots.length > 0) {
      for (const slot of availability.slots) {
        prompt += `- ${format(slot.start, "HH:mm")} to ${format(slot.end, "HH:mm")} (${slot.duration} minutes)\n`;
      }
    } else {
      prompt += `- No available slots\n`;
    }

    prompt += `\nTasks to schedule:\n`;
    for (const inst of dayInstances) {
      const instanceLabel = inst.totalInstances > 1
        ? ` (${inst.instanceNumber}/${inst.totalInstances})`
        : "";
      prompt += `- ID: "${inst.taskId}-${inst.assignedDay}-${inst.instanceNumber}"\n`;
      prompt += `  Name: ${inst.taskName}${instanceLabel}\n`;
      prompt += `  Type: ${inst.taskType} | Category: ${inst.category || "general"}\n`;
      prompt += `  Duration: ${inst.duration} minutes\n`;
      if (inst.fixedTime) {
        prompt += `  REQUIRED TIME: ${inst.fixedTime} (must be scheduled at this exact time)\n`;
      }
      if (inst.preferredTimeStart && inst.preferredTimeEnd) {
        prompt += `  Preferred window: ${inst.preferredTimeStart} - ${inst.preferredTimeEnd}\n`;
      }
    }
  });

  prompt += `
## Response format
Return ONLY a valid JSON object:
{
  "selections": [
    {
      "id": "taskId-date-instanceNumber",
      "startTime": "HH:MM",
      "reasoning": "Brief explanation of why this time is optimal"
    }
  ]
}

IMPORTANT:
- Return a selection for EVERY task listed above
- Times must be in HH:MM format (24-hour)
- Times must fall within an available slot
- If a task has a REQUIRED TIME, use exactly that time
- If no slot fits, still return the entry with startTime: null`;

  return prompt;
}

/**
 * Parse AI's time selections from response
 */
function parseAITimeSelections(
  responseText: string
): Map<string, { startTime: string | null; reasoning: string }> {
  const selections = new Map<string, { startTime: string | null; reasoning: string }>();

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response");
      return selections;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.selections && Array.isArray(parsed.selections)) {
      for (const sel of parsed.selections) {
        if (sel.id) {
          selections.set(sel.id, {
            startTime: sel.startTime || null,
            reasoning: sel.reasoning || "",
          });
        }
      }
    }
  } catch (error) {
    console.error("Error parsing AI time selections:", error);
  }

  return selections;
}

/**
 * PHASE 3: Validate AI selections and fill gaps with deterministic scheduling
 */
function validateAndFillGaps(
  aiResults: ScheduledInstance[],
  allInstances: TaskInstance[],
  calendarEvents: CalendarEvent[],
  blockedTimes: BlockedTime[],
  dayStart: number,
  dayEnd: number
): ScheduledInstance[] {
  const validatedResults: ScheduledInstance[] = [];
  const processedInstanceIds = new Set<string>();

  // First pass: validate AI selections
  for (const result of aiResults) {
    const instanceId = `${result.taskInstance.taskId}-${result.taskInstance.assignedDay}-${result.taskInstance.instanceNumber}`;

    if (result.isConflict || !result.startTime) {
      // AI didn't provide valid selection - will fill later
      continue;
    }

    // Validate the time is within an available slot
    const date = new Date(result.taskInstance.assignedDay + "T12:00:00");
    const availability = calculateDayAvailability(
      date,
      calendarEvents,
      blockedTimes,
      validatedResults, // Check against already validated results
      dayStart,
      dayEnd
    );

    const isValid = validateTimeInSlots(
      result.startTime,
      result.taskInstance.duration,
      availability.slots
    );

    if (isValid) {
      validatedResults.push(result);
      processedInstanceIds.add(instanceId);
    }
    // If not valid, will be filled deterministically
  }

  // Second pass: fill gaps for instances not yet scheduled
  for (const instance of allInstances) {
    const instanceId = `${instance.taskId}-${instance.assignedDay}-${instance.instanceNumber}`;

    if (processedInstanceIds.has(instanceId)) {
      continue;
    }

    // Try to schedule deterministically
    const date = new Date(instance.assignedDay + "T12:00:00");
    const availability = calculateDayAvailability(
      date,
      calendarEvents,
      blockedTimes,
      validatedResults,
      dayStart,
      dayEnd
    );

    const slot = findFirstAvailableSlot(
      availability,
      instance.duration,
      instance.fixedTime,
      instance.preferredTimeStart,
      instance.preferredTimeEnd
    );

    if (slot) {
      validatedResults.push({
        taskInstance: instance,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reasoning: generateDefaultReasoning(instance),
        isConflict: false,
      });
    } else {
      validatedResults.push({
        taskInstance: instance,
        startTime: "",
        endTime: "",
        reasoning: "",
        isConflict: true,
        conflictReason: instance.fixedTime
          ? `Required time ${instance.fixedTime} not available on ${instance.dayName}`
          : `No ${instance.duration}-minute slot available on ${instance.dayName}`,
      });
    }
  }

  return validatedResults;
}

/**
 * Validate that a time fits within available slots
 */
function validateTimeInSlots(
  startTime: string,
  duration: number,
  slots: TimeSlot[]
): boolean {
  const [hour, min] = startTime.split(":").map(Number);

  for (const slot of slots) {
    const slotStartHour = slot.start.getHours();
    const slotStartMin = slot.start.getMinutes();
    const slotEndHour = slot.end.getHours();
    const slotEndMin = slot.end.getMinutes();

    const startMinutes = hour * 60 + min;
    const endMinutes = startMinutes + duration;
    const slotStartMinutes = slotStartHour * 60 + slotStartMin;
    const slotEndMinutes = slotEndHour * 60 + slotEndMin;

    if (startMinutes >= slotStartMinutes && endMinutes <= slotEndMinutes) {
      return true;
    }
  }

  return false;
}

/**
 * Generate default reasoning when AI doesn't provide one
 */
function generateDefaultReasoning(instance: TaskInstance): string {
  const parts: string[] = [];

  if (instance.fixedTime) {
    parts.push(`Scheduled at your fixed time of ${instance.fixedTime}`);
  } else {
    parts.push(`Scheduled at first available slot on ${instance.dayName}`);
  }

  if (instance.totalInstances > 1) {
    parts.push(`Session ${instance.instanceNumber} of ${instance.totalInstances} this week`);
  }

  return parts.join(". ") + ".";
}

// ============================================================================
// FAMILY SCHEDULING (keeping existing implementation for now)
// ============================================================================

interface FamilyMemberData {
  userId: string;
  userName: string;
  calendarEvents: CalendarEvent[];
  tasks: Task[];
  blockedTimes?: BlockedTime[];
  availabilityInfo?: UserAvailabilityInfo;
}

interface FamilyScheduleInput {
  familyMembers: FamilyMemberData[];
  familyTasks: Task[];
  weekStart?: Date;
  existingScheduledByTask?: Map<string, { count: number; dates: Set<string> }>;
}

export async function generateFamilySchedule(input: FamilyScheduleInput): Promise<AIScheduleResponse> {
  const { familyMembers, familyTasks, weekStart, existingScheduledByTask } = input;

  const now = new Date();
  const weekStartDate = weekStart || startOfWeek(now, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

  // Find available slots for each family member for each day
  const memberAvailability: Record<string, Record<string, TimeSlot[]>> = {};

  for (const member of familyMembers) {
    memberAvailability[member.userId] = {};
    const bufferMinutes = member.availabilityInfo?.bufferMinutes || 0;
    const memberDayStart = member.availabilityInfo?.availableTimeStart ?? 6;
    const memberDayEnd = member.availabilityInfo?.availableTimeEnd ?? 22;

    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStartDate, i);
      const dayStr = format(day, "yyyy-MM-dd");
      const slots = findAvailableSlots(member.calendarEvents, day, memberDayStart, memberDayEnd);

      if (member.blockedTimes && member.blockedTimes.length > 0) {
        memberAvailability[member.userId][dayStr] = filterSlotsAgainstBlockedTimes(
          slots,
          member.blockedTimes,
          bufferMinutes
        );
      } else {
        memberAvailability[member.userId][dayStr] = slots;
      }
    }
  }

  // Combine all tasks
  const allTasks = [
    ...familyMembers.flatMap(m => m.tasks),
    ...familyTasks,
  ].sort((a, b) => a.priority - b.priority);

  // Build the family scheduling prompt
  const prompt = buildFamilySchedulingPrompt({
    familyMembers,
    memberAvailability,
    allTasks,
    familyTasks,
    weekStart: weekStartDate,
    weekEnd: weekEndDate,
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    return parseFamilyAIResponse(responseText, familyMembers);
  } catch (error) {
    console.error("AI family scheduling error:", error);
    return generateFamilyFallbackSchedule(allTasks, memberAvailability, familyMembers, weekStartDate, weekEndDate, existingScheduledByTask);
  }
}

function filterSlotsAgainstBlockedTimes(
  slots: TimeSlot[],
  blockedTimes: BlockedTime[],
  bufferMinutes: number
): TimeSlot[] {
  const filteredSlots: TimeSlot[] = [];

  for (const slot of slots) {
    let currentStart = slot.start;
    const slotEnd = slot.end;

    const relevantBlocks = blockedTimes
      .filter((b) => b.start < slotEnd && b.end > slot.start)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (relevantBlocks.length === 0) {
      filteredSlots.push(slot);
      continue;
    }

    for (const block of relevantBlocks) {
      const blockStartWithBuffer = new Date(block.start);
      if (bufferMinutes > 0) {
        blockStartWithBuffer.setMinutes(blockStartWithBuffer.getMinutes() - bufferMinutes);
      }

      if (currentStart < blockStartWithBuffer) {
        const duration = Math.floor((blockStartWithBuffer.getTime() - currentStart.getTime()) / 60000);
        if (duration >= 15) {
          filteredSlots.push({
            start: new Date(currentStart),
            end: new Date(blockStartWithBuffer),
            duration,
          });
        }
      }

      const blockEndWithBuffer = new Date(block.end);
      if (bufferMinutes > 0) {
        blockEndWithBuffer.setMinutes(blockEndWithBuffer.getMinutes() + bufferMinutes);
      }

      if (blockEndWithBuffer > currentStart) {
        currentStart = blockEndWithBuffer;
      }
    }

    if (currentStart < slotEnd) {
      const duration = Math.floor((slotEnd.getTime() - currentStart.getTime()) / 60000);
      if (duration >= 15) {
        filteredSlots.push({
          start: new Date(currentStart),
          end: new Date(slotEnd),
          duration,
        });
      }
    }
  }

  return filteredSlots;
}

function buildFamilySchedulingPrompt(params: {
  familyMembers: FamilyMemberData[];
  memberAvailability: Record<string, Record<string, TimeSlot[]>>;
  allTasks: Task[];
  familyTasks: Task[];
  weekStart: Date;
  weekEnd: Date;
}): string {
  const { familyMembers, memberAvailability, familyTasks, weekStart, weekEnd } = params;

  const getTimeString = (time: CalendarEvent['start']): string | undefined => {
    if (typeof time === 'string') return time;
    if (time instanceof Date) return time.toISOString();
    return time.dateTime || time.date;
  };

  const formatDays = (days: unknown[] | null): string | null => {
    if (!days || (days as unknown[]).length === 0) return null;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return (days as unknown[]).map(d => {
      if (typeof d === 'string') return d.charAt(0).toUpperCase() + d.slice(1);
      if (typeof d === 'number') return dayNames[d];
      return String(d);
    }).join(", ");
  };

  const memberSummaries = familyMembers.map((member) => {
    const calendarSummary = member.calendarEvents.map((e) => ({
      title: e.summary,
      start: getTimeString(e.start),
      end: getTimeString(e.end),
    }));

    const slotsSummary = Object.entries(memberAvailability[member.userId]).map(([date, slots]) => ({
      date,
      slots: slots.map((s) => ({
        start: format(s.start, "HH:mm"),
        end: format(s.end, "HH:mm"),
        duration: s.duration,
      })),
    }));

    const personalTasks = member.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      duration: t.duration,
      category: t.category,
      priority: t.priority,
      schedulingMode: t.schedulingMode,
      fixedDays: t.fixedDays ? formatDays(t.fixedDays as unknown[]) : null,
      fixedTime: t.fixedTime,
      frequency: t.frequency,
      frequencyPeriod: t.frequencyPeriod,
    }));

    const blockedTimesInfo = member.blockedTimes && member.blockedTimes.length > 0
      ? formatBlockedTimesForPrompt(member.blockedTimes)
      : "No specific work schedule configured";

    return {
      userId: member.userId,
      name: member.userName,
      calendar: calendarSummary,
      availableSlots: slotsSummary,
      personalTasks,
      blockedTimes: blockedTimesInfo,
      bufferMinutes: member.availabilityInfo?.bufferMinutes || 0,
    };
  });

  const sharedTasksSummary = familyTasks.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    duration: t.duration,
    category: t.category,
    priority: t.priority,
    schedulingMode: t.schedulingMode,
    fixedDays: t.fixedDays ? formatDays(t.fixedDays as unknown[]) : null,
    fixedTime: t.fixedTime,
    frequency: t.frequency,
    frequencyPeriod: t.frequencyPeriod,
  }));

  return `You are ResolutionAI, an intelligent FAMILY scheduling assistant.

## Week: ${format(weekStart, "EEEE, MMMM d")} to ${format(weekEnd, "EEEE, MMMM d, yyyy")}

## Family Members
${memberSummaries.map((m, i) => `
### ${m.name} (ID: ${m.userId})
**Calendar:** ${JSON.stringify(m.calendar, null, 2)}
**Work Hours:** ${m.blockedTimes}
**Available Slots:** ${JSON.stringify(m.availableSlots, null, 2)}
**Personal Tasks:** ${JSON.stringify(m.personalTasks, null, 2)}
`).join("\n")}

## Shared Tasks
${JSON.stringify(sharedTasksSummary, null, 2)}

## Instructions
1. RESPECT frequency - if a task needs 4x/week, create 4 entries
2. RESPECT fixed days/times - schedule exactly as specified
3. Personal tasks go to their owner
4. Shared tasks distributed fairly based on availability

## Response Format
{
  "schedule": [
    {
      "taskId": "id",
      "taskName": "name",
      "taskType": "type",
      "assignedToUserId": "user_id",
      "assignedToName": "name",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reasoning": "explanation"
    }
  ],
  "conflicts": [],
  "fairnessScore": 50,
  "summary": "summary"
}`;
}

function parseFamilyAIResponse(responseText: string, familyMembers: FamilyMemberData[]): AIScheduleResponse {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    const schedule: ScheduleRecommendation[] = (parsed.schedule || []).map((item: Record<string, unknown>) => ({
      taskId: item.taskId as string,
      taskName: item.taskName as string,
      taskType: item.taskType as string,
      assignedToUserId: item.assignedToUserId as string || familyMembers[0].userId,
      date: item.date as string,
      startTime: item.startTime as string,
      endTime: item.endTime as string,
      reasoning: item.reasoning as string,
    }));

    return {
      schedule,
      conflicts: parsed.conflicts || [],
      fairnessScore: parsed.fairnessScore,
      summary: parsed.summary || "Family schedule generated!",
    };
  } catch (error) {
    console.error("Error parsing family AI response:", error);
    throw new Error("Failed to parse AI response");
  }
}

function generateFamilyFallbackSchedule(
  tasks: Task[],
  memberAvailability: Record<string, Record<string, TimeSlot[]>>,
  familyMembers: FamilyMemberData[],
  weekStart: Date,
  weekEnd: Date,
  existingScheduledByTask?: Map<string, { count: number; dates: Set<string> }>
): AIScheduleResponse {
  const schedule: ScheduleRecommendation[] = [];
  const conflicts: AIScheduleResponse["conflicts"] = [];
  const usedSlots: Record<string, Set<string>> = {};
  const taskCounts: Record<string, number> = {};
  const scheduledTaskDates: Record<string, Set<string>> = {}; // Track dates per task

  const dayNameToNumber: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6
  };

  for (const member of familyMembers) {
    usedSlots[member.userId] = new Set();
    taskCounts[member.userId] = 0;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Initialize scheduledTaskDates from existingScheduledByTask
  if (existingScheduledByTask) {
    existingScheduledByTask.forEach((data, taskId) => {
      scheduledTaskDates[taskId] = new Set(data.dates);
    });
  }

  console.log(`[generateFamilyFallbackSchedule] Starting with ${existingScheduledByTask?.size || 0} tasks already scheduled`);

  for (const task of tasks) {
    // Initialize tracking for this task if not already from existing
    if (!scheduledTaskDates[task.id]) {
      scheduledTaskDates[task.id] = new Set();
    }

    const alreadyScheduledCount = scheduledTaskDates[task.id].size;

    // Determine how many instances needed
    const isFixedSchedule = task.schedulingMode === "fixed";
    const fixedDays = (task.fixedDays as string[] | null) || [];
    const fixedTime = task.fixedTime;
    const frequency = task.frequency || 1;
    const frequencyPeriod = task.frequencyPeriod || "week";

    // Calculate total instances needed for the week
    let totalInstancesNeeded: number;
    if (isFixedSchedule && fixedDays.length > 0) {
      totalInstancesNeeded = fixedDays.length;
    } else if (frequencyPeriod === "day") {
      totalInstancesNeeded = 7 * frequency;
    } else {
      totalInstancesNeeded = frequency;
    }

    // Subtract already scheduled (from both existing AND this run)
    const instancesNeeded = Math.max(0, totalInstancesNeeded - alreadyScheduledCount);

    console.log(`[generateFamilyFallbackSchedule] Task "${task.name}": total=${totalInstancesNeeded}, alreadyScheduled=${alreadyScheduledCount}, needed=${instancesNeeded}`);

    if (instancesNeeded === 0) {
      // Task is already fully scheduled for the week
      continue;
    }

    let eligibleMembers = familyMembers;
    if (task.userId) {
      eligibleMembers = familyMembers.filter(m => m.userId === task.userId);
    } else {
      eligibleMembers = [...familyMembers].sort(
        (a, b) => taskCounts[a.userId] - taskCounts[b.userId]
      );
    }

    // Convert fixed days to allowed day numbers
    const allowedDayNumbers = fixedDays.map(d => dayNameToNumber[d.toLowerCase()]).filter(n => n !== undefined);

    for (let i = 0; i < instancesNeeded; i++) {
      let scheduledThisInstance = false;

      for (const member of eligibleMembers) {
        if (scheduledThisInstance) break;

        for (const [date, slots] of Object.entries(memberAvailability[member.userId])) {
          if (scheduledThisInstance) break;

          // Skip if already scheduled on this date for this task
          if (scheduledTaskDates[task.id].has(date)) continue;

          // Check if this date is allowed for fixed day tasks
          const dateObj = new Date(date + "T12:00:00");
          const dayOfWeek = dateObj.getDay();

          if (isFixedSchedule && allowedDayNumbers.length > 0 && !allowedDayNumbers.includes(dayOfWeek)) {
            continue; // Skip days not in fixed days
          }

          // Skip past dates
          const dateStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
          if (dateStart < today) continue;

          // For fixed time tasks
          if (fixedTime) {
            const [fixedHour, fixedMin] = fixedTime.split(":").map(Number);

            // Check if fixed time has passed today
            if (dateStart.getTime() === today.getTime()) {
              const fixedDateTime = new Date(dateObj);
              fixedDateTime.setHours(fixedHour, fixedMin, 0, 0);
              if (fixedDateTime <= now) continue;
            }

            // Check if fixed time fits in any slot
            for (const slot of slots) {
              const slotStartMinutes = slot.start.getHours() * 60 + slot.start.getMinutes();
              const slotEndMinutes = slot.end.getHours() * 60 + slot.end.getMinutes();
              const fixedStartMinutes = fixedHour * 60 + fixedMin;
              const fixedEndMinutes = fixedStartMinutes + task.duration;

              if (fixedStartMinutes >= slotStartMinutes && fixedEndMinutes <= slotEndMinutes) {
                const endTime = new Date(dateObj);
                endTime.setHours(fixedHour, fixedMin + task.duration, 0, 0);

                schedule.push({
                  taskId: task.id,
                  taskName: task.name,
                  taskType: task.type,
                  assignedToUserId: member.userId,
                  date,
                  startTime: fixedTime,
                  endTime: format(endTime, "HH:mm"),
                  reasoning: `Scheduled at fixed time ${fixedTime} for ${member.userName}`,
                });

                scheduledTaskDates[task.id].add(date);
                taskCounts[member.userId]++;
                scheduledThisInstance = true;
                break;
              }
            }
          } else {
            // Flexible time - find first available slot
            for (const slot of slots) {
              // Skip past slots
              if (slot.start <= now) continue;

              const slotKey = `${date}-${format(slot.start, "HH:mm")}`;
              if (usedSlots[member.userId].has(slotKey)) continue;

              if (slot.duration >= task.duration) {
                const endTime = new Date(slot.start);
                endTime.setMinutes(endTime.getMinutes() + task.duration);

                schedule.push({
                  taskId: task.id,
                  taskName: task.name,
                  taskType: task.type,
                  assignedToUserId: member.userId,
                  date,
                  startTime: format(slot.start, "HH:mm"),
                  endTime: format(endTime, "HH:mm"),
                  reasoning: `Assigned to ${member.userName} based on availability`,
                });

                usedSlots[member.userId].add(slotKey);
                scheduledTaskDates[task.id].add(date);
                taskCounts[member.userId]++;
                scheduledThisInstance = true;
                break;
              }
            }
          }
        }
      }

      if (!scheduledThisInstance) {
        conflicts.push({
          taskId: task.id,
          reason: fixedTime
            ? `No available slot at ${fixedTime} for "${task.name}"`
            : `No available ${task.duration}-minute slot found for "${task.name}"`,
          alternatives: ["Try next week", "Adjust constraints"],
        });
      }
    }
  }

  return {
    schedule,
    conflicts,
    summary: `Family schedule generated: ${schedule.length} tasks scheduled, ${conflicts.length} conflicts.`,
  };
}
