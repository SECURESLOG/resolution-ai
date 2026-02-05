import Anthropic from "@anthropic-ai/sdk";
import { CalendarEvent, AIScheduleResponse, ScheduleRecommendation, TimeSlot } from "@/types";
import { Task } from "@prisma/client";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { findAvailableSlots } from "./calendar";

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
}

export async function generateSchedule(input: ScheduleInput): Promise<AIScheduleResponse> {
  const { userId, userName, calendarEvents, tasks, learnedPreferences, weekStart } = input;

  const now = new Date();
  const weekStartDate = weekStart || startOfWeek(now, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

  // Find available slots for each day of the week
  const availableSlotsByDay: Record<string, TimeSlot[]> = {};
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStartDate, i);
    const dayStr = format(day, "yyyy-MM-dd");
    availableSlotsByDay[dayStr] = findAvailableSlots(calendarEvents, day);
  }

  // Sort tasks by priority
  const sortedTasks = [...tasks].sort((a, b) => a.priority - b.priority);

  // Build the prompt
  const prompt = buildSchedulingPrompt({
    userName,
    userId,
    calendarEvents,
    tasks: sortedTasks,
    availableSlotsByDay,
    learnedPreferences,
    weekStart: weekStartDate,
    weekEnd: weekEndDate,
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the AI response
    return parseAIResponse(responseText, userId);
  } catch (error) {
    console.error("AI scheduling error:", error);
    // Fallback to simple scheduling
    return generateFallbackSchedule(sortedTasks, availableSlotsByDay, userId);
  }
}

function buildSchedulingPrompt(params: {
  userName: string;
  userId: string;
  calendarEvents: CalendarEvent[];
  tasks: Task[];
  availableSlotsByDay: Record<string, TimeSlot[]>;
  learnedPreferences?: Record<string, unknown>;
  weekStart: Date;
  weekEnd: Date;
}): string {
  const { userName, calendarEvents, tasks, availableSlotsByDay, learnedPreferences, weekStart, weekEnd } = params;

  // Helper to extract time string from CalendarEvent start/end
  const getTimeString = (time: CalendarEvent['start']): string | undefined => {
    if (typeof time === 'string') return time;
    if (time instanceof Date) return time.toISOString();
    return time.dateTime || time.date;
  };

  const calendarSummary = calendarEvents.map((e) => ({
    title: e.summary,
    start: getTimeString(e.start),
    end: getTimeString(e.end),
  }));

  // Helper to format day arrays
  const formatDays = (days: unknown[] | null): string | null => {
    if (!days || (days as unknown[]).length === 0) return null;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return (days as unknown[]).map(d => {
      if (typeof d === 'string') return d.charAt(0).toUpperCase() + d.slice(1);
      if (typeof d === 'number') return dayNames[d];
      return String(d);
    }).join(", ");
  };

  const tasksSummary = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    duration: t.duration,
    isFlexible: t.isFlexible,
    category: t.category,
    priority: t.priority,
    schedulingMode: t.schedulingMode,
    fixedDays: t.fixedDays ? formatDays(t.fixedDays as unknown[]) : null,
    fixedTime: t.fixedTime,
    requiredDays: t.requiredDays ? formatDays(t.requiredDays as unknown[]) : null,
    preferredDays: t.preferredDays ? formatDays(t.preferredDays as unknown[]) : null,
    frequency: t.frequency,
    frequencyPeriod: t.frequencyPeriod,
  }));

  const slotsSummary = Object.entries(availableSlotsByDay).map(([date, slots]) => ({
    date,
    slots: slots.map((s) => ({
      start: format(s.start, "HH:mm"),
      end: format(s.end, "HH:mm"),
      duration: s.duration,
    })),
  }));

  return `You are ResolutionAI, an intelligent scheduling assistant. Your job is to help ${userName} achieve their goals and manage Life Admin by finding optimal time slots in their calendar.

## Week to Schedule
From ${format(weekStart, "EEEE, MMMM d, yyyy")} to ${format(weekEnd, "EEEE, MMMM d, yyyy")}

## Current Calendar Events (blocked times - DO NOT schedule over these)
${JSON.stringify(calendarSummary, null, 2)}

## Available Time Slots
${JSON.stringify(slotsSummary, null, 2)}

## Tasks to Schedule
${JSON.stringify(tasksSummary, null, 2)}

## Priority Levels (1 = highest, 4 = lowest)
1. Work commitments (already blocked in calendar)
2. Non-flexible Life Admin tasks
3. Focus Time goals (gym, reading, learning, deep work, etc.)
4. Flexible Life Admin tasks

${learnedPreferences ? `## Learned Preferences from Previous Feedback\n${JSON.stringify(learnedPreferences, null, 2)}` : ""}

