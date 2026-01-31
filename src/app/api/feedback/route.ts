import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  scheduledTaskId: z.string(),
  actualDuration: z.number().optional(),
  timeAccuracy: z.enum(["too_short", "just_right", "too_long"]).optional(),
  timeSlotRating: z.number().min(1).max(5).optional(),
  wouldReschedule: z.enum(["earlier", "later", "different_day", "no"]).optional(),
  preferredTime: z.enum(["morning", "afternoon", "evening", "weekend"]).optional(),
  trafficImpact: z.boolean().optional(),
  weatherImpact: z.boolean().optional(),
  energyLevel: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().optional(),
});

// POST - Submit feedback for a completed task
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = feedbackSchema.parse(body);

    // Verify the scheduled task exists and belongs to the user
    const scheduledTask = await prisma.scheduledTask.findUnique({
      where: { id: data.scheduledTaskId },
      include: { task: true },
    });

    if (!scheduledTask) {
      return NextResponse.json({ error: "Scheduled task not found" }, { status: 404 });
    }

    if (scheduledTask.assignedToUserId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check if feedback already exists for this task
    const existingFeedback = await prisma.feedback.findFirst({
      where: {
        scheduledTaskId: data.scheduledTaskId,
        userId: session.user.id,
      },
    });

    let feedback;
    if (existingFeedback) {
      // Update existing feedback
      feedback = await prisma.feedback.update({
        where: { id: existingFeedback.id },
        data: {
          actualDuration: data.actualDuration,
          timeAccuracy: data.timeAccuracy,
          timeSlotRating: data.timeSlotRating,
          wouldReschedule: data.wouldReschedule,
          preferredTime: data.preferredTime,
          trafficImpact: data.trafficImpact,
          weatherImpact: data.weatherImpact,
          energyLevel: data.energyLevel,
          notes: data.notes,
        },
      });
    } else {
      // Create new feedback
      feedback = await prisma.feedback.create({
        data: {
          scheduledTaskId: data.scheduledTaskId,
          userId: session.user.id,
          actualDuration: data.actualDuration,
          timeAccuracy: data.timeAccuracy,
          timeSlotRating: data.timeSlotRating,
          wouldReschedule: data.wouldReschedule,
          preferredTime: data.preferredTime,
          trafficImpact: data.trafficImpact,
          weatherImpact: data.weatherImpact,
          energyLevel: data.energyLevel,
          notes: data.notes,
        },
      });
    }

    // Update user preferences based on feedback (simple learning)
    await updateUserPreferences(session.user.id, scheduledTask, data);

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Error submitting feedback:", error);
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}

// GET - Get feedback for a specific scheduled task
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scheduledTaskId = searchParams.get("scheduledTaskId");

    if (!scheduledTaskId) {
      return NextResponse.json({ error: "scheduledTaskId is required" }, { status: 400 });
    }

    const feedback = await prisma.feedback.findFirst({
      where: {
        scheduledTaskId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}

// Helper function to update user preferences based on feedback
async function updateUserPreferences(
  userId: string,
  scheduledTask: { task: { type: string; category: string | null }; startTime: Date },
  feedback: z.infer<typeof feedbackSchema>
) {
  const taskType = scheduledTask.task.type;
  const category = scheduledTask.task.category;
  const hour = scheduledTask.startTime.getHours();

  // Update time preference if user indicated they'd reschedule
  if (feedback.preferredTime) {
    const prefKey = `preferred_time_${taskType}${category ? `_${category}` : ""}`;
    await upsertPreference(userId, prefKey, { time: feedback.preferredTime }, 0.6);
  }

  // Update duration preference if actual duration was provided
  if (feedback.actualDuration && feedback.timeAccuracy) {
    const durationKey = `duration_adjustment_${taskType}${category ? `_${category}` : ""}`;
    const existingPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: durationKey } },
    });

    let adjustment = 0;
    if (feedback.timeAccuracy === "too_short") {
      adjustment = feedback.actualDuration; // Use actual as new baseline
    } else if (feedback.timeAccuracy === "too_long") {
      adjustment = -10; // Reduce by 10 minutes
    }

    const currentValue = existingPref?.value as { adjustment?: number } | null;
    const newAdjustment = ((currentValue?.adjustment || 0) + adjustment) / 2; // Running average

    await upsertPreference(userId, durationKey, { adjustment: newAdjustment }, 0.7);
  }

  // Track time slot preferences
  if (feedback.timeSlotRating && feedback.timeSlotRating >= 4) {
    const timeSlotKey = `good_time_slot_${taskType}`;
    const existingPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: timeSlotKey } },
    });

    const currentValue = existingPref?.value as { hours?: number[] } | null;
    const hours = currentValue?.hours || [];
    if (!hours.includes(hour)) {
      hours.push(hour);
    }

    await upsertPreference(userId, timeSlotKey, { hours: hours.slice(-5) }, 0.65); // Keep last 5
  }

  // Track context impacts
  if (feedback.trafficImpact === true) {
    const trafficKey = `traffic_sensitive_${taskType}${category ? `_${category}` : ""}`;
    await upsertPreference(userId, trafficKey, { sensitive: true }, 0.8);
  }

  if (feedback.weatherImpact === true) {
    const weatherKey = `weather_sensitive_${taskType}${category ? `_${category}` : ""}`;
    await upsertPreference(userId, weatherKey, { sensitive: true }, 0.8);
  }
}

async function upsertPreference(
  userId: string,
  key: string,
  value: Record<string, unknown>,
  confidence: number
) {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    update: {
      value: value as object,
      confidence,
      source: "inferred",
    },
    create: {
      userId,
      key,
      value: value as object,
      confidence,
      source: "inferred",
    },
  });
}
