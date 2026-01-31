"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  Target,
  Home,
  CheckCircle,
  XCircle,
  Users,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
} from "date-fns";
import { CalendarEvent } from "@/types";

interface ScheduledTask {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  aiReasoning?: string;
  assignedToUserId: string;
  task: {
    id: string;
    name: string;
    type: string;
    duration: number;
  };
  assignedTo?: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export default function CalendarPage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekEnd = useMemo(() => endOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const startStr = format(weekStart, "yyyy-MM-dd");
        const endStr = format(weekEnd, "yyyy-MM-dd");

        const [calendarRes, tasksRes] = await Promise.all([
          fetch(`/api/calendar?start=${startStr}&end=${endStr}`),
          fetch(`/api/scheduled-tasks?view=week&date=${startStr}&family=true`),
        ]);

        if (calendarRes.ok) {
          setCalendarEvents(await calendarRes.json());
        } else {
          const data = await calendarRes.json();
          if (data.error?.includes("No Google account")) {
            setError("Please connect your Google Calendar to see events.");
          }
        }

        if (tasksRes.ok) {
          setScheduledTasks(await tasksRes.json());
        }
      } catch (err) {
        console.error("Error fetching calendar data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [weekStart, weekEnd]);

  async function updateTaskStatus(taskId: string, status: string) {
    try {
      await fetch(`/api/scheduled-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // Trigger re-fetch by updating currentWeek to same value
      setCurrentWeek(new Date(currentWeek));
    } catch (error) {
      console.error("Error updating task:", error);
    }
  }

  function getEventsForDay(date: Date) {
    return calendarEvents.filter((event) => {
      const eventStart = event.start.dateTime
        ? parseISO(event.start.dateTime)
        : parseISO(event.start.date!);
      return isSameDay(eventStart, date);
    });
  }

  function getTasksForDay(date: Date) {
    return scheduledTasks.filter((task) => {
      return isSameDay(parseISO(task.scheduledDate), date);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            Calendar
            <span title="Family View">
              <Users className="h-6 w-6 text-purple-600" />
            </span>
          </h1>
          <p className="text-gray-600 mt-1">
            Unified view of all family members&apos; schedules and tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentWeek(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {format(weekStart, "MMMM d")} - {format(weekEnd, "MMMM d, yyyy")}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">{error}</p>
            <Button variant="link" className="mt-2" onClick={() => window.location.href = "/settings"}>
              Go to Settings
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-7 gap-4">
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const dayTasks = getTasksForDay(day);
            const isToday = isSameDay(day, new Date());

            return (
              <Card key={day.toISOString()} className={isToday ? "border-blue-500 border-2" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm ${isToday ? "text-blue-600" : "text-gray-600"}`}>
                    {format(day, "EEE")}
                  </CardTitle>
                  <CardDescription className={`text-2xl font-bold ${isToday ? "text-blue-600" : ""}`}>
                    {format(day, "d")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 p-2">
                  {/* Calendar Events */}
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-2 bg-gray-100 rounded text-xs"
                      title={event.summary}
                    >
                      <p className="font-medium truncate">{event.summary}</p>
                      {event.start.dateTime && (
                        <p className="text-gray-500">
                          {format(parseISO(event.start.dateTime), "h:mm a")}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Scheduled Tasks */}
                  {dayTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-2 rounded text-xs border-l-4 ${
                        task.task.type === "resolution"
                          ? "bg-blue-50 border-blue-500"
                          : "bg-green-50 border-green-500"
                      } ${task.status === "completed" ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start gap-1">
                        {task.task.type === "resolution" ? (
                          <Target className="h-3 w-3 text-blue-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Home className="h-3 w-3 text-green-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${task.status === "completed" ? "line-through" : ""}`}>
                            {task.task.name}
                          </p>
                          <div className="flex items-center gap-1 text-gray-500">
                            <span>{format(parseISO(task.startTime), "h:mm a")}</span>
                            {task.assignedTo && (
                              <span className="flex items-center gap-0.5" title={task.assignedTo.name || "Unknown"}>
                                {task.assignedTo.image ? (
                                  <img
                                    src={task.assignedTo.image}
                                    alt={task.assignedTo.name || ""}
                                    className="w-3 h-3 rounded-full"
                                  />
                                ) : (
                                  <span className="w-3 h-3 rounded-full bg-gray-300 flex items-center justify-center text-[6px] font-bold text-gray-600">
                                    {task.assignedTo.name?.charAt(0) || "?"}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={() => updateTaskStatus(task.id, "completed")}
                          className={`p-1 rounded ${
                            task.status === "completed" ? "bg-green-200" : "hover:bg-green-100"
                          }`}
                          title="Mark complete"
                        >
                          <CheckCircle className="h-3 w-3 text-green-600" />
                        </button>
                        <button
                          onClick={() => updateTaskStatus(task.id, "skipped")}
                          className={`p-1 rounded ${
                            task.status === "skipped" ? "bg-red-200" : "hover:bg-red-100"
                          }`}
                          title="Skip"
                        >
                          <XCircle className="h-3 w-3 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {dayEvents.length === 0 && dayTasks.length === 0 && (
                    <p className="text-gray-400 text-xs text-center py-4">No events</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-6 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 rounded"></div>
              <span className="text-sm text-gray-600">Calendar Events</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 border-l-4 border-blue-500 rounded"></div>
              <span className="text-sm text-gray-600">Resolution Tasks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border-l-4 border-green-500 rounded"></div>
              <span className="text-sm text-gray-600">Household Tasks</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-[8px] font-bold text-gray-600">A</div>
              <span className="text-sm text-gray-600">Assigned Member</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
