"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  Target,
  Home,
  Loader2,
  RefreshCw,
  Check,
  Sparkles,
  Edit,
  Info,
  X,
} from "lucide-react";

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
import { format, parseISO, startOfWeek, addDays } from "date-fns";

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

interface CollapsibleWeeklyPlanProps {
  onGenerateSchedule?: () => void;
  generating?: boolean;
}

export function CollapsibleWeeklyPlan({
  onGenerateSchedule,
  generating = false,
}: CollapsibleWeeklyPlanProps) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeeklyTasks();
  }, []);

  async function fetchWeeklyTasks() {
    try {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const response = await fetch(
        `/api/scheduled-tasks?view=week&date=${format(weekStart, "yyyy-MM-dd")}`
      );
      if (response.ok) {
        setTasks(await response.json());
      }
    } catch (error) {
      console.error("Error fetching weekly tasks:", error);
    } finally {
      setLoading(false);
    }
  }

  // Group tasks by day
  const tasksByDay = tasks.reduce((acc, task) => {
    const day = format(parseISO(task.scheduledDate), "yyyy-MM-dd");
    if (!acc[day]) acc[day] = [];
    acc[day].push(task);
    return acc;
  }, {} as Record<string, ScheduledTask[]>);

  // Get week days
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Your Week, Optimized
            <InfoButton info="Overview of your scheduled tasks for the week. Expand to see daily breakdown. AI optimizes task placement based on your calendar, preferences, and energy patterns." />
          </CardTitle>
          <div className="flex items-center gap-2">
            {totalTasks > 0 && (
              <Badge variant="secondary" className="font-normal">
                {completedTasks}/{totalTasks} done
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8 p-0"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Collapsed View - Summary */}
        {!expanded && (
          <div className="space-y-3">
            {totalTasks === 0 ? (
              <div className="text-center py-4">
                <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">Ready to take control of your week?</p>
                <p className="text-xs text-gray-400 mb-3">Let AI find the best times for everything</p>
                <Button
                  onClick={onGenerateSchedule}
                  disabled={generating}
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-purple-600"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Plan My Week
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <>
                {/* Mini week overview */}
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((day) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayTasks = tasksByDay[dayStr] || [];
                    const completed = dayTasks.filter((t) => t.status === "completed").length;
                    const total = dayTasks.length;
                    const isToday = format(new Date(), "yyyy-MM-dd") === dayStr;

                    return (
                      <div
                        key={dayStr}
                        className={`text-center p-2 rounded ${
                          isToday ? "bg-blue-50 border border-blue-200" : "bg-gray-50"
                        }`}
                      >
                        <div className="text-xs text-gray-500">{format(day, "EEE")}</div>
                        <div className={`text-sm font-medium ${isToday ? "text-blue-600" : ""}`}>
                          {format(day, "d")}
                        </div>
                        {total > 0 && (
                          <div className="text-xs mt-1">
                            <span className={completed === total ? "text-green-600" : "text-gray-600"}>
                              {completed}/{total}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setExpanded(true)}
                  className="w-full text-gray-500"
                >
                  View full schedule
                </Button>
              </>
            )}
          </div>
        )}

        {/* Expanded View - Full Details */}
        {expanded && (
          <div className="space-y-4">
            {weekDays.map((day) => {
              const dayStr = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDay[dayStr] || [];
              const isToday = format(new Date(), "yyyy-MM-dd") === dayStr;

              return (
                <div key={dayStr}>
                  <div
                    className={`text-sm font-medium mb-2 ${
                      isToday ? "text-blue-600" : "text-gray-700"
                    }`}
                  >
                    {format(day, "EEEE, MMM d")}
                    {isToday && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Today
                      </Badge>
                    )}
                  </div>

                  {dayTasks.length > 0 ? (
                    <div className="space-y-1 ml-2">
                      {dayTasks
                        .sort(
                          (a, b) =>
                            parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
                        )
                        .map((task) => (
                          <div
                            key={task.id}
                            className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                              task.status === "completed"
                                ? "bg-green-50 text-gray-500"
                                : "bg-gray-50"
                            }`}
                          >
                            {task.status === "completed" ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : task.task.type === "resolution" ? (
                              <Target className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Home className="h-4 w-4 text-green-500" />
                            )}
                            <span
                              className={task.status === "completed" ? "line-through" : ""}
                            >
                              {task.task.name}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">
                              {format(parseISO(task.startTime), "h:mm a")}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 ml-2">No tasks scheduled</p>
                  )}
                </div>
              );
            })}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <a href="/schedule">
                  <Edit className="h-4 w-4 mr-1" />
                  Edit Schedule
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateSchedule}
                disabled={generating}
                className="flex-1"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
