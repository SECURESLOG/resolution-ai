"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  CheckCircle2,
  Circle,
  ListTodo,
  Sparkles,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

interface OnboardingProgress {
  calendarConnected: boolean;
  firstTaskCreated: boolean;
  firstScheduleGenerated: boolean;
  firstFeedbackGiven: boolean;
  completedCount: number;
  totalSteps: number;
  isComplete: boolean;
  isSkipped: boolean;
  currentStep: number;
}

interface OnboardingChecklistProps {
  onStepClick?: (step: string) => void;
  onGenerateSchedule?: (type: "task" | "week") => void;
}

export function OnboardingChecklist({
  onStepClick,
  onGenerateSchedule,
}: OnboardingChecklistProps) {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);

  useEffect(() => {
    fetchProgress();
  }, []);

  const fetchProgress = async () => {
    try {
      const response = await fetch("/api/onboarding");
      if (response.ok) {
        const data = await response.json();
        setProgress(data);
      }
    } catch (error) {
      console.error("Failed to fetch onboarding progress:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    try {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });
      setProgress((prev) => (prev ? { ...prev, isSkipped: true } : null));
    } catch (error) {
      console.error("Failed to skip onboarding:", error);
    }
  };

  const handleResume = async () => {
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      if (response.ok) {
        const data = await response.json();
        setProgress(data);
      }
    } catch (error) {
      console.error("Failed to resume onboarding:", error);
    }
  };

  // Don't render if loading, complete, or no progress
  if (loading) return null;
  if (!progress) return null;
  if (progress.isComplete) return null;

  // If skipped, show minimal "Resume" button
  if (progress.isSkipped) {
    return (
      <Card className="border-dashed border-gray-300 bg-gray-50">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Sparkles className="h-4 w-4" />
              <span>
                Setup paused ({progress.completedCount}/{progress.totalSteps}{" "}
                steps done)
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleResume}>
              Resume Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const steps = [
    {
      id: "calendar",
      label: "Connect your calendars",
      description: "Show AI where your time goes",
      icon: Calendar,
      complete: progress.calendarConnected,
      action: () => onStepClick?.("calendar"),
    },
    {
      id: "task",
      label: "Add what needs scheduling",
      description: "Goals, routines, or life admin",
      icon: ListTodo,
      complete: progress.firstTaskCreated,
      action: () => onStepClick?.("task"),
    },
    {
      id: "schedule",
      label: "Let AI optimize your week",
      description: "Find time without the mental load",
      icon: Sparkles,
      complete: progress.firstScheduleGenerated,
      action: () => setShowScheduleOptions(true),
    },
    {
      id: "feedback",
      label: "Tell AI how it went",
      description: "Improve scheduling accuracy",
      icon: MessageSquare,
      complete: progress.firstFeedbackGiven,
      action: () => onStepClick?.("feedback"),
    },
  ];

  const currentStepIndex = steps.findIndex((s) => !s.complete);
  const progressPercentage = (progress.completedCount / progress.totalSteps) * 100;

  return (
    <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Getting Started
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {progress.completedCount}/{progress.totalSteps}
            </span>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 hover:bg-white/50 rounded"
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleSkip}
              className="p-1 hover:bg-white/50 rounded text-gray-400 hover:text-gray-600"
              title="Skip for now"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-white/50 rounded-full h-2 mt-2">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-2">
          <div className="space-y-3">
            {steps.map((step, index) => {
              const isCurrentStep = index === currentStepIndex;
              const isPastStep = index < currentStepIndex;
              const isFutureStep = index > currentStepIndex;
              const StepIcon = step.icon;

              return (
                <div key={step.id}>
                  <button
                    onClick={step.action}
                    disabled={isFutureStep && !step.complete}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg transition-all text-left ${
                      isCurrentStep
                        ? "bg-white shadow-sm border border-blue-200"
                        : step.complete
                        ? "bg-white/50"
                        : "opacity-50"
                    } ${
                      !isFutureStep || step.complete
                        ? "hover:bg-white cursor-pointer"
                        : "cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`mt-0.5 ${
                        step.complete
                          ? "text-green-500"
                          : isCurrentStep
                          ? "text-blue-500"
                          : "text-gray-400"
                      }`}
                    >
                      {step.complete ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div
                        className={`font-medium ${
                          step.complete
                            ? "text-gray-500 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {step.label}
                      </div>
                      <div className="text-sm text-gray-500">
                        {step.description}
                      </div>
                    </div>
                    <StepIcon
                      className={`h-5 w-5 ${
                        step.complete
                          ? "text-gray-400"
                          : isCurrentStep
                          ? "text-purple-500"
                          : "text-gray-300"
                      }`}
                    />
                  </button>

                  {/* Schedule options dropdown */}
                  {step.id === "schedule" &&
                    showScheduleOptions &&
                    !step.complete && (
                      <div className="ml-8 mt-2 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
                        <p className="text-sm text-gray-600 mb-3">
                          How should AI organize your time?
                        </p>
                        <Button
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            onGenerateSchedule?.("task");
                            setShowScheduleOptions(false);
                          }}
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Find time for one task
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => {
                            onGenerateSchedule?.("week");
                            setShowScheduleOptions(false);
                          }}
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Optimize my entire week
                        </Button>
                        <button
                          onClick={() => setShowScheduleOptions(false)}
                          className="text-xs text-gray-500 hover:text-gray-700 mt-1"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                </div>
              );
            })}
          </div>

          {/* Motivational message based on progress */}
          <div className="mt-4 pt-3 border-t border-white/50">
            <p className="text-sm text-gray-600 text-center">
              {progress.completedCount === 0 && (
                <>Let&apos;s eliminate your scheduling stress!</>
              )}
              {progress.completedCount === 1 && (
                <>Great! Now add what&apos;s competing for your time.</>
              )}
              {progress.completedCount === 2 && (
                <>Let AI find the optimal times - no more decision fatigue.</>
              )}
              {progress.completedCount === 3 && (
                <>
                  Last step! Your feedback helps AI learn your productivity patterns.
                </>
              )}
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
