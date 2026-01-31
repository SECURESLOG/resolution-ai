"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckCircle,
  Clock,
  Flame,
  Plus,
  Sparkles,
  Target,
  Home,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
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
}

interface ScheduledTask {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  task: {
    id: string;
    name: string;
    type: string;
    duration: number;
  };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<AIScheduleResponse | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [statsRes, scheduleRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/scheduled-tasks?view=day"),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (scheduleRes.ok) {
        setTodaySchedule(await scheduleRes.json());
      }
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

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate schedule");
      }

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

      if (!res.ok) {
        throw new Error(data.error || "Failed to approve schedule");
      }

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

  async function updateTaskStatus(taskId: string, status: string) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {session?.user?.name?.split(" ")[0] || "there"}!
          </h1>
          <p className="text-gray-600 mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Button
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          onClick={generateSchedule}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate This Week&apos;s Schedule
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Today</p>
                <p className="text-2xl font-bold">
                  {stats?.completedToday || 0}/{stats?.todayTasks || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">This Week</p>
                <p className="text-2xl font-bold">
                  {stats?.completedWeek || 0}/{stats?.weekTasks || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Streak</p>
                <p className="text-2xl font-bold">{stats?.streakDays || 0} days</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Flame className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Tasks</p>
                <p className="text-2xl font-bold">{stats?.totalTasks || 0}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Target className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Schedule Result */}
      {scheduleResult && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              AI Schedule Recommendations
            </CardTitle>
            <CardDescription>{scheduleResult.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            {scheduleResult.schedule.length > 0 ? (
              <>
                <div className="space-y-3 mb-6">
                  {scheduleResult.schedule.map((rec, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 p-4 bg-white rounded-lg border"
                    >
                      <div className="flex-shrink-0">
                        {rec.taskType === "resolution" ? (
                          <Target className="h-5 w-5 text-blue-600" />
                        ) : (
                          <Home className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{rec.taskName}</p>
                          <Badge variant={rec.taskType === "resolution" ? "default" : "secondary"}>
                            {rec.taskType}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">
                          {format(new Date(rec.date), "EEE, MMM d")} at {rec.startTime} - {rec.endTime}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">{rec.reasoning}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => approveSchedule(scheduleResult.schedule)}
                    disabled={approving}
                  >
                    {approving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve & Add to Calendar
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={() => setScheduleResult(null)}>
                    Dismiss
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-gray-600">No tasks to schedule. Add some tasks first!</p>
            )}

            {scheduleResult.conflicts.length > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="font-medium text-yellow-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Some tasks couldn&apos;t be scheduled:
                </p>
                <ul className="mt-2 space-y-1">
                  {scheduleResult.conflicts.map((conflict, index) => (
                    <li key={index} className="text-sm text-yellow-700">
                      {conflict.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Today's Schedule */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Today&apos;s Schedule</CardTitle>
              <CardDescription>Your tasks for today</CardDescription>
            </div>
            <Clock className="h-5 w-5 text-gray-400" />
          </CardHeader>
          <CardContent>
            {todaySchedule.length > 0 ? (
              <div className="space-y-3">
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
                        <p
                          className={`font-medium ${
                            item.status === "completed" ? "line-through text-gray-500" : ""
                          }`}
                        >
                          {item.task.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {format(new Date(item.startTime), "h:mm a")} -{" "}
                          {format(new Date(item.endTime), "h:mm a")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={item.task.type === "resolution" ? "default" : "secondary"}>
                      {item.task.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No tasks scheduled for today</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={generateSchedule}
                  disabled={generating}
                >
                  Generate a schedule
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Add / Task Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Your Tasks</CardTitle>
              <CardDescription>Resolution and household tasks</CardDescription>
            </div>
            <Target className="h-5 w-5 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <Target className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-600">{stats?.resolutionTasks || 0}</p>
                <p className="text-sm text-blue-600">Resolutions</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <Home className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600">{stats?.householdTasks || 0}</p>
                <p className="text-sm text-green-600">Household</p>
              </div>
            </div>

            <Link href="/tasks">
              <Button className="w-full" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add New Task
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
