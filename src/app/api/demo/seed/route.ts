import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { startOfWeek, addDays, setHours, setMinutes } from "date-fns";

export const dynamic = "force-dynamic";

// Demo seed endpoint - resets and seeds demo data for Bharath and Sanjana
// POST /api/demo/seed
// Requires DEMO_SEED_SECRET header in production

const BHARATH_EMAIL = "bharath@kashyap.com"; // Update if different
const SANJANA_EMAIL = "sanjana@kashyap.com"; // Update if different
const FAMILY_NAME = "Kashyaps";

export async function POST(request: NextRequest) {
  try {
    // Security check in production
    if (process.env.NODE_ENV === "production") {
      const authHeader = request.headers.get("x-demo-seed-key");
      if (authHeader !== process.env.DEMO_SEED_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Find users by name (more flexible than email)
    const bharath = await prisma.user.findFirst({
      where: { name: { contains: "Bharath", mode: "insensitive" } },
    });

    const sanjana = await prisma.user.findFirst({
      where: { name: { contains: "Sanjana", mode: "insensitive" } },
    });

    if (!bharath || !sanjana) {
      // Try by email as fallback
      const bharathByEmail = await prisma.user.findUnique({ where: { email: BHARATH_EMAIL } });
      const sanjanaByEmail = await prisma.user.findUnique({ where: { email: SANJANA_EMAIL } });

      if (!bharathByEmail && !sanjanaByEmail) {
        return NextResponse.json(
          {
            error: "Users not found. Please ensure Bharath and Sanjana accounts exist.",
            hint: "Looking for names containing 'Bharath' and 'Sanjana'"
          },
          { status: 404 }
        );
      }
    }

    const bharathId = bharath?.id;
    const sanjanaId = sanjana?.id;

    if (!bharathId || !sanjanaId) {
      return NextResponse.json(
        { error: "Both Bharath and Sanjana accounts are required" },
        { status: 404 }
      );
    }

    // Find or verify family
    const familyMembership = await prisma.familyMember.findUnique({
      where: { userId: bharathId },
      include: { family: true },
    });

    let familyId = familyMembership?.familyId;

    // If no family, create one
    if (!familyId) {
      const family = await prisma.family.create({
        data: {
          name: FAMILY_NAME,
          inviteCode: "DEMO" + Math.random().toString(36).substring(2, 6).toUpperCase(),
          members: {
            create: [
              { userId: bharathId, role: "admin" },
              { userId: sanjanaId, role: "member" },
            ],
          },
        },
      });
      familyId = family.id;
    } else {
      // Ensure Sanjana is also in the family
      const sanjanaMembership = await prisma.familyMember.findUnique({
        where: { userId: sanjanaId },
      });
      if (!sanjanaMembership) {
        await prisma.familyMember.create({
          data: { familyId, userId: sanjanaId, role: "member" },
        });
      }
    }

    // ============================================
    // STEP 1: DELETE EXISTING DATA
    // ============================================

    console.log("🗑️ Deleting existing data...");

    // Delete in correct order (respecting foreign keys)
    await prisma.preferenceEvidence.deleteMany({
      where: { scheduledTask: { assignedToUserId: { in: [bharathId, sanjanaId] } } },
    });

    await prisma.feedback.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.scheduleOverlap.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.scheduleConflict.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.scheduledTask.deleteMany({
      where: { assignedToUserId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.taskReassignmentLog.deleteMany({
      where: { OR: [{ fromUserId: { in: [bharathId, sanjanaId] } }, { toUserId: { in: [bharathId, sanjanaId] } }] },
    });

    await prisma.aIRecommendation.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.task.deleteMany({
      where: { OR: [{ userId: { in: [bharathId, sanjanaId] } }, { familyId }] },
    });

    await prisma.userWorkSchedule.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.userVacation.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.learningData.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.userPreference.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.progressTracking.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.notification.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.onboardingProgress.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.weeklyPlanApproval.deleteMany({
      where: { userId: { in: [bharathId, sanjanaId] } },
    });

    await prisma.weeklyPlanItem.deleteMany({
      where: { weeklyPlan: { familyId } },
    });

    await prisma.weeklyPlan.deleteMany({
      where: { familyId },
    });

    await prisma.agentMemory.deleteMany({
      where: { familyId },
    });

    console.log("✅ Existing data deleted");

    // ============================================
    // STEP 2: UPDATE USER SETTINGS
    // ============================================

    console.log("⚙️ Updating user settings...");

    await prisma.user.update({
      where: { id: bharathId },
      data: {
        availableTimeStart: 6,
        availableTimeEnd: 23,
        bufferMinutes: 15,
        country: "UK",
      },
    });

    await prisma.user.update({
      where: { id: sanjanaId },
      data: {
        availableTimeStart: 6,
        availableTimeEnd: 22,
        bufferMinutes: 15,
        country: "UK",
      },
    });

    console.log("✅ User settings updated");

    // ============================================
    // STEP 3: CREATE WORK SCHEDULES
    // ============================================

    console.log("📅 Creating work schedules...");

    // Bharath's work schedule
    const bharathSchedule = [
      { dayOfWeek: "monday", isWorking: true, startTime: "09:00", endTime: "17:30", location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "tuesday", isWorking: true, startTime: "09:00", endTime: "17:30", location: "office", commuteToMin: 45, commuteFromMin: 45 },
      { dayOfWeek: "wednesday", isWorking: true, startTime: "09:00", endTime: "17:30", location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "thursday", isWorking: true, startTime: "09:00", endTime: "17:30", location: "office", commuteToMin: 45, commuteFromMin: 45 },
      { dayOfWeek: "friday", isWorking: true, startTime: "09:00", endTime: "17:30", location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "saturday", isWorking: false, startTime: null, endTime: null, location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "sunday", isWorking: false, startTime: null, endTime: null, location: "home", commuteToMin: null, commuteFromMin: null },
    ];

    // Sanjana's work schedule
    const sanjanaSchedule = [
      { dayOfWeek: "monday", isWorking: true, startTime: "08:30", endTime: "17:00", location: "office", commuteToMin: 30, commuteFromMin: 30 },
      { dayOfWeek: "tuesday", isWorking: true, startTime: "08:30", endTime: "17:00", location: "office", commuteToMin: 30, commuteFromMin: 30 },
      { dayOfWeek: "wednesday", isWorking: true, startTime: "08:30", endTime: "17:00", location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "thursday", isWorking: true, startTime: "08:30", endTime: "17:00", location: "office", commuteToMin: 30, commuteFromMin: 30 },
      { dayOfWeek: "friday", isWorking: true, startTime: "08:30", endTime: "16:00", location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "saturday", isWorking: false, startTime: null, endTime: null, location: "home", commuteToMin: null, commuteFromMin: null },
      { dayOfWeek: "sunday", isWorking: false, startTime: null, endTime: null, location: "home", commuteToMin: null, commuteFromMin: null },
    ];

    for (const schedule of bharathSchedule) {
      await prisma.userWorkSchedule.create({
        data: { userId: bharathId, ...schedule },
      });
    }

    for (const schedule of sanjanaSchedule) {
      await prisma.userWorkSchedule.create({
        data: { userId: sanjanaId, ...schedule },
      });
    }

    console.log("✅ Work schedules created");

    // ============================================
    // STEP 4: CREATE TASKS
    // ============================================

    console.log("📝 Creating tasks...");

    // Bharath's Focus Tasks (Resolution)
    const morningRun = await prisma.task.create({
      data: {
        userId: bharathId,
        name: "Morning Run",
        type: "resolution",
        duration: 45,
        schedulingMode: "fixed",
        fixedDays: ["monday", "wednesday", "friday", "saturday"],
        fixedTime: "07:00",
        frequency: 4,
        frequencyPeriod: "week",
        priority: 1,
      },
    });

    const meditation = await prisma.task.create({
      data: {
        userId: bharathId,
        name: "Meditation",
        type: "resolution",
        duration: 15,
        schedulingMode: "fixed",
        fixedDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        fixedTime: "06:15",
        frequency: 7,
        frequencyPeriod: "week",
        priority: 1,
      },
    });

    const reading = await prisma.task.create({
      data: {
        userId: bharathId,
        name: "Read for 30 mins",
        type: "resolution",
        duration: 30,
        schedulingMode: "flexible",
        frequency: 3,
        frequencyPeriod: "week",
        preferredTimeStart: "19:00",
        preferredTimeEnd: "21:00",
        priority: 2,
      },
    });

    // Sanjana's Focus Tasks (Resolution)
    const yoga = await prisma.task.create({
      data: {
        userId: sanjanaId,
        name: "Yoga",
        type: "resolution",
        duration: 45,
        schedulingMode: "fixed",
        fixedDays: ["tuesday", "thursday", "saturday"],
        fixedTime: "06:30",
        frequency: 3,
        frequencyPeriod: "week",
        priority: 1,
      },
    });

    const learnSpanish = await prisma.task.create({
      data: {
        userId: sanjanaId,
        name: "Learn Spanish",
        type: "resolution",
        duration: 20,
        schedulingMode: "flexible",
        frequency: 3,
        frequencyPeriod: "week",
        priority: 2,
      },
    });

    // Family Life Admin Tasks (Household)
    // Note: Include userId so tasks appear in the user's task list
    const groceryShopping = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "Grocery Shopping",
        type: "household",
        duration: 60,
        schedulingMode: "flexible",
        frequency: 1,
        frequencyPeriod: "week",
        priority: 2,
      },
    });

    const mealPrep = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "Meal Prep",
        type: "household",
        duration: 90,
        schedulingMode: "fixed",
        fixedDays: ["sunday"],
        fixedTime: "14:00",
        frequency: 1,
        frequencyPeriod: "week",
        priority: 2,
        defaultAssigneeId: bharathId,
      },
    });

    const laundry = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "Laundry",
        type: "household",
        duration: 30,
        schedulingMode: "flexible",
        frequency: 2,
        frequencyPeriod: "week",
        priority: 3,
      },
    });

    const schoolPickup = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "School Pickup",
        type: "household",
        duration: 60,
        schedulingMode: "fixed",
        fixedDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        fixedTime: "15:00",
        frequency: 5,
        frequencyPeriod: "week",
        priority: 1,
      },
    });

    const pharmacyRun = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "Pharmacy Run",
        type: "household",
        duration: 20,
        schedulingMode: "flexible",
        frequency: 1,
        frequencyPeriod: "week",
        priority: 3,
        defaultAssigneeId: sanjanaId,
      },
    });

    const carService = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "Car Service Booking",
        type: "household",
        duration: 15,
        schedulingMode: "flexible",
        frequency: 1,
        frequencyPeriod: "week",
        priority: 3,
        defaultAssigneeId: sanjanaId,
      },
    });

    const payBills = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "Pay Bills",
        type: "household",
        duration: 15,
        schedulingMode: "flexible",
        frequency: 1,
        frequencyPeriod: "week",
        priority: 2,
        defaultAssigneeId: bharathId,
      },
    });

    const schoolForms = await prisma.task.create({
      data: {
        userId: bharathId,
        familyId,
        name: "School Forms",
        type: "household",
        duration: 10,
        schedulingMode: "flexible",
        frequency: 1,
        frequencyPeriod: "week",
        priority: 2,
      },
    });

    console.log("✅ Tasks created");

    // ============================================
    // STEP 5: CREATE "MESSY" PRE-SCHEDULED TASKS
    // ============================================

    console.log("🔀 Creating messy pre-scheduled tasks...");

    // Get demo week dates (Feb 9-15, 2026)
    // Use fixed date for consistent demo recording
    const weekStart = new Date(2026, 1, 9); // February 9, 2026 (Monday)

    const getDateForDay = (dayOffset: number, hour: number, minute: number = 0) => {
      const date = addDays(weekStart, dayOffset);
      return setMinutes(setHours(date, hour), minute);
    };

    // Helper to create scheduled task
    const createScheduledTask = async (
      taskId: string,
      assignedToUserId: string,
      dayOffset: number,
      startHour: number,
      startMinute: number,
      durationMinutes: number
    ) => {
      const startTime = getDateForDay(dayOffset, startHour, startMinute);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
      const scheduledDate = setHours(setMinutes(addDays(weekStart, dayOffset), 0), 0);

      return prisma.scheduledTask.create({
        data: {
          taskId,
          assignedToUserId,
          scheduledDate,
          startTime,
          endTime,
          status: "pending",
          aiReasoning: "Demo seed - pre-scheduled in suboptimal slot",
        },
      });
    };

    // BAD SLOT 1: Grocery Shopping during Bharath's Tuesday commute home (17:30)
    await createScheduledTask(groceryShopping.id, bharathId, 1, 17, 30, 60);

    // BAD SLOT 2: Morning Run at noon on Wednesday (should be 7 AM)
    await createScheduledTask(morningRun.id, bharathId, 2, 12, 0, 45);

    // BAD SLOT 3: Laundry during Sanjana's Thursday morning commute (08:00)
    await createScheduledTask(laundry.id, sanjanaId, 3, 8, 0, 30);

    // BAD SLOT 4: School Pickup assigned to Bharath on Monday (he's WFH but Sanjana is at office - fair?)
    await createScheduledTask(schoolPickup.id, bharathId, 0, 15, 0, 60);

    // BAD SLOT 5: School Pickup assigned to Bharath on Tuesday (he's at OFFICE - impossible!)
    await createScheduledTask(schoolPickup.id, bharathId, 1, 15, 0, 60);

    // BAD SLOT 6: Learn Spanish during Sanjana's Monday work hours (09:00)
    await createScheduledTask(learnSpanish.id, sanjanaId, 0, 9, 0, 20);

    console.log("✅ Messy pre-scheduled tasks created");

    // ============================================
    // STEP 6: CREATE HISTORICAL DATA (Past 3 weeks)
    // ============================================

    console.log("📊 Creating historical data for dashboard stats...");

    // Helper to create a completed/skipped scheduled task in the past
    const createHistoricalTask = async (
      taskId: string,
      assignedToUserId: string,
      date: Date,
      startHour: number,
      durationMinutes: number,
      status: "completed" | "skipped"
    ) => {
      const startTime = setMinutes(setHours(date, startHour), 0);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
      const scheduledDate = setHours(setMinutes(date, 0), 0);

      return prisma.scheduledTask.create({
        data: {
          taskId,
          assignedToUserId,
          scheduledDate,
          startTime,
          endTime,
          status,
          learningEnabled: true,
          outcomeRecordedAt: endTime,
        },
      });
    };

    // Week 1: Jan 26 - Feb 1 (65% completion)
    // Week 2: Feb 2-8 (78% completion)
    // We want streak of 6-7 days, so ensure Feb 3-8 all have completions

    const historicalTasks: { taskId: string; name: string; days: number[]; hour: number; duration: number }[] = [
      { taskId: morningRun.id, name: "Morning Run", days: [1, 3, 5], hour: 7, duration: 45 }, // Mon, Wed, Fri
      { taskId: meditation.id, name: "Meditation", days: [0, 1, 2, 3, 4, 5, 6], hour: 6, duration: 15 }, // Daily
      { taskId: reading.id, name: "Reading", days: [1, 3, 5], hour: 20, duration: 30 }, // Mon, Wed, Fri evenings
      { taskId: groceryShopping.id, name: "Groceries", days: [1], hour: 18, duration: 60 }, // Monday
      { taskId: laundry.id, name: "Laundry", days: [2, 5], hour: 19, duration: 30 }, // Tue, Fri
    ];

    let historicalCreated = 0;
    let historicalCompleted = 0;

    // Week 1: Jan 26 - Feb 1 (2 weeks before demo week) - 65% completion
    const week1Start = new Date(2026, 0, 26); // Jan 26, 2026
    for (const task of historicalTasks) {
      for (const dayOffset of task.days) {
        const taskDate = addDays(week1Start, dayOffset);
        // 65% completion rate for week 1
        const shouldComplete = Math.random() < 0.65;
        await createHistoricalTask(
          task.taskId,
          bharathId,
          taskDate,
          task.hour,
          task.duration,
          shouldComplete ? "completed" : "skipped"
        );
        historicalCreated++;
        if (shouldComplete) historicalCompleted++;
      }
    }

    // Week 2: Feb 2-8 (1 week before demo week) - 85% completion
    // Ensure ALL days Feb 3-8 have at least one completion for streak
    const week2Start = new Date(2026, 1, 2); // Feb 2, 2026
    for (const task of historicalTasks) {
      for (const dayOffset of task.days) {
        const taskDate = addDays(week2Start, dayOffset);
        // 85% completion rate for week 2 (but guarantee meditation completes for streak)
        const shouldComplete = task.taskId === meditation.id ? true : Math.random() < 0.85;
        await createHistoricalTask(
          task.taskId,
          bharathId,
          taskDate,
          task.hour,
          task.duration,
          shouldComplete ? "completed" : "skipped"
        );
        historicalCreated++;
        if (shouldComplete) historicalCompleted++;
      }
    }

    console.log(`✅ Historical tasks created: ${historicalCreated} (${historicalCompleted} completed)`);

    // ============================================
    // STEP 7: CREATE USER PREFERENCES (AI Learning)
    // ============================================

    console.log("🧠 Creating AI learned preferences...");

    const preferences = [
      {
        key: "preferred_exercise_time",
        value: { timeRange: "06:00-08:00", label: "Early Morning" },
        confidence: 0.85,
        source: "inferred",
      },
      {
        key: "energy_pattern",
        value: { pattern: "morning_person", peakHours: [6, 7, 8, 9] },
        confidence: 0.78,
        source: "inferred",
      },
      {
        key: "preferred_reading_time",
        value: { timeRange: "19:00-21:00", label: "Evening" },
        confidence: 0.72,
        source: "inferred",
      },
      {
        key: "preferred_admin_days",
        value: { days: ["monday", "wednesday"], reason: "WFH days" },
        confidence: 0.68,
        source: "inferred",
      },
      {
        key: "task_completion_pattern",
        value: { bestDays: ["tuesday", "wednesday"], worstDay: "friday" },
        confidence: 0.62,
        source: "inferred",
      },
    ];

    for (const pref of preferences) {
      await prisma.userPreference.create({
        data: {
          userId: bharathId,
          key: pref.key,
          value: pref.value,
          confidence: pref.confidence,
          source: pref.source,
          isActive: true,
        },
      });
    }

    console.log(`✅ AI preferences created: ${preferences.length}`);

    // ============================================
    // STEP 8: CREATE FEEDBACK ENTRIES
    // ============================================

    console.log("💬 Creating feedback entries...");

    // Get some of the historical scheduled tasks to add feedback
    const recentCompletedTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: bharathId,
        status: "completed",
      },
      take: 12,
      orderBy: { scheduledDate: "desc" },
    });

    const feedbackTemplates = [
      { timeAccuracy: "just_right", timeSlotRating: 5, wouldReschedule: "no", energyLevel: "high" },
      { timeAccuracy: "just_right", timeSlotRating: 4, wouldReschedule: "no", energyLevel: "medium" },
      { timeAccuracy: "too_short", timeSlotRating: 4, wouldReschedule: "no", energyLevel: "high" },
      { timeAccuracy: "just_right", timeSlotRating: 5, wouldReschedule: "no", energyLevel: "high" },
      { timeAccuracy: "just_right", timeSlotRating: 3, wouldReschedule: "earlier", energyLevel: "medium" },
      { timeAccuracy: "too_long", timeSlotRating: 4, wouldReschedule: "no", energyLevel: "medium" },
    ];

    let feedbackCreated = 0;
    for (let i = 0; i < Math.min(recentCompletedTasks.length, 12); i++) {
      const task = recentCompletedTasks[i];
      const template = feedbackTemplates[i % feedbackTemplates.length];

      await prisma.feedback.create({
        data: {
          scheduledTaskId: task.id,
          userId: bharathId,
          timeAccuracy: template.timeAccuracy,
          timeSlotRating: template.timeSlotRating,
          wouldReschedule: template.wouldReschedule,
          energyLevel: template.energyLevel,
        },
      });
      feedbackCreated++;
    }

    console.log(`✅ Feedback entries created: ${feedbackCreated}`);

    // ============================================
    // STEP 9: CREATE PROGRESS TRACKING
    // ============================================

    console.log("📈 Creating progress tracking...");

    // Week 1 progress
    await prisma.progressTracking.create({
      data: {
        userId: bharathId,
        weekStartDate: new Date(2026, 0, 26),
        taskType: "resolution",
        completedCount: 12,
        totalCount: 18,
      },
    });

    await prisma.progressTracking.create({
      data: {
        userId: bharathId,
        weekStartDate: new Date(2026, 0, 26),
        taskType: "household",
        completedCount: 5,
        totalCount: 8,
      },
    });

    // Week 2 progress
    await prisma.progressTracking.create({
      data: {
        userId: bharathId,
        weekStartDate: new Date(2026, 1, 2),
        taskType: "resolution",
        completedCount: 16,
        totalCount: 18,
      },
    });

    await prisma.progressTracking.create({
      data: {
        userId: bharathId,
        weekStartDate: new Date(2026, 1, 2),
        taskType: "household",
        completedCount: 7,
        totalCount: 8,
      },
    });

    console.log("✅ Progress tracking created");

    // ============================================
    // STEP 10: MARK ONBOARDING COMPLETE
    // ============================================

    console.log("✨ Marking onboarding complete...");

    await prisma.onboardingProgress.upsert({
      where: { userId: bharathId },
      update: {
        calendarConnected: true,
        firstTaskCreated: true,
        firstScheduleGenerated: true,
        firstFeedbackGiven: true,
        completedAt: new Date(),
        currentStep: 4,
      },
      create: {
        userId: bharathId,
        calendarConnected: true,
        firstTaskCreated: true,
        firstScheduleGenerated: true,
        firstFeedbackGiven: true,
        completedAt: new Date(),
        currentStep: 4,
      },
    });

    await prisma.onboardingProgress.upsert({
      where: { userId: sanjanaId },
      update: {
        calendarConnected: true,
        firstTaskCreated: true,
        firstScheduleGenerated: true,
        firstFeedbackGiven: true,
        completedAt: new Date(),
        currentStep: 4,
      },
      create: {
        userId: sanjanaId,
        calendarConnected: true,
        firstTaskCreated: true,
        firstScheduleGenerated: true,
        firstFeedbackGiven: true,
        completedAt: new Date(),
        currentStep: 4,
      },
    });

    console.log("✅ Onboarding marked complete");

    // ============================================
    // DONE
    // ============================================

    return NextResponse.json({
      success: true,
      message: "Demo data seeded successfully!",
      summary: {
        users: {
          bharath: { id: bharathId, name: bharath?.name },
          sanjana: { id: sanjanaId, name: sanjana?.name },
        },
        family: { id: familyId, name: FAMILY_NAME },
        tasksCreated: {
          bharathFocus: 3,
          sanjanaFocus: 2,
          familyLifeAdmin: 8,
          total: 13,
        },
        messyScheduledTasks: 6,
        historicalData: {
          scheduledTasks: historicalCreated,
          completedTasks: historicalCompleted,
          completionRate: Math.round((historicalCompleted / historicalCreated) * 100) + "%",
          feedbackEntries: feedbackCreated,
          aiPreferences: preferences.length,
          weeksOfHistory: 2,
        },
        weekStart: weekStart.toISOString(),
      },
      nextSteps: [
        "1. Open http://localhost:3000 to see dashboard stats",
        "2. Check streak, completion rate, and AI learning",
        "3. Go to /schedule to see messy calendar",
        "4. Click 'Optimize My Week' for transformation",
        "5. Record your demo!",
      ],
    });
  } catch (error) {
    console.error("Error seeding demo data:", error);
    return NextResponse.json(
      {
        error: "Failed to seed demo data",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check current state
export async function GET() {
  try {
    const bharath = await prisma.user.findFirst({
      where: { name: { contains: "Bharath", mode: "insensitive" } },
      include: {
        tasks: { select: { id: true, name: true, type: true } },
        scheduledTasks: { select: { id: true, status: true, scheduledDate: true } },
        workSchedule: true,
      },
    });

    const sanjana = await prisma.user.findFirst({
      where: { name: { contains: "Sanjana", mode: "insensitive" } },
      include: {
        tasks: { select: { id: true, name: true, type: true } },
        scheduledTasks: { select: { id: true, status: true, scheduledDate: true } },
        workSchedule: true,
      },
    });

    return NextResponse.json({
      status: "Demo seed endpoint ready",
      currentState: {
        bharath: bharath ? {
          id: bharath.id,
          name: bharath.name,
          tasks: bharath.tasks.length,
          scheduledTasks: bharath.scheduledTasks.length,
          workScheduleDays: bharath.workSchedule.length,
        } : null,
        sanjana: sanjana ? {
          id: sanjana.id,
          name: sanjana.name,
          tasks: sanjana.tasks.length,
          scheduledTasks: sanjana.scheduledTasks.length,
          workScheduleDays: sanjana.workSchedule.length,
        } : null,
      },
      usage: {
        seed: "POST /api/demo/seed",
        check: "GET /api/demo/seed",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to check state", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