## Instructions
1. **CRITICAL: Respect scheduling constraints:**
   - Tasks with schedulingMode="fixed" MUST be scheduled on ALL of their fixedDays (e.g., if fixedDays="Monday, Tuesday, Wednesday, Thursday, Friday", create 5 separate schedule entries, one for each day)
   - Tasks with fixedTime MUST be scheduled at that exact time on each scheduled day
   - Tasks with requiredDays can ONLY be scheduled on those specific days
   - The frequency field indicates how many times per week to schedule - match this with the number of entries you create
2. Analyze the available time slots and tasks
3. Schedule non-flexible tasks first at appropriate times
4. Find optimal slots for Focus Time tasks (consider time of day preferences - gym in morning, reading in evening, etc.)
5. Distribute remaining Life Admin tasks in available gaps
6. For each scheduled task, explain WHY you chose that time slot
7. If a task cannot fit due to constraints, add it to conflicts with alternatives

## Response Format
Return ONLY a valid JSON object with this structure:
{
  "schedule": [
    {
      "taskId": "task_id_here",
      "taskName": "Task name",
      "taskType": "resolution or household",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reasoning": "Explanation of why this time slot was chosen"
    }
  ],
  "conflicts": [
    {
      "taskId": "task_id",
      "reason": "Why it couldn't be scheduled",
      "alternatives": ["Alternative suggestion 1", "Alternative suggestion 2"]
    }
  ],
  "summary": "A brief encouraging summary of the week's schedule"
}

