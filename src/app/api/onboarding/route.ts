import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Fetch onboarding progress for current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Always check current state from actual data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        accounts: { where: { provider: "google" }, take: 1 },
        tasks: { take: 1 },
        scheduledTasks: { take: 1 },
        feedback: { take: 1 },
      },
    });

    // Calendar is connected if user has a Google account with refresh token
    const hasCalendarConnected = (user?.accounts?.length || 0) > 0;
    const hasTaskCreated = (user?.tasks?.length || 0) > 0;
    const hasScheduleGenerated = (user?.scheduledTasks?.length || 0) > 0;
    const hasFeedbackGiven = (user?.feedback?.length || 0) > 0;

    // Get or create onboarding progress
    let onboarding = await prisma.onboardingProgress.findUnique({
      where: { userId: session.user.id },
    });

    if (!onboarding) {
      onboarding = await prisma.onboardingProgress.create({
        data: {
          userId: session.user.id,
          calendarConnected: hasCalendarConnected,
          firstTaskCreated: hasTaskCreated,
          firstScheduleGenerated: hasScheduleGenerated,
          firstFeedbackGiven: hasFeedbackGiven,
          currentStep: calculateCurrentStep(
            hasCalendarConnected,
            hasTaskCreated,
            hasScheduleGenerated,
            hasFeedbackGiven
          ),
        },
      });
    } else {
      // Sync onboarding with actual state if out of date
      const needsUpdate =
        onboarding.calendarConnected !== hasCalendarConnected ||
        onboarding.firstTaskCreated !== hasTaskCreated ||
        onboarding.firstScheduleGenerated !== hasScheduleGenerated ||
        onboarding.firstFeedbackGiven !== hasFeedbackGiven;

      if (needsUpdate) {
        onboarding = await prisma.onboardingProgress.update({
          where: { userId: session.user.id },
          data: {
            calendarConnected: hasCalendarConnected,
            firstTaskCreated: hasTaskCreated,
            firstScheduleGenerated: hasScheduleGenerated,
            firstFeedbackGiven: hasFeedbackGiven,
            currentStep: calculateCurrentStep(
              hasCalendarConnected,
              hasTaskCreated,
              hasScheduleGenerated,
              hasFeedbackGiven
            ),
          },
        });
      }
    }

    // Calculate completion percentage
    const steps = [
      hasCalendarConnected,
      hasTaskCreated,
      hasScheduleGenerated,
      hasFeedbackGiven,
    ];
    const completedCount = steps.filter(Boolean).length;
    const isComplete = completedCount === 4;

    return NextResponse.json({
      ...onboarding,
      calendarConnected: hasCalendarConnected,
      firstTaskCreated: hasTaskCreated,
      firstScheduleGenerated: hasScheduleGenerated,
      firstFeedbackGiven: hasFeedbackGiven,
      completedCount,
      totalSteps: 4,
      isComplete,
      isSkipped: !!onboarding.skippedAt,
    });
  } catch (error) {
    console.error("Error fetching onboarding progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding progress" },
      { status: 500 }
    );
  }
}

// PATCH - Update onboarding progress
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, step } = body;

    // Get current onboarding state
    let onboarding = await prisma.onboardingProgress.findUnique({
      where: { userId: session.user.id },
    });

    if (!onboarding) {
      onboarding = await prisma.onboardingProgress.create({
        data: { userId: session.user.id },
      });
    }

    // Handle different actions
    let updateData: Record<string, unknown> = {};

    switch (action) {
      case "skip":
        updateData = { skippedAt: new Date() };
        break;
      case "resume":
        updateData = { skippedAt: null };
        break;
      case "complete_step":
        if (step === "calendar") {
          updateData = { calendarConnected: true };
        } else if (step === "task") {
          updateData = { firstTaskCreated: true };
        } else if (step === "schedule") {
          updateData = { firstScheduleGenerated: true };
        } else if (step === "feedback") {
          updateData = { firstFeedbackGiven: true };
        }
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update onboarding progress
    const updated = await prisma.onboardingProgress.update({
      where: { userId: session.user.id },
      data: updateData,
    });

    // Recalculate current step and completion
    const newCurrentStep = calculateCurrentStep(
      updated.calendarConnected,
      updated.firstTaskCreated,
      updated.firstScheduleGenerated,
      updated.firstFeedbackGiven
    );

    const steps = [
      updated.calendarConnected,
      updated.firstTaskCreated,
      updated.firstScheduleGenerated,
      updated.firstFeedbackGiven,
    ];
    const completedCount = steps.filter(Boolean).length;
    const isComplete = completedCount === 4;

    // Mark as completed if all steps done
    if (isComplete && !updated.completedAt) {
      await prisma.onboardingProgress.update({
        where: { userId: session.user.id },
        data: { completedAt: new Date(), currentStep: 5 },
      });
    } else if (newCurrentStep !== updated.currentStep) {
      await prisma.onboardingProgress.update({
        where: { userId: session.user.id },
        data: { currentStep: newCurrentStep },
      });
    }

    return NextResponse.json({
      ...updated,
      currentStep: isComplete ? 5 : newCurrentStep,
      completedCount,
      totalSteps: 4,
      isComplete,
      isSkipped: !!updated.skippedAt,
    });
  } catch (error) {
    console.error("Error updating onboarding progress:", error);
    return NextResponse.json(
      { error: "Failed to update onboarding progress" },
      { status: 500 }
    );
  }
}

function calculateCurrentStep(
  calendarConnected: boolean,
  firstTaskCreated: boolean,
  firstScheduleGenerated: boolean,
  firstFeedbackGiven: boolean
): number {
  if (!calendarConnected) return 1;
  if (!firstTaskCreated) return 2;
  if (!firstScheduleGenerated) return 3;
  if (!firstFeedbackGiven) return 4;
  return 5; // All complete
}
