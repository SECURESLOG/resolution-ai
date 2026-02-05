"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskFeedbackDialog } from "@/components/feedback/task-feedback-dialog";
import { TaskActionDialog } from "@/components/tasks/task-action-dialog";
import { DailyInsight } from "@/components/dashboard/daily-insight";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { CollapsibleWeeklyPlan } from "@/components/dashboard/collapsible-weekly-plan";
import { ScheduleHealthWidget } from "@/components/dashboard/schedule-health-widget";
import {
  CheckCircle,
  Calendar,
  Flame,
  Sparkles,
  Target,
  Home,
  AlertCircle,
  Loader2,
  Undo2,
  Info,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { AIScheduleResponse, ScheduleRecommendation } from "@/types";

interface Stats {
  todayTasks: number;
  completedToday: number;
  weekTasks: number;
  completedWeek: number;
  streakDays: number;
  totalTasks: number;
  resolutionTasks: number;
  householdTasks: number;
  completionRate: number;
}

interface ScheduledTask {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  streak?: number;
  task: {
    id: string;
    name: string;
    type: string;
    duration: number;
  };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<AIScheduleResponse | null>(null);
  const [approving, setApproving] = useState(false);
  const [feedbackTask, setFeedbackTask] = useState<ScheduledTask | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [onboardingKey, setOnboardingKey] = useState(0);

  // Task action dialog state
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTask, setActionTask] = useState<ScheduledTask | null>(null);
  const [pendingAction, setPendingAction] = useState<"complete" | "skip">("complete");

  // Onboarding step handlers - updated for new navigation
  const handleOnboardingStepClick = useCallback((step: string) => {
    if (step === "calendar") {
      router.push("/settings?tab=calendars"); // Go directly to Calendars tab
    } else if (step === "task") {
      router.push("/schedule"); // Schedule page with task sidebar
    } else if (step === "feedback") {
      const completedTask = todaySchedule.find(t => t.status === "completed");
      if (completedTask) {
        setFeedbackTask(completedTask);
        setShowFeedback(true);
      } else {
        router.push("/schedule");
      }
    }
  }, [router, todaySchedule]);

  const handleOnboardingGenerateSchedule = useCallback(async (type: "task" | "week") => {
    if (type === "week") {
      await generateSchedule();
    } else {
      router.push("/schedule");
    }
    setOnboardingKey(prev => prev + 1);
  }, [router]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statsRes, scheduleRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/scheduled-tasks?view=day"),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (scheduleRes.ok) setTodaySchedule(await scheduleRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function generateSchedule() {
    setGenerating(true);
    setScheduleResult(null);

    try {
      const res = await fetch("/api/schedule/generate", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to generate schedule");
      setScheduleResult(data);
    } catch (error) {
      console.error("Error generating schedule:", error);
      alert(error instanceof Error ? error.message : "Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  }

  async function approveSchedule(recommendations: ScheduleRecommendation[]) {
    setApproving(true);

    try {
      const res = await fetch("/api/schedule/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendations }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve schedule");

      alert(data.message);
      setScheduleResult(null);
      fetchData();
    } catch (error) {
      console.error("Error approving schedule:", error);
      alert(error instanceof Error ? error.message : "Failed to approve schedule");
    } finally {
      setApproving(false);
    }
  }

  function initiateTaskAction(task: ScheduledTask, action: "complete" | "skip") {
    setActionTask(task);
    setPendingAction(action);
    setActionDialogOpen(true);
  }

  async function handleTaskActionConfirm(learningEnabled: boolean) {
    if (!actionTask) return;

    const status = pendingAction === "complete" ? "completed" : "skipped";

    try {
      await fetch(`/api/scheduled-tasks/${actionTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, learningEnabled }),
      });

      if (status === "completed") {
        setFeedbackTask(actionTask);
        setShowFeedback(true);
      }

      fetchData();
    } catch (error) {
      console.error("Error updating task:", error);
    }

    setActionTask(null);
    setActionDialogOpen(false);
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const task = todaySchedule.find(t => t.id === taskId);
    if (task) {
      if (status === "completed" || status === "skipped") {
        initiateTaskAction(task, status === "completed" ? "complete" : "skip");
      } else {
        try {
          await fetch(`/api/scheduled-tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          fetchData();
        } catch (error) {
          console.error("Error updating task:", error);
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {session?.user?.name?.split(" ")[0] || "Hey"}, here&apos;s your day
          </h1>
          <p className="text-gray-600 text-sm">{format(new Date(), "EEEE, MMMM d")} - Focus on doing, not deciding</p>
        </div>
        <Button
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          onClick={generateSchedule}
          disabled={generating}
          size="sm"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Optimize My Week
            </>
          )}
        </Button>
      </div>

      {/* Onboarding Checklist */}
      <OnboardingChecklist
        key={onboardingKey}
        onStepClick={handleOnboardingStepClick}
        onGenerateSchedule={handleOnboardingGenerateSchedule}
      />

      {/* Compact Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-600">Today&apos;s Progress</p>
                  <InfoButton info="Shows how many tasks you've completed today out of your total scheduled tasks. Completing tasks helps the AI learn your preferences." />
                </div>
                <p className="text-xl font-bold text-blue-700">
                  {stats?.completedToday || 0}/{stats?.todayTasks || 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">Tasks done today</p>
              </div>
              <CheckCircle className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-600">Week&apos;s Progress</p>
                  <InfoButton info="Tracks your overall progress for the current week. This helps you see if you're on track to meet your weekly goals." />
                </div>
                <p className="text-xl font-bold text-purple-700">
                  {stats?.completedWeek || 0}/{stats?.weekTasks || 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">Weekly completion</p>
              </div>
              <Calendar className="h-8 w-8 text-purple-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-600">Consistency</p>
                  <InfoButton info="Your current streak of consecutive days with completed tasks. Building consistency helps form lasting habits." />
                </div>
                <p className="text-xl font-bold text-orange-700">{stats?.streakDays || 0} days</p>
                <p className="text-xs text-gray-400 mt-1">Days in a row active</p>
              </div>
              <Flame className="h-8 w-8 text-orange-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-600">Follow-through</p>
                  <InfoButton info="The percentage of scheduled tasks you've completed vs skipped. Higher follow-through means better schedule adherence and helps AI make better predictions." />
                </div>
                <p className="text-xl font-bold text-green-700">{stats?.completionRate || 0}%</p>
                <p className="text-xs text-gray-400 mt-1">Tasks completed vs skipped</p>
              </div>
              <Target className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Daily Insight */}
      <DailyInsight />

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Today's Schedule */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Schedule Result */}
          {scheduleResult && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  AI Found Time For You
                  <InfoButton info="AI has analyzed your calendar and found optimal time slots for your tasks. Review the suggestions and click 'Lock It In' to add them to your schedule." />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {scheduleResult.schedule.length > 0 ? (
                  <>
                    <p className="text-sm text-gray-600 mb-3">{scheduleResult.summary}</p>
                    <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
                      {scheduleResult.schedule.map((rec, index) => (
                        <div key={index} className="flex items-center gap-3 p-2 bg-white rounded border">
                          {rec.taskType === "resolution" ? (
                            <Target className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Home className="h-4 w-4 text-green-600" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{rec.taskName}</p>
                            <p className="text-xs text-gray-500">
                              {format(new Date(rec.date), "EEE, MMM d")} at {rec.startTime}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => approveSchedule(scheduleResult.schedule)}
                        disabled={approving}
                      >
                        {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lock It In"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setScheduleResult(null)}>
                        Not Now
                      </Button>
                    </div>

                    {scheduleResult.conflicts.length > 0 && (
                      <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-xs text-yellow-800 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {scheduleResult.conflicts.length} item(s) need manual scheduling - your week is full!
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-600 text-sm">Add tasks first, then let AI find the best times.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Today's Schedule */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>Today&apos;s Schedule</span>
                  <InfoButton info="Your tasks scheduled for today. Click the circle to mark complete, or click the task to see details. The AI learns from your completions to improve future scheduling." />
                </div>
                <Link href="/schedule">
                  <Button variant="ghost" size="sm">View all</Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todaySchedule.length > 0 ? (
                <div className="space-y-2">
                  {todaySchedule.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        item.status === "completed"
                          ? "bg-green-50 border-green-200"
                          : "bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateTaskStatus(
                              item.id,
                              item.status === "completed" ? "pending" : "completed"
                            )
                          }
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            item.status === "completed"
                              ? "bg-green-600 border-green-600"
                              : "border-gray-300 hover:border-blue-600"
                          }`}
                        >
                          {item.status === "completed" && (
                            <CheckCircle className="h-3 w-3 text-white" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-medium text-sm ${
                              item.status === "completed" ? "line-through text-gray-500" : ""
                            }`}>
                              {item.task.name}
                            </p>
                            {item.streak && item.streak >= 2 && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                                <Flame className="h-3 w-3" />
                                {item.streak}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {format(parseISO(item.startTime), "h:mm a")} - {format(parseISO(item.endTime), "h:mm a")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.status === "completed" && (
                          <button
                            onClick={() => updateTaskStatus(item.id, "pending")}
                            className="p-1 text-gray-400 hover:text-blue-600"
                          >
                            <Undo2 className="h-4 w-4" />
                          </button>
                        )}
                        <Badge variant={item.task.type === "resolution" ? "default" : "secondary"} className="text-xs">
                          {item.task.type === "resolution" ? "Focus" : "Life Admin"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Your day is clear</p>
                  <p className="text-gray-400 text-xs mb-2">Let AI find time for what matters</p>
                  <Button variant="link" size="sm" onClick={generateSchedule} disabled={generating}>
                    Optimize my week
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Weekly Plan & Health */}
        <div className="space-y-6">
          <CollapsibleWeeklyPlan
            onGenerateSchedule={generateSchedule}
            generating={generating}
          />
          <ScheduleHealthWidget />
        </div>
      </div>

      {/* Task Action Dialog */}
      {actionTask && (
        <TaskActionDialog
          isOpen={actionDialogOpen}
          onClose={() => {
            setActionDialogOpen(false);
            setActionTask(null);
          }}
          taskName={actionTask.task.name}
          action={pendingAction}
          onConfirm={handleTaskActionConfirm}
        />
      )}

      {/* Feedback Dialog */}
      {feedbackTask && (
        <TaskFeedbackDialog
          open={showFeedback}
          onOpenChange={setShowFeedback}
          scheduledTaskId={feedbackTask.id}
          taskName={feedbackTask.task.name}
          scheduledDuration={feedbackTask.task.duration}
          onSubmit={() => setFeedbackTask(null)}
        />
      )}
    </div>
  );
}

function InfoButton({ info }: { info: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="More information"
      >
        <Info className="h-4 w-4 text-gray-400 hover:text-gray-600" />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-8 z-50 w-72 p-3 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-gray-600">{info}</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-0.5 rounded hover:bg-gray-100"
              >
                <X className="h-3 w-3 text-gray-400" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