Be encouraging and supportive in your reasoning. Help the user feel motivated to achieve their resolutions!`;
}

function parseAIResponse(responseText: string, userId: string): AIScheduleResponse {
  try {
    // Extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and transform the response
    const schedule: ScheduleRecommendation[] = (parsed.schedule || []).map((item: Record<string, unknown>) => ({
      taskId: item.taskId as string,
      taskName: item.taskName as string,
      taskType: item.taskType as string,
      assignedToUserId: userId,
      date: item.date as string,
      startTime: item.startTime as string,
      endTime: item.endTime as string,
      reasoning: item.reasoning as string,
    }));

    return {
      schedule,
      conflicts: parsed.conflicts || [],
      summary: parsed.summary || "Your schedule has been generated!",
    };
  } catch (error) {
    console.error("Error parsing AI response:", error);
    throw new Error("Failed to parse AI response");
  }
}

function generateFallbackSchedule(
  tasks: Task[],
  availableSlotsByDay: Record<string, TimeSlot[]>,
  userId: string
): AIScheduleResponse {
  const schedule: ScheduleRecommendation[] = [];
  const conflicts: AIScheduleResponse["conflicts"] = [];
  const usedSlots: Set<string> = new Set();

  for (const task of tasks) {
    let scheduled = false;

    for (const [date, slots] of Object.entries(availableSlotsByDay)) {
      for (const slot of slots) {
        const slotKey = `${date}-${format(slot.start, "HH:mm")}`;
        if (usedSlots.has(slotKey)) continue;

        if (slot.duration >= task.duration) {
          const endTime = new Date(slot.start);
          endTime.setMinutes(endTime.getMinutes() + task.duration);

          schedule.push({
            taskId: task.id,
            taskName: task.name,
            taskType: task.type,
            assignedToUserId: userId,
            date,
            startTime: format(slot.start, "HH:mm"),
            endTime: format(endTime, "HH:mm"),
            reasoning: `Scheduled in available ${slot.duration}-minute slot on ${date}`,
          });

          usedSlots.add(slotKey);
          scheduled = true;
          break;
        }
      }
      if (scheduled) break;
    }

    if (!scheduled) {
      conflicts.push({
        taskId: task.id,
        reason: `No available ${task.duration}-minute slot found this week`,
        alternatives: ["Try reducing task duration", "Consider next week"],
      });
    }
  }

  return {
    schedule,
    conflicts,
    summary: "Schedule generated using available time slots. Some tasks may need rescheduling.",
  };
}

// Family scheduling types and functions
interface FamilyMemberData {
  userId: string;
  userName: string;
  calendarEvents: CalendarEvent[];
  tasks: Task[];
}

interface FamilyScheduleInput {
  familyMembers: FamilyMemberData[];
  familyTasks: Task[];
  weekStart?: Date;
}

export async function generateFamilySchedule(input: FamilyScheduleInput): Promise<AIScheduleResponse> {
  const { familyMembers, familyTasks, weekStart } = input;

  const now = new Date();
  const weekStartDate = weekStart || startOfWeek(now, { weekStartsOn: 1 });
  const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });

  // Find available slots for each family member for each day
  const memberAvailability: Record<string, Record<string, TimeSlot[]>> = {};

  for (const member of familyMembers) {
    memberAvailability[member.userId] = {};
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStartDate, i);
      const dayStr = format(day, "yyyy-MM-dd");
      memberAvailability[member.userId][dayStr] = findAvailableSlots(member.calendarEvents, day);
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
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the AI response (use first member's ID as default for personal tasks)
    return parseFamilyAIResponse(responseText, familyMembers);
  } catch (error) {
    console.error("AI family scheduling error:", error);
    // Fallback to simple scheduling
    return generateFamilyFallbackSchedule(allTasks, memberAvailability, familyMembers);
  }
}

function buildFamilySchedulingPrompt(params: {
  familyMembers: FamilyMemberData[];
  memberAvailability: Record<string, Record<string, TimeSlot[]>>;
  allTasks: Task[];
  familyTasks: Task[];
  weekStart: Date;
  weekEnd: Date;
}): string {
  const { familyMembers, memberAvailability, allTasks, familyTasks, weekStart, weekEnd } = params;

  // Helper to extract time string from CalendarEvent start/end
  const getTimeString = (time: CalendarEvent['start']): string | undefined => {
    if (typeof time === 'string') return time;
    if (time instanceof Date) return time.toISOString();
    return time.dateTime || time.date;
  };

  // Build member summaries
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

    // Helper to format day arrays
    const formatDays = (days: unknown[] | null): string | null => {
      if (!days || (days as unknown[]).length === 0) return null;
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return (days as unknown[]).map(d => {
        if (typeof d === 'string') return d.charAt(0).toUpperCase() + d.slice(1);
        if (typeof d === 'number') return dayNames[d];
        return String(d);
      }).join(", ");
    };

    const personalTasks = member.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      duration: t.duration,
      isFlexible: t.isFlexible,
      category: t.category,
      priority: t.priority,
      schedulingMode: t.schedulingMode,
      fixedDays: t.fixedDays ? formatDays(t.fixedDays as unknown[]) : null,
      fixedTime: t.fixedTime,
      requiredDays: t.requiredDays ? formatDays(t.requiredDays as unknown[]) : null,
      preferredDays: t.preferredDays ? formatDays(t.preferredDays as unknown[]) : null,
      frequency: t.frequency,
      frequencyPeriod: t.frequencyPeriod,
    }));

    return {
      userId: member.userId,
      name: member.userName,
      calendar: calendarSummary,
      availableSlots: slotsSummary,
      personalTasks,
    };
  });

  // Helper to format day arrays for shared tasks
  const formatDaysShared = (days: unknown[] | null): string | null => {
    if (!days || (days as unknown[]).length === 0) return null;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return (days as unknown[]).map(d => {
      if (typeof d === 'string') return d.charAt(0).toUpperCase() + d.slice(1);
      if (typeof d === 'number') return dayNames[d];
      return String(d);
    }).join(", ");
  };

  const sharedTasksSummary = familyTasks.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    duration: t.duration,
    isFlexible: t.isFlexible,
    category: t.category,
    priority: t.priority,
    schedulingMode: t.schedulingMode,
    fixedDays: t.fixedDays ? formatDaysShared(t.fixedDays as unknown[]) : null,
    fixedTime: t.fixedTime,
    requiredDays: t.requiredDays ? formatDaysShared(t.requiredDays as unknown[]) : null,
    preferredDays: t.preferredDays ? formatDaysShared(t.preferredDays as unknown[]) : null,
    frequency: t.frequency,
    frequencyPeriod: t.frequencyPeriod,
  }));

  return `You are ResolutionAI, an intelligent FAMILY scheduling assistant. Your job is to help a 2-person family achieve their goals and fairly distribute Life Admin tasks by analyzing BOTH calendars.

## Week to Schedule
From ${format(weekStart, "EEEE, MMMM d, yyyy")} to ${format(weekEnd, "EEEE, MMMM d, yyyy")}

## Family Members

${memberSummaries.map((m, i) => `
### Member ${i + 1}: ${m.name} (ID: ${m.userId})

**Calendar Events (blocked times):**
${JSON.stringify(m.calendar, null, 2)}

**Available Time Slots:**
${JSON.stringify(m.availableSlots, null, 2)}

**Personal Tasks (Focus Time):**
${JSON.stringify(m.personalTasks, null, 2)}
`).join("\n")}

## Shared Life Admin Tasks (to be fairly distributed)
${JSON.stringify(sharedTasksSummary, null, 2)}

## Priority Levels (1 = highest, 4 = lowest)
1. Work commitments (already blocked in calendar)
2. Non-flexible Life Admin tasks
3. Focus Time goals (gym, reading, learning, deep work, etc.)
4. Flexible Life Admin tasks

