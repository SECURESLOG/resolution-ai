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
import { TaskFeedbackModal } from "@/components/feedback/task-feedback-modal";
import { useRegisterPageContext } from "@/contexts/AIAssistantContext";

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

// Combined type for unified rendering
type CalendarItem =
  | { type: 'event'; data: CalendarEvent; sortTime: Date }
  | { type: 'task'; data: ScheduledTask; sortTime: Date };

// Helper to extract start time from CalendarEvent
function getEventStartTime(event: CalendarEvent): Date {
  const start = event.start;
  if (typeof start === 'string') {
    return parseISO(start);
  }
  if (start instanceof Date) {
    return start;
  }
  // It's an object with dateTime or date
  return start.dateTime ? parseISO(start.dateTime) : parseISO(start.date!);
}

// Helper to extract end time from CalendarEvent
function getEventEndTime(event: CalendarEvent): Date {
  const end = event.end;
  if (typeof end === 'string') {
    return parseISO(end);
  }
  if (end instanceof Date) {
    return end;
  }
  // It's an object with dateTime or date
  return end.dateTime ? parseISO(end.dateTime) : parseISO(end.date!);
}

// Calculate duration in minutes for a calendar event
function getEventDuration(event: CalendarEvent): number {
  const start = getEventStartTime(event);
  const end = getEventEndTime(event);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

// Get height class based on duration
function getDurationHeightClass(durationMinutes: number): string {
  if (durationMinutes <= 15) return "min-h-[40px]";
  if (durationMinutes <= 30) return "min-h-[50px]";
  if (durationMinutes <= 45) return "min-h-[60px]";
  if (durationMinutes <= 60) return "min-h-[70px]";
  if (durationMinutes <= 90) return "min-h-[85px]";
  if (durationMinutes <= 120) return "min-h-[100px]";
  return "min-h-[120px]"; // 2+ hours
}

export default function CalendarPage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Feedback modal state
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackTask, setFeedbackTask] = useState<ScheduledTask | null>(null);

  // Register page context for AI assistant
  useRegisterPageContext("/calendar", "Calendar", {
    tasksCount: scheduledTasks.length,
    pendingTasks: scheduledTasks.filter((t) => t.status === "pending").length,
  });

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
          fetch(`/api/calendar?start=${startStr}&end=${endStr}&family=true`),
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

  async function updateTaskStatus(taskId: string, status: string, showFeedback = true) {
    try {
      const response = await fetch(`/api/scheduled-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok && status === "completed" && showFeedback) {
        // Find the task and show feedback modal
        const task = scheduledTasks.find(t => t.id === taskId);
        if (task) {
          setFeedbackTask(task);
          setFeedbackModalOpen(true);
        }
      }

      // Trigger re-fetch by updating currentWeek to same value
      setCurrentWeek(new Date(currentWeek));
    } catch (error) {
      console.error("Error updating task:", error);
    }
  }

  function handleFeedbackClose() {
    setFeedbackModalOpen(false);
    setFeedbackTask(null);
  }

  function handleFeedbackSubmitted() {
    // Refresh data after feedback
    setCurrentWeek(new Date(currentWeek));
  }

  function getItemsForDay(date: Date): CalendarItem[] {
    // Get calendar events for this day
    const dayEvents = calendarEvents
      .filter((event) => {
        const eventStart = getEventStartTime(event);
        return isSameDay(eventStart, date);
      })
      .map((event): CalendarItem => ({
        type: 'event',
        data: event,
        sortTime: getEventStartTime(event),
      }));

    // Get scheduled tasks for this day
    const dayTasks = scheduledTasks
      .filter((task) => isSameDay(parseISO(task.scheduledDate), date))
      .map((task): CalendarItem => ({
        type: 'task',
        data: task,
        sortTime: parseISO(task.startTime),
      }));

    // Combine and sort by time
    return [...dayEvents, ...dayTasks].sort(
      (a, b) => a.sortTime.getTime() - b.sortTime.getTime()
    );
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

      {/* Color Legend */}
      <div className="flex flex-wrap justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500"></div>
          <span>Resolution Tasks</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500"></div>
          <span>Household Tasks</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-400"></div>
          <span>Work Calendar</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-400"></div>
          <span>Family Work Calendar</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-300"></div>
          <span>Google Calendar</span>
        </div>
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
            const dayItems = getItemsForDay(day);
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
                  {/* Combined Events and Tasks sorted by time */}
                  {dayItems.map((item) => {
                    if (item.type === 'event') {
                      const event = item.data;
                      // Color coding: Work/External = orange, Google = gray, Family member = purple
                      const isExternal = event.source === "external";
                      const isFamilyMember = event.isOwn === false;

                      let bgColor = "bg-gray-100 border-gray-300"; // Google Calendar default
                      let textColor = "text-gray-600";

                      if (isExternal && isFamilyMember) {
                        bgColor = "bg-purple-50 border-purple-400";
                        textColor = "text-purple-600";
                      } else if (isExternal) {
                        bgColor = "bg-orange-50 border-orange-400";
                        textColor = "text-orange-600";
                      } else if (isFamilyMember) {
                        bgColor = "bg-pink-50 border-pink-300";
                        textColor = "text-pink-600";
                      }

                      const startTime = getEventStartTime(event).toISOString();
                      const duration = getEventDuration(event);
                      const heightClass = getDurationHeightClass(duration);

                      return (
                        <div
                          key={`event-${event.id}`}
                          className={`p-2 rounded text-xs border-l-4 ${bgColor} ${heightClass}`}
                          title={`${event.summary}${event.calendarName ? ` (${event.calendarName})` : ''}${event.userName && !event.isOwn ? ` - ${event.userName}` : ''} (${duration} min)`}
                        >
                          <p className="font-medium truncate">{event.summary}</p>
                          {startTime && (
                            <p className={textColor}>
                              {format(parseISO(startTime), "h:mm a")}
                              {event.userName && !event.isOwn && (
                                <span className="ml-1">• {event.userName}</span>
                              )}
                            </p>
                          )}
                          {event.calendarName && isExternal && (
                            <p className={`${textColor} truncate opacity-75`}>
                              {event.calendarName}
                            </p>
                          )}
                        </div>
                      );
                    } else {
                      const task = item.data;
                      const taskDuration = task.task.duration;
                      const taskHeightClass = getDurationHeightClass(taskDuration);
                      return (
                        <div
                          key={`task-${task.id}`}
                          className={`p-2 rounded text-xs border-l-4 ${
                            task.task.type === "resolution"
                              ? "bg-blue-50 border-blue-500"
                              : "bg-green-50 border-green-500"
                          } ${task.status === "completed" ? "opacity-60" : ""} ${taskHeightClass}`}
                          title={`${task.task.name} (${taskDuration} min)`}
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
                      );
                    }
                  })}

                  {dayItems.length === 0 && (
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

      {/* Task Feedback Modal */}
      {feedbackTask && (
        <TaskFeedbackModal
          isOpen={feedbackModalOpen}
          onClose={handleFeedbackClose}
          scheduledTaskId={feedbackTask.id}
          taskName={feedbackTask.task.name}
          estimatedDuration={feedbackTask.task.duration}
          onFeedbackSubmitted={handleFeedbackSubmitted}
        />
      )}
    </div>
  );
}
