"use client";

import { useEffect, useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  Target,
  Home,
  CheckCircle,
  XCircle,
  Plus,
  AlertTriangle,
  GripVertical,
  Clock,
  ChevronDown,
  ChevronUp,
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
  setHours,
  setMinutes,
} from "date-fns";
import { CalendarEvent } from "@/types";
import { TaskFeedbackModal } from "@/components/feedback/task-feedback-modal";
import { TaskActionDialog } from "@/components/tasks/task-action-dialog";

interface Task {
  id: string;
  name: string;
  type: string;
  duration: number;
  category: string | null;
  priority: number;
  schedulingMode: string;
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

interface ConflictInfo {
  hasConflict: boolean;
  conflictingEvent?: string;
  conflictTime?: string;
}

// Draggable Task Component
function DraggableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`p-3 bg-white border rounded-lg cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        task.type === "resolution" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-green-500"
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{task.name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {task.duration}m
            </span>
            {task.category && (
              <Badge variant="outline" className="text-xs py-0">
                {task.category}
              </Badge>
            )}
          </div>
        </div>
        {task.type === "resolution" ? (
          <Target className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : (
          <Home className="h-4 w-4 text-green-500 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

// Droppable Calendar Slot
function DroppableSlot({
  day,
  hour,
  children,
  isOver,
}: {
  day: Date;
  hour: number;
  children?: React.ReactNode;
  isOver?: boolean;
}) {
  const slotId = `slot-${format(day, "yyyy-MM-dd")}-${hour}`;
  const { setNodeRef, isOver: dropping } = useDroppable({
    id: slotId,
    data: { day, hour },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60px] border-b border-gray-100 relative ${
        dropping || isOver ? "bg-blue-50 border-blue-300" : ""
      }`}
    >
      {children}
    </div>
  );
}

// Helper functions
function getEventStartTime(event: CalendarEvent): Date {
  const start = event.start;
  if (typeof start === "string") return parseISO(start);
  if (start instanceof Date) return start;
  return start.dateTime ? parseISO(start.dateTime) : parseISO(start.date!);
}

function getEventEndTime(event: CalendarEvent): Date {
  const end = event.end;
  if (typeof end === "string") return parseISO(end);
  if (end instanceof Date) return end;
  return end.dateTime ? parseISO(end.dateTime) : parseISO(end.date!);
}