## IMPORTANT: Fair Distribution Rules
1. Life Admin tasks should be distributed FAIRLY between both family members
2. Consider who has more free time on each day
3. Assign tasks to the person who is AVAILABLE at that time
4. Personal Focus Time tasks go to the owner of that task
5. Calculate and report a fairness score (50/50 is ideal)

## Instructions
1. **CRITICAL: Respect scheduling constraints:**
   - Tasks with schedulingMode="fixed" MUST be scheduled on ALL of their fixedDays (e.g., if fixedDays="Monday, Tuesday, Wednesday, Thursday, Friday", create 5 separate schedule entries, one for each day)
   - Tasks with fixedTime MUST be scheduled at that exact time on each scheduled day
   - Tasks with requiredDays can ONLY be scheduled on those specific days
   - The frequency field indicates how many times per week to schedule - match this with the number of entries you create
   - Example: If fixedDays="Monday, Tuesday, Wednesday, Thursday, Friday" and frequency=5, create 5 entries (one for Mon, Tue, Wed, Thu, Fri)
2. First analyze BOTH calendars to understand each person's availability
3. Assign personal Focus Time tasks to their respective owners at optimal times
4. Distribute shared Life Admin tasks fairly based on availability
5. For each task, specify WHO it's assigned to (assignedToUserId)
6. Explain why each task was assigned to that person
7. If someone has a busy day, give more tasks to the other person that day

## Response Format
Return ONLY a valid JSON object with this structure:
{
  "schedule": [
    {
      "taskId": "task_id_here",
      "taskName": "Task name",
      "taskType": "resolution or household",
      "assignedToUserId": "user_id_of_assigned_person",
      "assignedToName": "Name of assigned person",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reasoning": "Explanation including WHY this person was chosen"
    }
  ],
  "conflicts": [
    {
      "taskId": "task_id",
      "reason": "Why it couldn't be scheduled",
      "alternatives": ["Alternative suggestion 1"]
    }
  ],
  "fairnessScore": 50,
  "fairnessExplanation": "Explanation of how tasks were distributed",
  "summary": "A brief encouraging summary mentioning both family members"
}

Be encouraging and celebrate teamwork! Help the family feel motivated to achieve their goals together!`;
}

function parseFamilyAIResponse(responseText: string, familyMembers: FamilyMemberData[]): AIScheduleResponse {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

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

    const fairnessInfo = parsed.fairnessScore
      ? `\n\nFairness Score: ${parsed.fairnessScore}%\n${parsed.fairnessExplanation || ""}`
      : "";

    return {
      schedule,
      conflicts: parsed.conflicts || [],
      fairnessScore: parsed.fairnessScore,
      summary: (parsed.summary || "Your family schedule has been generated!") + fairnessInfo,
    };
  } catch (error) {
    console.error("Error parsing family AI response:", error);
    throw new Error("Failed to parse AI response");
  }
}

function generateFamilyFallbackSchedule(
  tasks: Task[],
  memberAvailability: Record<string, Record<string, TimeSlot[]>>,
  familyMembers: FamilyMemberData[]
): AIScheduleResponse {
  const schedule: ScheduleRecommendation[] = [];
  const conflicts: AIScheduleResponse["conflicts"] = [];
  const usedSlots: Record<string, Set<string>> = {};

  // Initialize used slots tracking for each member
  for (const member of familyMembers) {
    usedSlots[member.userId] = new Set();
  }

  // Track task assignments for fairness
  const taskCounts: Record<string, number> = {};
  for (const member of familyMembers) {
    taskCounts[member.userId] = 0;
  }

  for (const task of tasks) {
    let scheduled = false;

    // Determine which member(s) can do this task
    let eligibleMembers = familyMembers;

    // If task belongs to a specific user, only they can do it
    if (task.userId) {
      eligibleMembers = familyMembers.filter(m => m.userId === task.userId);
    } else {
      // For shared tasks, prefer the person with fewer assignments
      eligibleMembers = [...familyMembers].sort(
        (a, b) => taskCounts[a.userId] - taskCounts[b.userId]
      );
    }

    for (const member of eligibleMembers) {
      if (scheduled) break;

      for (const [date, slots] of Object.entries(memberAvailability[member.userId])) {
        if (scheduled) break;

        for (const slot of slots) {
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
            taskCounts[member.userId]++;
            scheduled = true;
            break;
          }
        }
      }
    }

    if (!scheduled) {
      conflicts.push({
        taskId: task.id,
        reason: `No available ${task.duration}-minute slot found for any family member`,
        alternatives: ["Try reducing task duration", "Consider next week"],
      });
    }
  }

  return {
    schedule,
    conflicts,
    summary: "Family schedule generated. Tasks have been distributed based on availability.",
  };
}
