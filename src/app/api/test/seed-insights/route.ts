/**
 * Seed Test Data for Insights
 *
 * POST - Creates test tasks, scheduled tasks, and feedback
 * to demonstrate the pattern learning system
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { subDays, setHours, setMinutes } from "date-fns";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId parameter required" },
      { status: 400 }
    );
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { familyMember: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const familyId = user.familyMember?.familyId;
  if (!familyId) {
    return NextResponse.json(
      { error: "User must be part of a family" },
      { status: 400 }
    );
  }

  try {
    // Clear existing test data for this user (optional - comment out to keep adding)
    await prisma.feedback.deleteMany({
      where: { userId },
    });
    await prisma.scheduledTask.deleteMany({
      where: { assignedToUserId: userId },
    });
    await prisma.task.deleteMany({
      where: { userId },
    });

    const created = {
      tasks: 0,
      scheduledTasks: 0,
      feedback: 0,
    };

    // Define test patterns:
    // - Morning gym sessions (6-7 AM) - high completion, high energy
    // - Work tasks (9-10 AM) - high completion
    // - Afternoon reading (2-3 PM) - moderate completion
    // - Evening household (6-7 PM) - variable completion
    // - Late night tasks (9-10 PM) - low completion (too tired)

    const testData = [
      // === GYM TASKS - Morning pattern, high success ===
      {
        name: "Morning Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 6,
        scheduledMinute: 30,
        daysAgo: 1,
        status: "completed" as const,
        feedback: { actualDuration: 65, rating: 5, energy: "high", timeAccuracy: "just_right" },
      },
      {
        name: "Morning Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 7,
        scheduledMinute: 0,
        daysAgo: 2,
        status: "completed" as const,
        feedback: { actualDuration: 55, rating: 5, energy: "high", timeAccuracy: "just_right" },
      },
      {
        name: "Morning Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 6,
        scheduledMinute: 30,
        daysAgo: 3,
        status: "completed" as const,
        feedback: { actualDuration: 70, rating: 4, energy: "high", timeAccuracy: "too_short" },
      },
      {
        name: "Morning Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 7,
        scheduledMinute: 0,
        daysAgo: 4,
        status: "completed" as const,
        feedback: { actualDuration: 60, rating: 5, energy: "high", timeAccuracy: "just_right" },
      },
      {
        name: "Morning Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 6,
        scheduledMinute: 30,
        daysAgo: 5,
        status: "completed" as const,
        feedback: { actualDuration: 65, rating: 4, energy: "high", timeAccuracy: "just_right" },
      },
      // Evening gym - lower success rate
      {
        name: "Evening Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 19,
        scheduledMinute: 0,
        daysAgo: 2,
        status: "skipped" as const,
        feedback: null,
      },
      {
        name: "Evening Gym Session",
        type: "resolution",
        category: "Fitness",
        duration: 60,
        scheduledHour: 19,
        scheduledMinute: 30,
        daysAgo: 4,
        status: "skipped" as const,
        feedback: null,
      },

      // === READING TASKS - Afternoon pattern ===
      {
        name: "Read 30 minutes",
        type: "resolution",
        category: "Reading",
        duration: 30,
        scheduledHour: 14,
        scheduledMinute: 0,
        daysAgo: 1,
        status: "completed" as const,
        feedback: { actualDuration: 35, rating: 4, energy: "medium", timeAccuracy: "too_short" },
      },
      {
        name: "Read 30 minutes",
        type: "resolution",
        category: "Reading",
        duration: 30,
        scheduledHour: 14,
        scheduledMinute: 30,
        daysAgo: 2,
        status: "completed" as const,
        feedback: { actualDuration: 40, rating: 5, energy: "medium", timeAccuracy: "too_short" },
      },
      {
        name: "Read 30 minutes",
        type: "resolution",
        category: "Reading",
        duration: 30,
        scheduledHour: 15,
        scheduledMinute: 0,
        daysAgo: 3,
        status: "completed" as const,
        feedback: { actualDuration: 30, rating: 4, energy: "medium", timeAccuracy: "just_right" },
      },
      {
        name: "Read 30 minutes",
        type: "resolution",
        category: "Reading",
        duration: 30,
        scheduledHour: 21,
        scheduledMinute: 0,
        daysAgo: 4,
        status: "skipped" as const, // Too late, skipped
        feedback: null,
      },

      // === WORK/FOCUS TASKS - Morning pattern ===
      {
        name: "Deep work session",
        type: "resolution",
        category: "Work",
        duration: 90,
        scheduledHour: 9,
        scheduledMinute: 0,
        daysAgo: 1,
        status: "completed" as const,
        feedback: { actualDuration: 95, rating: 5, energy: "high", timeAccuracy: "just_right", trafficImpact: false },
      },
      {
        name: "Deep work session",
        type: "resolution",
        category: "Work",
        duration: 90,
        scheduledHour: 9,
        scheduledMinute: 30,
        daysAgo: 2,
        status: "completed" as const,
        feedback: { actualDuration: 100, rating: 4, energy: "high", timeAccuracy: "too_short", trafficImpact: false },
      },
      {
        name: "Deep work session",
        type: "resolution",
        category: "Work",
        duration: 90,
        scheduledHour: 10,
        scheduledMinute: 0,
        daysAgo: 3,
        status: "completed" as const,
        feedback: { actualDuration: 90, rating: 5, energy: "high", timeAccuracy: "just_right", trafficImpact: false },
      },
      {
        name: "Deep work session",
        type: "resolution",
        category: "Work",
        duration: 90,
        scheduledHour: 15,
        scheduledMinute: 0,
        daysAgo: 4,
        status: "completed" as const,
        feedback: { actualDuration: 75, rating: 3, energy: "low", timeAccuracy: "too_long", trafficImpact: false },
      },

      // === HOUSEHOLD TASKS - Evening, variable ===
      {
        name: "Kitchen cleanup",
        type: "household",
        category: "Cleaning",
        duration: 20,
        scheduledHour: 18,
        scheduledMinute: 30,
        daysAgo: 1,
        status: "completed" as const,
        feedback: { actualDuration: 25, rating: 4, energy: "medium", timeAccuracy: "too_short" },
      },
      {
        name: "Kitchen cleanup",
        type: "household",
        category: "Cleaning",
        duration: 20,
        scheduledHour: 18,
        scheduledMinute: 0,
        daysAgo: 2,
        status: "completed" as const,
        feedback: { actualDuration: 20, rating: 4, energy: "medium", timeAccuracy: "just_right" },
      },
      {
        name: "Laundry",
        type: "household",
        category: "Cleaning",
        duration: 30,
        scheduledHour: 19,
        scheduledMinute: 0,
        daysAgo: 3,
        status: "completed" as const,
        feedback: { actualDuration: 35, rating: 3, energy: "low", timeAccuracy: "too_short" },
      },
      {
        name: "Grocery shopping",
        type: "household",
        category: "Errands",
        duration: 45,
        scheduledHour: 11,
        scheduledMinute: 0,
        daysAgo: 2,
        status: "completed" as const,
        feedback: { actualDuration: 60, rating: 3, energy: "medium", timeAccuracy: "too_short", trafficImpact: true },
      },

      // === MEDITATION - Morning success ===
      {
        name: "Morning meditation",
        type: "resolution",
        category: "Wellness",
        duration: 15,
        scheduledHour: 6,
        scheduledMinute: 0,
        daysAgo: 1,
        status: "completed" as const,
        feedback: { actualDuration: 15, rating: 5, energy: "high", timeAccuracy: "just_right" },
      },
      {
        name: "Morning meditation",
        type: "resolution",
        category: "Wellness",
        duration: 15,
        scheduledHour: 6,
        scheduledMinute: 0,
        daysAgo: 2,
        status: "completed" as const,
        feedback: { actualDuration: 20, rating: 5, energy: "high", timeAccuracy: "too_short" },
      },
      {
        name: "Morning meditation",
        type: "resolution",
        category: "Wellness",
        duration: 15,
        scheduledHour: 6,
        scheduledMinute: 0,
        daysAgo: 3,
        status: "completed" as const,
        feedback: { actualDuration: 15, rating: 4, energy: "high", timeAccuracy: "just_right" },
      },

      // === LATE NIGHT TASKS - Low completion ===
      {
        name: "Review goals",
        type: "resolution",
        category: "Planning",
        duration: 15,
        scheduledHour: 22,
        scheduledMinute: 0,
        daysAgo: 1,
        status: "skipped" as const,
        feedback: null,
      },
      {
        name: "Review goals",
        type: "resolution",
        category: "Planning",
        duration: 15,
        scheduledHour: 22,
        scheduledMinute: 0,
        daysAgo: 2,
        status: "skipped" as const,
        feedback: null,
      },
      {
        name: "Review goals",
        type: "resolution",
        category: "Planning",
        duration: 15,
        scheduledHour: 21,
        scheduledMinute: 30,
        daysAgo: 3,
        status: "completed" as const,
        feedback: { actualDuration: 10, rating: 2, energy: "low", timeAccuracy: "too_long" },
      },
    ];

    // Create tasks, scheduled tasks, and feedback
    for (const item of testData) {
      // Create task
      const task = await prisma.task.create({
        data: {
          name: item.name,
          type: item.type,
          category: item.category,
          duration: item.duration,
          priority: 3,
          isFlexible: true,
          userId: userId,
          familyId: familyId,
        },
      });
      created.tasks++;

      // Create scheduled task
      const scheduledDate = subDays(new Date(), item.daysAgo);
      const startTime = setMinutes(setHours(scheduledDate, item.scheduledHour), item.scheduledMinute);
      const endTime = new Date(startTime.getTime() + item.duration * 60 * 1000);

      const scheduledTask = await prisma.scheduledTask.create({
        data: {
          taskId: task.id,
          assignedToUserId: userId,
          scheduledDate: scheduledDate,
          startTime,
          endTime,
          status: item.status,
          aiReasoning: `Test data: ${item.name} scheduled for ${item.scheduledHour}:${item.scheduledMinute.toString().padStart(2, "0")}`,
        },
      });
      created.scheduledTasks++;

      // Create feedback if task was completed
      if (item.feedback && item.status === "completed") {
        await prisma.feedback.create({
          data: {
            scheduledTaskId: scheduledTask.id,
            userId: userId,
            actualDuration: item.feedback.actualDuration,
            timeAccuracy: item.feedback.timeAccuracy,
            timeSlotRating: item.feedback.rating,
            energyLevel: item.feedback.energy,
            trafficImpact: item.feedback.trafficImpact ?? null,
            weatherImpact: null,
            wouldReschedule: null,
            preferredTime: null,
            notes: null,
          },
        });
        created.feedback++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Test data created successfully",
      userId,
      created,
      patterns: {
        description: "Created data with these patterns:",
        morningGym: "6:30-7:00 AM - 100% completion, high energy",
        eveningGym: "7:00-7:30 PM - 0% completion (always skipped)",
        reading: "2:00-3:00 PM - 75% completion, medium energy",
        deepWork: "9:00-10:00 AM - 100% completion, high energy",
        household: "6:00-7:00 PM - 100% completion",
        meditation: "6:00 AM - 100% completion, high energy",
        lateNight: "9:30-10:00 PM - 33% completion, low energy",
      },
      nextStep: "Now run: curl 'http://localhost:3000/api/test/insights?userId=" + userId + "'",
    });
  } catch (error) {
    console.error("[Seed Insights] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to seed data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET shows usage info
export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint with a userId to seed test data",
    usage: "curl -X POST 'http://localhost:3000/api/test/seed-insights?userId=<user_id>'",
    warning: "This will DELETE existing tasks for the user and create new test data",
  });
}
