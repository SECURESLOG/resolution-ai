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

    // Get or create onboarding progress
    let onboarding = await prisma.onboardingProgress.findUnique({
      where: { userId: session.user.id },
    });

    if (!onboarding) {
      // Check current state to initialize correctly
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          tasks: { take: 1 },
          scheduledTasks: { take: 1 },
          feedback: { take: 1 },
        },
      });

      onboarding = await prisma.onboardingProgress.create({
        data: {
          userId: session.user.id,
          calendarConnected: user?.calendarConnected || false,
          firstTaskCreated: (user?.tasks?.length || 0) > 0,
          firstScheduleGenerated: (user?.scheduledTasks?.length || 0) > 0,
          firstFeedbackGiven: (user?.feedback?.length || 0) > 0,
          currentStep: calculateCurrentStep(
            user?.calendarConnected || false,
            (user?.tasks?.length || 0) > 0,
            (user?.scheduledTasks?.length || 0) > 0,
            (user?.feedback?.length || 0) > 0
          ),
        },
      });
    }

    // Calculate completion percentage
    const steps = [
      onboarding.calendarConnected,
      onboarding.firstTaskCreated,
      onboarding.firstScheduleGenerated,
      onboarding.firstFeedbackGiven,
    ];
    const completedCount = steps.filter(Boolean).length;
    const isComplete = completedCount === 4;

    return NextResponse.json({
      ...onboarding,
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