export default function SchedulePage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskSidebarCollapsed, setTaskSidebarCollapsed] = useState(false);

  // Conflict dialog state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<{
    task: Task;
    day: Date;
    hour: number;
    conflict: ConflictInfo;
  } | null>(null);

  // Feedback states
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackTask, setFeedbackTask] = useState<ScheduledTask | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTask, setActionTask] = useState<ScheduledTask | null>(null);
  const [pendingAction, setPendingAction] = useState<"complete" | "skip">("complete");

  // Filter state
  const [taskFilter, setTaskFilter] = useState<"all" | "resolution" | "household">("all");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const weekStart = useMemo(() => startOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekEnd = useMemo(() => endOfWeek(currentWeek, { weekStartsOn: 1 }), [currentWeek]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const hours = useMemo(() => Array.from({ length: 16 }, (_, i) => i + 6), []); // 6 AM to 9 PM

  useEffect(() => {
    fetchData();
  }, [weekStart, weekEnd]);

  async function fetchData() {
    setLoading(true);
    try {
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");

      const [tasksRes, scheduledRes, calendarRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch(`/api/scheduled-tasks?view=week&date=${startStr}`),
        fetch(`/api/calendar?start=${startStr}&end=${endStr}`),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (scheduledRes.ok) setScheduledTasks(await scheduledRes.json());
      if (calendarRes.ok) setCalendarEvents(await calendarRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  function checkForConflicts(day: Date, hour: number, duration: number): ConflictInfo {
    const startTime = setMinutes(setHours(day, hour), 0);
    const endTime = new Date(startTime.getTime() + duration * 60000);

    // Check calendar events
    for (const event of calendarEvents) {
      const eventStart = getEventStartTime(event);
      const eventEnd = getEventEndTime(event);

      if (!isSameDay(eventStart, day)) continue;

      // Check for overlap
      if (startTime < eventEnd && endTime > eventStart) {
        return {
          hasConflict: true,
          conflictingEvent: event.summary,
          conflictTime: format(eventStart, "h:mm a"),
        };
      }
    }

    // Check scheduled tasks
    for (const task of scheduledTasks) {
      const taskStart = parseISO(task.startTime);
      const taskEnd = parseISO(task.endTime);

      if (!isSameDay(taskStart, day)) continue;

      if (startTime < taskEnd && endTime > taskStart) {
        return {
          hasConflict: true,
          conflictingEvent: task.task.name,
          conflictTime: format(taskStart, "h:mm a"),
        };
      }
    }

    return { hasConflict: false };
  }

  async function scheduleTask(task: Task, day: Date, hour: number, recordOverlap: boolean = false) {
    const startTime = setMinutes(setHours(day, hour), 0);
    const endTime = new Date(startTime.getTime() + task.duration * 60000);

    try {
      const response = await fetch("/api/schedule/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          date: format(day, "yyyy-MM-dd"),
          startTime: format(startTime, "HH:mm"),
          endTime: format(endTime, "HH:mm"),
          recordOverlap,
        }),
      });

      if (response.ok) {
        fetchData();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to schedule task");
      }
    } catch (error) {
      console.error("Error scheduling task:", error);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const { task } = event.active.data.current as { task: Task };
    setActiveTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);

    if (!event.over) return;

    const { task } = event.active.data.current as { task: Task };
    const { day, hour } = event.over.data.current as { day: Date; hour: number };

    const conflict = checkForConflicts(day, hour, task.duration);

    if (conflict.hasConflict) {
      setPendingSchedule({ task, day, hour, conflict });
      setConflictDialogOpen(true);
    } else {
      scheduleTask(task, day, hour);
    }
  }

  function handleConflictAccept() {
    if (pendingSchedule) {
      scheduleTask(pendingSchedule.task, pendingSchedule.day, pendingSchedule.hour, true);
    }
    setConflictDialogOpen(false);
    setPendingSchedule(null);
  }

  function handleConflictReject() {
    setConflictDialogOpen(false);
    setPendingSchedule(null);
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
        setFeedbackModalOpen(true);
      }

      fetchData();
    } catch (error) {
      console.error("Error updating task:", error);
    }

    setActionTask(null);
    setActionDialogOpen(false);
  }

  function getItemsForSlot(day: Date, hour: number) {
    const slotStart = setMinutes(setHours(day, hour), 0);
    const slotEnd = setMinutes(setHours(day, hour + 1), 0);

    const events = calendarEvents.filter((event) => {
      const eventStart = getEventStartTime(event);
      return isSameDay(eventStart, day) && eventStart >= slotStart && eventStart < slotEnd;
    });

    const tasks = scheduledTasks.filter((task) => {
      const taskStart = parseISO(task.startTime);
      return isSameDay(taskStart, day) && taskStart >= slotStart && taskStart < slotEnd;
    });

    return { events, tasks };
  }

  const filteredTasks = tasks.filter((task) => {
    if (taskFilter === "all") return true;
    return task.type === taskFilter;
  });

  const unscheduledTasks = filteredTasks.filter(
    (task) => !scheduledTasks.some((st) => st.task.id === task.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-[calc(100vh-120px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Schedule</h1>
            <p className="text-sm text-gray-600">
              Drag to schedule - AI warns you before you overbook
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 font-medium">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </span>
          </div>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Task Sidebar */}
          <div
            className={`bg-white border rounded-lg transition-all duration-300 ${
              taskSidebarCollapsed ? "w-12" : "w-72"
            } flex flex-col`}
          >
            <div className="p-3 border-b flex items-center justify-between">
              {!taskSidebarCollapsed && (
                <>
                  <h2 className="font-semibold text-sm">Needs Scheduling</h2>
                  <Button variant="ghost" size="sm" asChild>
                    <a href="/schedule?add=true">
                      <Plus className="h-4 w-4" />
                    </a>
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTaskSidebarCollapsed(!taskSidebarCollapsed)}
                className="h-8 w-8"
              >
                {taskSidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>

            {!taskSidebarCollapsed && (
              <>
                {/* Filter */}
                <div className="p-2 border-b">
                  <div className="flex gap-1">
                    {(["all", "resolution", "household"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setTaskFilter(filter)}
                        className={`flex-1 py-1 px-2 text-xs rounded ${
                          taskFilter === filter
                            ? "bg-blue-100 text-blue-700"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {filter === "all" ? "All" : filter === "resolution" ? "Focus" : "Life Admin"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Task List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {unscheduledTasks.length > 0 ? (
                    unscheduledTasks.map((task) => (
                      <DraggableTask key={task.id} task={task} />
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p>Everything&apos;s scheduled!</p>
                      <p className="text-xs text-gray-400 mt-1">Time to focus on doing</p>
                      <Button variant="link" size="sm" className="mt-1" asChild>
                        <a href="/schedule?add=true">Add something new</a>
                      </Button>
                    </div>
                  )}
                </div>

                {/* Scheduled count */}
                <div className="p-2 border-t text-xs text-gray-500 text-center">
                  {scheduledTasks.length} time blocks protected this week
                </div>
              </>
            )}
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 bg-white border rounded-lg overflow-hidden flex flex-col">
            {/* Day Headers */}
            <div className="grid grid-cols-8 border-b bg-gray-50">
              <div className="p-2 text-xs font-medium text-gray-500 border-r">Time</div>
              {weekDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-2 text-center ${isToday ? "bg-blue-50" : ""}`}
                  >
                    <div className={`text-xs font-medium ${isToday ? "text-blue-600" : "text-gray-500"}`}>
                      {format(day, "EEE")}
                    </div>
                    <div className={`text-lg font-bold ${isToday ? "text-blue-600" : "text-gray-900"}`}>
                      {format(day, "d")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div className="flex-1 overflow-y-auto">
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-8 border-b">
                  {/* Time Label */}
                  <div className="p-1 text-xs text-gray-500 text-right pr-2 border-r bg-gray-50">
                    {format(setHours(new Date(), hour), "h a")}
                  </div>

                  {/* Day Slots */}
                  {weekDays.map((day) => {
                    const { events, tasks: slotTasks } = getItemsForSlot(day, hour);
                    const isToday = isSameDay(day, new Date());

                    return (
                      <DroppableSlot key={`${day.toISOString()}-${hour}`} day={day} hour={hour}>
                        <div className={`h-full p-1 ${isToday ? "bg-blue-50/30" : ""}`}>
                          {/* Calendar Events */}
                          {events.map((event) => (
                            <div
                              key={event.id}
                              className="text-xs p-1 mb-1 rounded bg-gray-100 border-l-2 border-gray-400 truncate"
                              title={event.summary}
                            >
                              {event.summary}
                            </div>
                          ))}

                          {/* Scheduled Tasks */}
                          {slotTasks.map((task) => (
                            <div
                              key={task.id}
                              className={`text-xs p-1 mb-1 rounded truncate ${
                                task.task.type === "resolution"
                                  ? "bg-blue-100 border-l-2 border-blue-500"
                                  : "bg-green-100 border-l-2 border-green-500"
                              } ${task.status === "completed" ? "opacity-60 line-through" : ""}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="truncate">{task.task.name}</span>
                                <div className="flex gap-0.5 ml-1">
                                  <button
                                    onClick={() => initiateTaskAction(task, "complete")}
                                    className="p-0.5 hover:bg-green-200 rounded"
                                  >
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                  </button>
                                  <button
                                    onClick={() => initiateTaskAction(task, "skip")}
                                    className="p-0.5 hover:bg-red-200 rounded"
                                  >
                                    <XCircle className="h-3 w-3 text-red-600" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </DroppableSlot>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeTask && (
          <div className="p-3 bg-white border-2 border-blue-500 rounded-lg shadow-lg w-64">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-sm">{activeTask.name}</span>
              {activeTask.type === "resolution" ? (
                <Target className="h-4 w-4 text-blue-500" />
              ) : (
                <Home className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
        )}
      </DragOverlay>

      {/* Conflict Dialog */}
      <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Potential Overcommitment
            </DialogTitle>
            <DialogDescription>
              &quot;{pendingSchedule?.conflict.conflictingEvent}&quot; is already at{" "}
              {pendingSchedule?.conflict.conflictTime}. Double-booking can lead to stress and dropped tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Scheduling &quot;{pendingSchedule?.task.name}&quot; here creates an overlap.
              AI will track this to help identify patterns in your schedule health.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleConflictReject}>
              Find Better Time
            </Button>
            <Button onClick={handleConflictAccept}>I&apos;ll Manage It</Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Feedback Modal */}
      {feedbackTask && (
        <TaskFeedbackModal
          isOpen={feedbackModalOpen}
          onClose={() => {
            setFeedbackModalOpen(false);
            setFeedbackTask(null);
          }}
          scheduledTaskId={feedbackTask.id}
          taskName={feedbackTask.task.name}
          estimatedDuration={feedbackTask.task.duration}
          onFeedbackSubmitted={() => fetchData()}
        />
      )}
    </DndContext>
  );
}
