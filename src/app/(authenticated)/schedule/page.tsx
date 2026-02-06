"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Briefcase,
  CheckCircle,
  XCircle,
  Plus,
  AlertTriangle,
  GripVertical,
  Clock,
  CalendarClock,
  Edit,
  Trash2,
  List,
  CalendarDays,
  Info,
  X,
  Users,
  User,
  UserPlus,
  Sparkles,
  Home,
  AlertCircle,
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
import { Checkbox } from "@/components/ui/checkbox";

// Updated categories for productivity messaging
const CATEGORIES = {
  resolution: ["Deep Work", "Exercise", "Learning", "Health", "Creative", "Other"],
  household: ["Errands", "Chores", "Family", "Finance", "Appointments", "Other"],
};

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

interface Task {
  id: string;
  name: string;
  type: string;
  duration: number;
  category: string | null;
  priority: number;
  schedulingMode: string;
  // Scheduling preferences
  fixedDays: string[] | null;
  fixedTime: string | null;
  frequency: number | null;
  frequencyPeriod: string | null;
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
}

interface ScheduledTask {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  assignedToUserId: string;
  assignedTo: {
    id: string;
    name: string | null;
    image: string | null;
  };
  task: {
    id: string;
    name: string;
    type: string;
    duration: number;
  };
}

interface FamilyMember {
  userId: string;
  name: string | null;
  image: string | null;
}

interface CalendarEventWithOwner extends CalendarEvent {
  userId?: string;
  userName?: string;
  isOwn?: boolean;
}

interface ConflictInfo {
  hasConflict: boolean;
  conflictingEvent?: string;
  conflictTime?: string;
}

interface UnscheduledTask {
  id: string;
  name: string;
  type: string;
  duration: number;
  priority: number;
}

interface AvailableTimeData {
  availableMinutes: number;
  availableHours: number;
  daysRemaining: number;
  unscheduledTasks: UnscheduledTask[];
  totalTaskMinutes: number;
  totalTaskHours: number;
  canFitAll: boolean;
}

interface FormData {
  name: string;
  type: "resolution" | "household";
  duration: number;
  category: string;
  priority: number;
  schedulingMode: "fixed" | "flexible";
  fixedDays: string[];
  fixedTime: string;
  frequency: number;
  frequencyPeriod: "day" | "week";
  preferredTimeStart: string;
  preferredTimeEnd: string;
}

const DEFAULT_FORM_DATA: FormData = {
  name: "",
  type: "resolution",
  duration: 30,
  category: "",
  priority: 3,
  schedulingMode: "flexible",
  fixedDays: [],
  fixedTime: "",
  frequency: 1,
  frequencyPeriod: "week",
  preferredTimeStart: "",
  preferredTimeEnd: "",
};

// Draggable Task Component
function DraggableTask({ task, onQuickSchedule }: { task: Task; onQuickSchedule?: (task: Task) => void }) {
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
      className={`p-3 bg-white border rounded-lg hover:shadow-md transition-shadow ${
        task.type === "resolution" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-green-500"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />
        </div>
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
        {onQuickSchedule && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickSchedule(task);
            }}
            className="p-1.5 hover:bg-purple-100 rounded-md transition-colors"
            title="Quick Schedule - AI finds the best time"
          >
            <Sparkles className="h-4 w-4 text-purple-500" />
          </button>
        )}
        {task.type === "resolution" ? (
          <Target className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : (
          <Briefcase className="h-4 w-4 text-green-500 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

// Draggable Scheduled Task Component with absolute positioning (for calendar view)
function DraggableScheduledTaskPositioned({
  scheduledTask,
  style: positionStyle,
  onComplete,
  onSkip,
  onReassign,
  currentUserId,
  viewMode,
}: {
  scheduledTask: ScheduledTask;
  style: { top: string; height: string };
  onComplete: () => void;
  onSkip: () => void;
  onReassign?: () => void;
  currentUserId: string;
  viewMode: "family" | "personal";
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `scheduled-${scheduledTask.id}`,
    data: { scheduledTask },
  });

  const isOthersMember = scheduledTask.assignedToUserId !== currentUserId;
  const isLifeAdmin = scheduledTask.task.type === "household";
  const showReassignButton = viewMode === "family" && isLifeAdmin && !isOthersMember;

  const combinedStyle = {
    ...positionStyle,
    ...(transform
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          zIndex: 100,
        }
      : {}),
  };

  const heightNum = parseInt(positionStyle.height);
  const showTime = heightNum >= 30;
  const showButtons = heightNum >= 15; // Show buttons even for short tasks
  const useVerticalButtons = heightNum >= 50; // Stack vertically only for taller tasks
  const useSmallIcons = heightNum < 25; // Use smaller icons for very short tasks

  // Visual differentiation for other family members' tasks
  const otherMemberStyles = isOthersMember
    ? "opacity-75 border-dashed"
    : "";

  const borderColor = isOthersMember
    ? scheduledTask.task.type === "resolution"
      ? "border-blue-300"
      : "border-green-300"
    : scheduledTask.task.type === "resolution"
    ? "border-blue-500"
    : "border-green-500";

  return (
    <div
      ref={setNodeRef}
      style={combinedStyle}
      className={`absolute left-0 right-0 mx-0.5 text-xs p-1 rounded overflow-hidden z-20 ${
        isOthersMember ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${
        scheduledTask.task.type === "resolution"
          ? "bg-blue-100"
          : "bg-green-100"
      } border-l-2 ${borderColor} ${otherMemberStyles} ${
        scheduledTask.status === "completed" ? "opacity-60" : ""
      } ${isDragging ? "opacity-70 shadow-lg ring-2 ring-blue-400" : ""}`}
      {...(isOthersMember ? {} : { ...listeners, ...attributes })}
    >
      <div className="flex items-start justify-between h-full">
        <div className="flex-1 min-w-0">
          {/* Show assignee name for other family members' tasks */}
          {isOthersMember && scheduledTask.assignedTo?.name && (
            <div className="text-[9px] font-semibold text-gray-500 truncate">
              {scheduledTask.assignedTo.name.split(" ")[0]}
            </div>
          )}
          <div className={`font-medium truncate ${scheduledTask.status === "completed" ? "line-through" : ""}`}>
            {scheduledTask.task.name}
          </div>
          {showTime && !isOthersMember && (
            <div className="text-[10px] text-gray-500">
              {scheduledTask.task.duration}min
            </div>
          )}
        </div>
        {showButtons && !isOthersMember && (
          <div className={`flex ${useVerticalButtons ? 'flex-col' : 'flex-row'} gap-0.5 ${useSmallIcons ? '' : 'ml-1'}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onComplete();
              }}
              className={`${useSmallIcons ? 'p-px' : 'p-0.5'} hover:bg-green-200 rounded`}
              title="Mark complete"
            >
              <CheckCircle className={`${useSmallIcons ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-green-600`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSkip();
              }}
              className={`${useSmallIcons ? 'p-px' : 'p-0.5'} hover:bg-red-200 rounded`}
              title="Skip"
            >
              <XCircle className={`${useSmallIcons ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-red-600`} />
            </button>
            {showReassignButton && onReassign && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onReassign();
                }}
                className={`${useSmallIcons ? 'p-px' : 'p-0.5'} hover:bg-purple-200 rounded`}
                title="Reassign to family member"
              >
                <UserPlus className={`${useSmallIcons ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-purple-600`} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable 15-minute slot
function Droppable15MinSlot({
  day,
  hour,
  minute,
}: {
  day: Date;
  hour: number;
  minute: number; // 0, 15, 30, or 45
}) {
  const slotId = `slot-${format(day, "yyyy-MM-dd")}-${hour}-${minute}`;
  const { setNodeRef, isOver } = useDroppable({
    id: slotId,
    data: { day, hour, minute },
  });

  return (
    <div
      ref={setNodeRef}
      className={`h-[15px] relative ${
        isOver ? "bg-blue-100" : ""
      } ${minute === 0 ? "" : "border-t border-gray-50"}`}
    />
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
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeScheduledTask, setActiveScheduledTask] = useState<ScheduledTask | null>(null);
  const [importedEventWarning, setImportedEventWarning] = useState(false);
  const [taskSidebarCollapsed, setTaskSidebarCollapsed] = useState(false);

  // View mode: family (default) or personal
  const [viewMode, setViewMode] = useState<"family" | "personal">("family");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // User's personal time window preferences
  const [availableTimeStart, setAvailableTimeStart] = useState<number>(6);
  const [availableTimeEnd, setAvailableTimeEnd] = useState<number>(22);

  // Reassignment state
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [taskToReassign, setTaskToReassign] = useState<ScheduledTask | null>(null);
  const [reassigning, setReassigning] = useState(false);

  // Reassignment learning prompts
  const [defaultAssigneePromptOpen, setDefaultAssigneePromptOpen] = useState(false);
  const [ownershipPromptOpen, setOwnershipPromptOpen] = useState(false);
  const [patternInfo, setPatternInfo] = useState<{
    taskId: string;
    taskName: string;
    targetUserId: string;
    targetUserName: string;
    reassignmentCount: number;
  } | null>(null);

  // Conflict dialog state
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<{
    task?: Task;
    scheduledTask?: ScheduledTask;
    day: Date;
    hour: number;
    minute: number;
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
  const [sidebarView, setSidebarView] = useState<"unscheduled" | "all">("unscheduled");

  // Task creation/edit dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  const [saving, setSaving] = useState(false);

  // Quick Schedule state
  const [quickScheduleDialogOpen, setQuickScheduleDialogOpen] = useState(false);
  const [quickScheduleTask, setQuickScheduleTask] = useState<Task | null>(null);
  const [quickScheduleOptions, setQuickScheduleOptions] = useState<{
    date: string;
    dayName: string;
    startTime: string;
    endTime: string;
    score: number;
  }[]>([]);
  const [quickScheduleLoading, setQuickScheduleLoading] = useState(false);
  const [quickScheduleError, setQuickScheduleError] = useState<string | null>(null);
  const [quickScheduleInfo, setQuickScheduleInfo] = useState<{
    slotsNeeded: number;
    foundSlots: number;
    alreadyScheduled: number;
    isFixedSchedule: boolean;
    frequency: string;
  } | null>(null);
  const [quickScheduling, setQuickScheduling] = useState(false);

  // Optimize My Week state
  const searchParams = useSearchParams();
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false);
  const [availableTimeData, setAvailableTimeData] = useState<AvailableTimeData | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [loadingAvailableTime, setLoadingAvailableTime] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

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
  // Generate hours based on user's personal time window
  const hours = useMemo(() => {
    const length = availableTimeEnd - availableTimeStart + 1;
    return Array.from({ length }, (_, i) => i + availableTimeStart);
  }, [availableTimeStart, availableTimeEnd]);

  useEffect(() => {
    fetchData();
  }, [weekStart, weekEnd]);

  async function fetchData() {
    setLoading(true);
    try {
      const startStr = format(weekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");

      // Always fetch family data - we filter client-side based on viewMode
      const [tasksRes, scheduledRes, calendarRes, userRes, familyRes, workScheduleRes] = await Promise.all([
        fetch("/api/tasks"),
        fetch(`/api/scheduled-tasks?view=week&date=${startStr}&family=true`),
        fetch(`/api/calendar?start=${startStr}&end=${endStr}&family=true`),
        fetch("/api/user/me"),
        fetch("/api/family"),
        fetch("/api/user/work-schedule"),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (scheduledRes.ok) setScheduledTasks(await scheduledRes.json());
      if (calendarRes.ok) setCalendarEvents(await calendarRes.json());
      if (userRes.ok) {
        const userData = await userRes.json();
        setCurrentUserId(userData.id);
      }
      if (familyRes.ok) {
        const familyData = await familyRes.json();
        if (familyData?.family?.members) {
          setFamilyMembers(familyData.family.members.map((m: { userId: string; user: { name: string | null; image: string | null } }) => ({
            userId: m.userId,
            name: m.user.name,
            image: m.user.image,
          })));
        }
      }
      if (workScheduleRes.ok) {
        const workData = await workScheduleRes.json();
        setAvailableTimeStart(workData.availableTimeStart ?? 6);
        setAvailableTimeEnd(workData.availableTimeEnd ?? 22);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  // Handle ?optimize=true query parameter
  useEffect(() => {
    if (searchParams.get("optimize") === "true" && !loading) {
      openOptimizeWeek();
      // Clear the query param from URL without reload
      window.history.replaceState({}, "", "/schedule");
    }
  }, [searchParams, loading]);

  // Open optimize week - smart show logic
  async function openOptimizeWeek() {
    setLoadingAvailableTime(true);

    try {
      const res = await fetch(`/api/schedule/available-time?weekStart=${format(weekStart, "yyyy-MM-dd")}`);
      if (res.ok) {
        const data: AvailableTimeData = await res.json();
        setAvailableTimeData(data);

        // Smart show: if all tasks fit, auto-schedule without dialog
        if (data.canFitAll && data.unscheduledTasks.length > 0) {
          // All tasks fit - auto-schedule all
          const allTaskIds = data.unscheduledTasks.map((t) => t.id);
          await optimizeWeek(allTaskIds);
        } else if (data.unscheduledTasks.length > 0) {
          // Not enough time - show selection dialog
          setSelectedTaskIds(new Set(data.unscheduledTasks.map((t) => t.id)));
          setOptimizeDialogOpen(true);
        } else {
          alert("No unscheduled tasks to optimize. Add some tasks first!");
        }
      }
    } catch (error) {
      console.error("Error fetching available time:", error);
      alert("Failed to check available time");
    } finally {
      setLoadingAvailableTime(false);
    }
  }

  // Calculate selected tasks duration
  const selectedTasksDuration = availableTimeData
    ? availableTimeData.unscheduledTasks
        .filter((t) => selectedTaskIds.has(t.id))
        .reduce((sum, t) => sum + t.duration, 0)
    : 0;

  // Optimize week - generate schedule and auto-approve
  async function optimizeWeek(taskIds: string[]) {
    setIsOptimizing(true);
    setOptimizeDialogOpen(false);

    try {
      // Step 1: Generate schedule
      const generateRes = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds, weekStart: format(weekStart, "yyyy-MM-dd") }),
      });

      const generateData = await generateRes.json();
      if (!generateRes.ok) {
        throw new Error(generateData.error || "Failed to generate schedule");
      }

      if (generateData.schedule.length === 0) {
        alert("No time slots available for the selected tasks this week.");
        return;
      }

      // Step 2: Auto-approve the schedule
      const approveRes = await fetch("/api/schedule/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendations: generateData.schedule }),
      });

      const approveData = await approveRes.json();
      if (!approveRes.ok) {
        throw new Error(approveData.error || "Failed to approve schedule");
      }

      // Step 3: Refresh the calendar
      await fetchData();

      // Show success message - simple and clear
      const actuallyScheduled = approveData.results?.filter((r: { success: boolean }) => r.success).length || 0;
      const skippedAlreadyScheduled = approveData.results?.filter((r: { success: boolean; error?: string }) => !r.success && r.error === "Already scheduled on this date").length || 0;
      const totalAttempted = generateData.schedule?.length || 0;
      const conflicts = generateData.conflicts?.length || 0;

      let message = "";

      if (actuallyScheduled === 0 && totalAttempted === 0 && conflicts === 0) {
        // Nothing to schedule - all tasks already covered
        message = "All tasks are already scheduled for this week.";
      } else if (actuallyScheduled === 0 && skippedAlreadyScheduled > 0 && conflicts === 0) {
        // All proposed tasks were already scheduled
        message = "All tasks are already scheduled for this week.";
      } else if (actuallyScheduled === 0 && conflicts > 0 && totalAttempted === 0) {
        // Nothing was attempted but conflicts exist - likely all tasks need manual scheduling
        message = `${conflicts} task${conflicts !== 1 ? 's' : ''} need${conflicts === 1 ? 's' : ''} manual scheduling.`;
      } else {
        // Normal case: some scheduled, possibly some conflicts
        message = `${actuallyScheduled} task${actuallyScheduled !== 1 ? 's' : ''} scheduled successfully.`;
        if (conflicts > 0) {
          message += ` ${conflicts} need${conflicts === 1 ? 's' : ''} manual scheduling.`;
        }
      }

      if (message) {
        alert(message);
      }
    } catch (error) {
      console.error("Error optimizing week:", error);
      alert(error instanceof Error ? error.message : "Failed to optimize schedule");
    } finally {
      setIsOptimizing(false);
    }
  }

  // Filter tasks and events based on view mode
  const filteredScheduledTasks = useMemo(() => {
    if (viewMode === "personal") {
      return scheduledTasks.filter(task => task.assignedToUserId === currentUserId);
    }
    return scheduledTasks;
  }, [scheduledTasks, viewMode, currentUserId]);

  const filteredCalendarEvents = useMemo(() => {
    if (viewMode === "personal") {
      return calendarEvents.filter(event => event.isOwn !== false);
    }
    return calendarEvents;
  }, [calendarEvents, viewMode]);

  function checkForConflicts(day: Date, hour: number, minute: number, duration: number, excludeTaskId?: string): ConflictInfo {
    const startTime = setMinutes(setHours(day, hour), minute);
    const endTime = new Date(startTime.getTime() + duration * 60000);

    // Check calendar events (use filtered list based on view mode)
    for (const event of filteredCalendarEvents) {
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

    // Check scheduled tasks (use filtered list based on view mode)
    for (const task of filteredScheduledTasks) {
      // Skip the task being moved (don't conflict with itself)
      if (excludeTaskId && task.id === excludeTaskId) continue;

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

  async function scheduleTask(task: Task, day: Date, hour: number, minute: number = 0, recordOverlap: boolean = false) {
    const startTime = setMinutes(setHours(day, hour), minute);

    // Validate: cannot schedule in the past
    if (startTime < new Date()) {
      alert("Cannot schedule tasks in the past");
      return;
    }

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
        const data = await response.json();
        const newScheduledTask = data.scheduledTask;
        // Update state locally instead of refetching
        setScheduledTasks(prev => [...prev, {
          id: newScheduledTask.id,
          scheduledDate: newScheduledTask.scheduledDate,
          startTime: newScheduledTask.startTime,
          endTime: newScheduledTask.endTime,
          status: newScheduledTask.status,
          assignedToUserId: newScheduledTask.assignedToUserId || currentUserId,
          assignedTo: newScheduledTask.assignedTo || {
            id: currentUserId,
            name: null,
            image: null,
          },
          task: {
            id: task.id,
            name: task.name,
            type: task.type,
            duration: task.duration,
          },
        }]);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to schedule task");
      }
    } catch (error) {
      console.error("Error scheduling task:", error);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.task) {
      setActiveTask(data.task as Task);
      setActiveScheduledTask(null);
    } else if (data?.scheduledTask) {
      setActiveScheduledTask(data.scheduledTask as ScheduledTask);
      setActiveTask(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    setActiveScheduledTask(null);

    if (!event.over) return;

    const { day, hour, minute = 0 } = event.over.data.current as { day: Date; hour: number; minute?: number };
    const data = event.active.data.current;

    // Validate: cannot schedule in the past
    const targetTime = setMinutes(setHours(day, hour), minute);
    if (targetTime < new Date()) {
      alert("Cannot schedule tasks in the past");
      return;
    }

    // Handle rescheduling an existing scheduled task
    if (data?.scheduledTask) {
      const scheduledTask = data.scheduledTask as ScheduledTask;
      // Check for conflicts (exclude the task being moved)
      const conflict = checkForConflicts(day, hour, minute, scheduledTask.task.duration, scheduledTask.id);

      if (conflict.hasConflict) {
        setPendingSchedule({ scheduledTask, day, hour, minute, conflict });
        setConflictDialogOpen(true);
      } else {
        rescheduleTask(scheduledTask, day, hour, minute);
      }
      return;
    }

    // Handle scheduling a new task
    if (data?.task) {
      const task = data.task as Task;
      const conflict = checkForConflicts(day, hour, minute, task.duration);

      if (conflict.hasConflict) {
        setPendingSchedule({ task, day, hour, minute, conflict });
        setConflictDialogOpen(true);
      } else {
        scheduleTask(task, day, hour, minute);
      }
    }
  }

  async function rescheduleTask(scheduledTask: ScheduledTask, day: Date, hour: number, minute: number = 0) {
    const startTime = setMinutes(setHours(day, hour), minute);

    // Validate: cannot schedule in the past
    if (startTime < new Date()) {
      alert("Cannot schedule tasks in the past");
      return;
    }

    const endTime = new Date(startTime.getTime() + scheduledTask.task.duration * 60000);

    try {
      const response = await fetch(`/api/scheduled-tasks/${scheduledTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate: format(day, "yyyy-MM-dd"),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to reschedule task");
      }

      // Update state locally instead of refetching
      setScheduledTasks(prev => prev.map(st =>
        st.id === scheduledTask.id
          ? {
              ...st,
              scheduledDate: format(day, "yyyy-MM-dd"),
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
            }
          : st
      ));
    } catch (error) {
      console.error("Error rescheduling task:", error);
      alert("Failed to reschedule task");
    }
  }

  function handleConflictAccept() {
    if (pendingSchedule) {
      if (pendingSchedule.scheduledTask) {
        // Rescheduling an existing task
        rescheduleTask(pendingSchedule.scheduledTask, pendingSchedule.day, pendingSchedule.hour, pendingSchedule.minute);
      } else if (pendingSchedule.task) {
        // Scheduling a new task
        scheduleTask(pendingSchedule.task, pendingSchedule.day, pendingSchedule.hour, pendingSchedule.minute, true);
      }
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

      // Update state locally instead of refetching
      setScheduledTasks(prev => prev.map(st =>
        st.id === actionTask.id ? { ...st, status } : st
      ));

      if (status === "completed") {
        setFeedbackTask(actionTask);
        setFeedbackModalOpen(true);
      }
    } catch (error) {
      console.error("Error updating task:", error);
    }

    setActionTask(null);
    setActionDialogOpen(false);
  }

  function getItemsForDay(day: Date) {
    // Use filtered lists based on view mode
    const events = filteredCalendarEvents.filter((event) => {
      const eventStart = getEventStartTime(event);
      return isSameDay(eventStart, day);
    });

    const tasks = filteredScheduledTasks.filter((task) => {
      const taskStart = parseISO(task.startTime);
      return isSameDay(taskStart, day);
    });

    return { events, tasks };
  }

  // Reassignment function
  async function reassignTask(scheduledTaskId: string, newAssigneeId: string) {
    setReassigning(true);
    try {
      const response = await fetch(`/api/scheduled-tasks/${scheduledTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId: newAssigneeId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reassign task");
      }

      const result = await response.json();

      // Update local state
      const newAssignee = familyMembers.find(m => m.userId === newAssigneeId);
      setScheduledTasks(prev => prev.map(st =>
        st.id === scheduledTaskId
          ? {
              ...st,
              assignedToUserId: newAssigneeId,
              assignedTo: newAssignee
                ? { id: newAssignee.userId, name: newAssignee.name, image: newAssignee.image }
                : st.assignedTo,
            }
          : st
      ));

      setReassignDialogOpen(false);
      setTaskToReassign(null);

      // Check for reassignment patterns and show prompts
      if (result.reassignmentPatternInfo) {
        const info = result.reassignmentPatternInfo;
        if (info.shouldPromptDefaultChange) {
          setPatternInfo({
            taskId: result.taskId,
            taskName: result.task?.name || "this task",
            targetUserId: newAssigneeId,
            targetUserName: info.targetUserName || newAssignee?.name || "this person",
            reassignmentCount: info.reassignmentCount || 3,
          });
          setDefaultAssigneePromptOpen(true);
        } else if (info.shouldPromptOwnership) {
          setPatternInfo({
            taskId: result.taskId,
            taskName: result.task?.name || "this task",
            targetUserId: newAssigneeId,
            targetUserName: info.targetUserName || newAssignee?.name || "this person",
            reassignmentCount: info.reassignmentCount || 0,
          });
          setOwnershipPromptOpen(true);
        }
      }
    } catch (error) {
      console.error("Error reassigning task:", error);
      alert(error instanceof Error ? error.message : "Failed to reassign task");
    } finally {
      setReassigning(false);
    }
  }

  // Set default assignee for a task
  async function setDefaultAssignee(taskId: string, assigneeId: string) {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultAssigneeId: assigneeId }),
      });

      if (!response.ok) {
        throw new Error("Failed to update default assignee");
      }

      // Show success feedback
      alert("Default assignee updated! Future tasks will be assigned to this person automatically.");
    } catch (error) {
      console.error("Error setting default assignee:", error);
    }
  }

  function openReassignDialog(task: ScheduledTask) {
    setTaskToReassign(task);
    setReassignDialogOpen(true);
  }

  // Calculate position and height for a time-based item
  // Each hour = 60px, so each minute = 1px
  function getItemStyle(startTime: Date, durationMinutes: number) {
    const startHour = startTime.getHours();
    const startMinute = startTime.getMinutes();
    // Position relative to first hour shown (user's availableTimeStart)
    const topOffset = (startHour - availableTimeStart) * 60 + startMinute;
    const height = durationMinutes;
    return {
      top: `${topOffset}px`,
      height: `${Math.max(height, 15)}px`, // Minimum 15px height
    };
  }

  // Task creation/edit functions
  function resetForm() {
    setFormData(DEFAULT_FORM_DATA);
    setEditingTask(null);
  }

  function openEditDialog(task: Task) {
    setEditingTask(task);
    setFormData({
      name: task.name,
      type: task.type as "resolution" | "household",
      duration: task.duration,
      category: task.category || "",
      priority: task.priority,
      schedulingMode: (task.schedulingMode || "flexible") as "fixed" | "flexible",
      // Load saved scheduling preferences
      fixedDays: task.fixedDays || [],
      fixedTime: task.fixedTime || "",
      frequency: task.frequency || 1,
      frequencyPeriod: (task.frequencyPeriod || "week") as "day" | "week",
      preferredTimeStart: task.preferredTimeStart || "",
      preferredTimeEnd: task.preferredTimeEnd || "",
    });
    setCreateDialogOpen(true);
  }

  function toggleDay(day: string) {
    const current = formData.fixedDays;
    if (current.includes(day)) {
      setFormData({ ...formData, fixedDays: current.filter((d) => d !== day) });
    } else {
      setFormData({ ...formData, fixedDays: [...current, day] });
    }
  }

  async function handleSaveTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        duration: formData.duration,
        category: formData.category || null,
        priority: formData.priority,
        schedulingMode: formData.schedulingMode,
        isFlexible: formData.schedulingMode === "flexible",
      };

      if (formData.schedulingMode === "fixed") {
        payload.fixedDays = formData.fixedDays;
        payload.fixedTime = formData.fixedTime || null;
      } else {
        payload.frequency = formData.frequency;
        payload.frequencyPeriod = formData.frequencyPeriod;
        payload.preferredTimeStart = formData.preferredTimeStart || null;
        payload.preferredTimeEnd = formData.preferredTimeEnd || null;
      }

      const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
      const method = editingTask ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        // Handle both string errors and Zod validation error arrays
        const errorMessage = typeof data.error === "string"
          ? data.error
          : Array.isArray(data.error)
            ? data.error.map((e: { message?: string }) => e.message).join(", ")
            : "Failed to save task";
        throw new Error(errorMessage);
      }

      await fetchData();
      setCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving task:", error);
      alert(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  }

  async function handleQuickSchedule(task: Task) {
    setQuickScheduleTask(task);
    setQuickScheduleLoading(true);
    setQuickScheduleError(null);
    setQuickScheduleDialogOpen(true);

    try {
      const response = await fetch("/api/schedule/quick-find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, weekStart: format(weekStart, "yyyy-MM-dd") }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to find time slots");
      }

      if (data.options && data.options.length > 0) {
        setQuickScheduleOptions(data.options);
        setQuickScheduleInfo({
          slotsNeeded: data.slotsNeeded || data.options.length,
          foundSlots: data.foundSlots || data.options.length,
          alreadyScheduled: data.alreadyScheduled || 0,
          isFixedSchedule: data.isFixedSchedule || false,
          frequency: data.frequency || "1x weekly",
        });
      } else {
        setQuickScheduleError(data.message || "No available time slots found this week");
        setQuickScheduleOptions([]);
        setQuickScheduleInfo(null);
      }
    } catch (error) {
      console.error("Error finding time slots:", error);
      setQuickScheduleError(error instanceof Error ? error.message : "Failed to find time slots");
      setQuickScheduleOptions([]);
      setQuickScheduleInfo(null);
    } finally {
      setQuickScheduleLoading(false);
    }
  }

  // Schedule all the quick schedule slots at once
  async function handleQuickScheduleAll() {
    if (!quickScheduleTask || quickScheduleOptions.length === 0) return;

    setQuickScheduling(true);
    let successCount = 0;
    let errorCount = 0;

    for (const option of quickScheduleOptions) {
      // Validate: cannot schedule in the past
      const [year, month, day] = option.date.split("-").map(Number);
      const [hour, minute] = option.startTime.split(":").map(Number);
      const targetTime = new Date(year, month - 1, day, hour, minute);
      if (targetTime < new Date()) {
        errorCount++;
        continue;
      }

      try {
        const response = await fetch("/api/schedule/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: quickScheduleTask.id,
            date: option.date,
            startTime: option.startTime,
            endTime: option.endTime,
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    // Refresh and close
    await fetchData();
    setQuickScheduleDialogOpen(false);
    setQuickScheduleTask(null);
    setQuickScheduleOptions([]);
    setQuickScheduleInfo(null);
    setQuickScheduling(false);

    if (errorCount > 0) {
      alert(`Scheduled ${successCount} slot(s). ${errorCount} slot(s) could not be scheduled.`);
    }
  }

  async function handleQuickScheduleSelect(option: { date: string; startTime: string; endTime: string }) {
    if (!quickScheduleTask) return;

    // Validate: cannot schedule in the past
    const [year, month, day] = option.date.split("-").map(Number);
    const [hour, minute] = option.startTime.split(":").map(Number);
    const targetTime = new Date(year, month - 1, day, hour, minute);
    if (targetTime < new Date()) {
      alert("Cannot schedule tasks in the past");
      return;
    }

    try {
      const response = await fetch("/api/schedule/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: quickScheduleTask.id,
          date: option.date,
          startTime: option.startTime,
          endTime: option.endTime,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newScheduledTask = data.scheduledTask;
        setScheduledTasks(prev => [...prev, {
          id: newScheduledTask.id,
          scheduledDate: newScheduledTask.scheduledDate,
          startTime: newScheduledTask.startTime,
          endTime: newScheduledTask.endTime,
          status: newScheduledTask.status,
          assignedToUserId: newScheduledTask.assignedToUserId || currentUserId,
          assignedTo: newScheduledTask.assignedTo || {
            id: currentUserId,
            name: null,
            image: null,
          },
          task: {
            id: quickScheduleTask.id,
            name: quickScheduleTask.name,
            type: quickScheduleTask.type,
            duration: quickScheduleTask.duration,
          },
        }]);
        setQuickScheduleDialogOpen(false);
        setQuickScheduleTask(null);
        setQuickScheduleOptions([]);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to schedule task");
      }
    } catch (error) {
      console.error("Error scheduling task:", error);
      alert("Failed to schedule task");
    }
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
          <div className="flex items-start gap-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Schedule</h1>
              <p className="text-sm text-gray-600">
                Drag to schedule - AI warns you before you overbook
              </p>
            </div>
            <ScheduleInfoButton />
          </div>
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("family")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === "family"
                    ? "bg-white shadow text-blue-600 font-medium"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Users className="h-4 w-4" />
                Family
              </button>
              <button
                onClick={() => setViewMode("personal")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === "personal"
                    ? "bg-white shadow text-blue-600 font-medium"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <User className="h-4 w-4" />
                My Schedule
              </button>
            </div>
            {/* Week Navigation */}
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
            {/* Optimize My Week Button */}
            <Button
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={openOptimizeWeek}
              disabled={isOptimizing || loadingAvailableTime}
              size="sm"
            >
              {isOptimizing || loadingAvailableTime ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {loadingAvailableTime ? "Checking..." : "Optimizing..."}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Optimize My Week
                </>
              )}
            </Button>
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
                  <h2 className="font-semibold text-sm">
                    {sidebarView === "unscheduled" ? "Needs Scheduling" : "All Tasks"}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
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
                {/* View Toggle */}
                <div className="p-2 border-b">
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => setSidebarView("unscheduled")}
                      className={`flex-1 py-1.5 px-2 text-xs rounded flex items-center justify-center gap-1 ${
                        sidebarView === "unscheduled"
                          ? "bg-purple-100 text-purple-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <CalendarDays className="h-3 w-3" />
                      To Schedule
                    </button>
                    <button
                      onClick={() => setSidebarView("all")}
                      className={`flex-1 py-1.5 px-2 text-xs rounded flex items-center justify-center gap-1 ${
                        sidebarView === "all"
                          ? "bg-purple-100 text-purple-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <List className="h-3 w-3" />
                      All Tasks
                    </button>
                  </div>
                  {/* Type Filter */}
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
                  {sidebarView === "unscheduled" ? (
                    // Unscheduled tasks view (draggable)
                    unscheduledTasks.length > 0 ? (
                      unscheduledTasks.map((task) => (
                        <DraggableTask key={task.id} task={task} onQuickSchedule={handleQuickSchedule} />
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>Everything&apos;s scheduled!</p>
                        <p className="text-xs text-gray-400 mt-1">Time to focus on doing</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1"
                          onClick={() => setCreateDialogOpen(true)}
                        >
                          Add something new
                        </Button>
                      </div>
                    )
                  ) : (
                    // All tasks view (with edit/delete)
                    filteredTasks.length > 0 ? (
                      filteredTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow ${
                            task.type === "resolution" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-green-500"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{task.name}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
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
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditDialog(task)}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Edit"
                              >
                                <Edit className="h-3.5 w-3.5 text-gray-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        <List className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                        <p>No tasks yet</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1"
                          onClick={() => setCreateDialogOpen(true)}
                        >
                          Add your first task
                        </Button>
                      </div>
                    )
                  )}
                </div>

                {/* Footer info */}
                <div className="p-2 border-t text-xs text-gray-500 text-center">
                  {sidebarView === "unscheduled"
                    ? `${filteredScheduledTasks.length} time blocks protected this week`
                    : `${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''} total`
                  }
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
              <div className="grid grid-cols-8">
                {/* Time Labels Column */}
                <div className="bg-gray-50 border-r">
                  {hours.map((hour) => (
                    <div key={hour} className="h-[60px] p-1 text-xs text-gray-500 text-right pr-2 border-b">
                      {format(setHours(new Date(), hour), "h a")}
                    </div>
                  ))}
                </div>

                {/* Day Columns */}
                {weekDays.map((day) => {
                  const { events, tasks: dayTasks } = getItemsForDay(day);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={day.toISOString()}
                      className={`relative ${isToday ? "bg-blue-50/30" : ""}`}
                    >
                      {/* Hour rows with 15-min droppable zones */}
                      {hours.map((hour) => (
                        <div key={hour} className="h-[60px] border-b border-gray-100">
                          {[0, 15, 30, 45].map((minute) => (
                            <Droppable15MinSlot
                              key={`${hour}-${minute}`}
                              day={day}
                              hour={hour}
                              minute={minute}
                            />
                          ))}
                        </div>
                      ))}

                      {/* Calendar Events (Imported - positioned absolutely) */}
                      {events.map((event) => {
                        const eventStart = getEventStartTime(event);
                        const eventEnd = getEventEndTime(event);
                        const durationMinutes = Math.round((eventEnd.getTime() - eventStart.getTime()) / 60000);
                        const style = getItemStyle(eventStart, durationMinutes);
                        const isOtherMembersEvent = event.isOwn === false;

                        return (
                          <div
                            key={event.id}
                            className={`absolute left-0 right-0 mx-0.5 text-xs p-1 rounded overflow-hidden cursor-not-allowed z-10 ${
                              isOtherMembersEvent
                                ? "bg-gray-50 border-l-2 border-gray-300 opacity-75 border-dashed"
                                : "bg-gray-100 border-l-2 border-gray-400"
                            }`}
                            style={style}
                            title={`${event.summary}${isOtherMembersEvent && event.userName ? ` (${event.userName})` : ""} (Imported from calendar - cannot be moved)`}
                            onClick={() => setImportedEventWarning(true)}
                          >
                            {/* Show owner name for other family members' events */}
                            {isOtherMembersEvent && event.userName && (
                              <div className="text-[9px] font-semibold text-gray-400 truncate">
                                {event.userName.split(" ")[0]}
                              </div>
                            )}
                            <div className="font-medium truncate">{event.summary}</div>
                            {durationMinutes >= 30 && !isOtherMembersEvent && (
                              <div className="text-gray-500 text-[10px]">
                                {format(eventStart, "h:mm a")}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Scheduled Tasks (Draggable - positioned absolutely) */}
                      {dayTasks.map((scheduledTask) => {
                        const taskStart = parseISO(scheduledTask.startTime);
                        const style = getItemStyle(taskStart, scheduledTask.task.duration);

                        return (
                          <DraggableScheduledTaskPositioned
                            key={scheduledTask.id}
                            scheduledTask={scheduledTask}
                            style={style}
                            onComplete={() => initiateTaskAction(scheduledTask, "complete")}
                            onSkip={() => initiateTaskAction(scheduledTask, "skip")}
                            onReassign={() => openReassignDialog(scheduledTask)}
                            currentUserId={currentUserId}
                            viewMode={viewMode}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
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
                <Briefcase className="h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
        )}
        {activeScheduledTask && (
          <div className={`p-2 rounded-lg shadow-lg w-48 ${
            activeScheduledTask.task.type === "resolution"
              ? "bg-blue-100 border-2 border-blue-500"
              : "bg-green-100 border-2 border-green-500"
          }`}>
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-400" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm truncate block">{activeScheduledTask.task.name}</span>
                <span className="text-xs text-gray-500">{activeScheduledTask.task.duration} min</span>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>

      {/* Imported Event Warning Dialog */}
      <Dialog open={importedEventWarning} onOpenChange={setImportedEventWarning}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Imported Calendar Event
            </DialogTitle>
            <DialogDescription>
              This event was imported from your connected calendar (Google, Microsoft, or Apple) and cannot be moved or edited here.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            To reschedule this event, please update it directly in your calendar app.
          </p>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setImportedEventWarning(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enhanced Conflict Resolution Dialog */}
      <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Schedule Conflict Detected
            </DialogTitle>
            <DialogDescription>
              &quot;{pendingSchedule?.conflict.conflictingEvent}&quot; is already scheduled at{" "}
              {pendingSchedule?.conflict.conflictTime}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-600">
              {pendingSchedule?.scheduledTask ? "Moving" : "Scheduling"} &quot;{pendingSchedule?.task?.name || pendingSchedule?.scheduledTask?.task.name}&quot; here would create an overlap. How would you like to resolve this?
            </p>

            {/* Resolution Options */}
            <div className="space-y-2">
              {/* Option 1: Find Better Time */}
              <button
                onClick={handleConflictReject}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <CalendarClock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Find a better time</p>
                  <p className="text-xs text-gray-500">Cancel and choose a different slot</p>
                </div>
              </button>

              {/* Option 2: Double-book */}
              <button
                onClick={handleConflictAccept}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Schedule anyway (double-book)</p>
                  <p className="text-xs text-gray-500">AI will track this conflict for insights</p>
                </div>
              </button>

              {/* Option 3: Reassign (only for Life Admin tasks in family mode) */}
              {viewMode === "family" &&
                (pendingSchedule?.task?.type === "household" ||
                  pendingSchedule?.scheduledTask?.task.type === "household") &&
                familyMembers.filter(m => m.userId !== currentUserId).length > 0 && (
                <button
                  onClick={() => {
                    // Close conflict dialog and open reassign
                    setConflictDialogOpen(false);
                    if (pendingSchedule?.scheduledTask) {
                      openReassignDialog(pendingSchedule.scheduledTask);
                    } else if (pendingSchedule?.task) {
                      // For new tasks, we need to schedule first then reassign
                      // For now, just show info
                      alert("Schedule the task first, then reassign from the calendar.");
                    }
                    setPendingSchedule(null);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Reassign to family member</p>
                    <p className="text-xs text-gray-500">Let someone else handle this task</p>
                  </div>
                </button>
              )}

              {/* Option 4: Delete the task */}
              {(pendingSchedule?.task || pendingSchedule?.scheduledTask) && (
                <button
                  onClick={async () => {
                    const taskId = pendingSchedule?.task?.id || pendingSchedule?.scheduledTask?.task.id;
                    if (taskId && confirm("Are you sure you want to delete this task?")) {
                      try {
                        const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
                        if (res.ok) {
                          setTasks(prev => prev.filter(t => t.id !== taskId));
                          setScheduledTasks(prev => prev.filter(st => st.task.id !== taskId));
                        }
                      } catch (error) {
                        console.error("Error deleting task:", error);
                      }
                    }
                    setConflictDialogOpen(false);
                    setPendingSchedule(null);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Delete this task</p>
                    <p className="text-xs text-gray-500">Remove the task entirely</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Creation/Edit Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "Add to Your Schedule"}</DialogTitle>
            <DialogDescription>
              What do you need time for? AI will help find the best slot.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTask} className="space-y-5 mt-4">
            {/* Task Name */}
            <div className="space-y-2">
              <Label htmlFor="name">What needs scheduling?</Label>
              <Input
                id="name"
                placeholder="e.g., Deep work on project, Gym session, Weekly planning"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {/* Type Selection */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "resolution", category: "" })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    formData.type === "resolution"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Focus Time</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Goals, habits, deep work
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: "household", category: "" })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    formData.type === "household"
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Life Admin</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Errands, chores, appointments
                  </p>
                </button>
              </div>
            </div>

            {/* Category & Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES[formData.type].map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration</Label>
                <Select
                  value={formData.duration.toString()}
                  onValueChange={(value) => setFormData({ ...formData, duration: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="90">1.5 hours</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={formData.priority.toString()}
                onValueChange={(value) => setFormData({ ...formData, priority: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">High - Must happen</SelectItem>
                  <SelectItem value="2">Medium-High</SelectItem>
                  <SelectItem value="3">Medium - Flexible</SelectItem>
                  <SelectItem value="4">Low - If time permits</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scheduling Mode */}
            <div className="space-y-3">
              <Label>How should AI schedule this?</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, schedulingMode: "flexible" })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    formData.schedulingMode === "flexible"
                      ? "border-purple-500 bg-purple-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarClock className="h-4 w-4 text-purple-600" />
                    <span className="font-medium text-sm">AI Finds Time</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Flexible - fit around your calendar
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, schedulingMode: "fixed" })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    formData.schedulingMode === "fixed"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">Fixed Time</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Same time every week
                  </p>
                </button>
              </div>
            </div>

            {/* Fixed Schedule Options */}
            {formData.schedulingMode === "fixed" && (
              <div className="space-y-3 p-3 bg-blue-50 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-sm">Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          formData.fixedDays.includes(day.value)
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fixedTime" className="text-sm">Time</Label>
                  <Input
                    id="fixedTime"
                    type="time"
                    value={formData.fixedTime}
                    onChange={(e) => setFormData({ ...formData, fixedTime: e.target.value })}
                    className="w-32"
                  />
                </div>
              </div>
            )}

            {/* Flexible Schedule Options */}
            {formData.schedulingMode === "flexible" && (
              <div className="space-y-3 p-3 bg-purple-50 rounded-lg">
                <div className="space-y-2">
                  <Label className="text-sm">Frequency</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={14}
                      value={formData.frequency}
                      onChange={(e) => setFormData({ ...formData, frequency: parseInt(e.target.value) || 1 })}
                      className="w-16"
                    />
                    <span className="text-sm text-gray-600">times per</span>
                    <Select
                      value={formData.frequencyPeriod}
                      onValueChange={(value: "day" | "week") => setFormData({ ...formData, frequencyPeriod: value })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">week</SelectItem>
                        <SelectItem value="day">day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Preferred time window (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={formData.preferredTimeStart}
                      onChange={(e) => setFormData({ ...formData, preferredTimeStart: e.target.value })}
                      className="w-28"
                    />
                    <span className="text-gray-500">to</span>
                    <Input
                      type="time"
                      value={formData.preferredTimeEnd}
                      onChange={(e) => setFormData({ ...formData, preferredTimeEnd: e.target.value })}
                      className="w-28"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingTask ? "Saving..." : "Adding..."}
                  </>
                ) : (
                  editingTask ? "Save Changes" : "Add to Schedule"
                )}
              </Button>
            </div>
          </form>
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

      {/* Reassignment Dialog */}
      <Dialog open={reassignDialogOpen} onOpenChange={setReassignDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-purple-500" />
              Reassign Task
            </DialogTitle>
            <DialogDescription>
              Reassign &quot;{taskToReassign?.task.name}&quot; to another family member.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-sm font-medium mb-3 block">Select family member:</Label>
            <div className="space-y-2">
              {familyMembers
                .filter(member => member.userId !== currentUserId)
                .map((member) => (
                  <button
                    key={member.userId}
                    onClick={() => taskToReassign && reassignTask(taskToReassign.id, member.userId)}
                    disabled={reassigning}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                      {member.image ? (
                        <img src={member.image} alt={member.name || ""} className="w-8 h-8 rounded-full" />
                      ) : (
                        <User className="h-4 w-4 text-purple-600" />
                      )}
                    </div>
                    <span className="font-medium">{member.name || "Family Member"}</span>
                    {reassigning && (
                      <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                    )}
                  </button>
                ))}
              {familyMembers.filter(m => m.userId !== currentUserId).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No other family members to reassign to. Invite family members from Settings.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setReassignDialogOpen(false);
                setTaskToReassign(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Default Assignee Learning Prompt */}
      <Dialog open={defaultAssigneePromptOpen} onOpenChange={setDefaultAssigneePromptOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              AI Learned a Pattern
            </DialogTitle>
            <DialogDescription>
              You&apos;ve reassigned &quot;{patternInfo?.taskName}&quot; to {patternInfo?.targetUserName} {patternInfo?.reassignmentCount} times.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Would you like to make {patternInfo?.targetUserName} the default owner for this task?
              Future instances will be automatically assigned to them.
            </p>
            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
              <strong>Tip:</strong> You can always reassign individual tasks later if needed.
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setDefaultAssigneePromptOpen(false);
                setPatternInfo(null);
              }}
            >
              No, Keep Current
            </Button>
            <Button
              onClick={() => {
                if (patternInfo) {
                  setDefaultAssignee(patternInfo.taskId, patternInfo.targetUserId);
                }
                setDefaultAssigneePromptOpen(false);
                setPatternInfo(null);
              }}
            >
              Yes, Set as Default
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ownership Ping-Pong Prompt */}
      <Dialog open={ownershipPromptOpen} onOpenChange={setOwnershipPromptOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Task Ownership Unclear
            </DialogTitle>
            <DialogDescription>
              This task has been passed back and forth multiple times.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              It looks like there&apos;s uncertainty about who should own &quot;{patternInfo?.taskName}&quot;.
              Would you like to have a quick conversation with your family member to decide who should be responsible for this task?
            </p>
            <div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-700">
              <strong>Suggestion:</strong> Clear ownership helps reduce mental load for both of you.
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setOwnershipPromptOpen(false);
                setPatternInfo(null);
              }}
            >
              Dismiss
            </Button>
            <Button
              onClick={() => {
                if (patternInfo) {
                  setDefaultAssignee(patternInfo.taskId, patternInfo.targetUserId);
                }
                setOwnershipPromptOpen(false);
                setPatternInfo(null);
              }}
            >
              Assign to {patternInfo?.targetUserName}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Schedule Dialog */}
      <Dialog open={quickScheduleDialogOpen} onOpenChange={(open) => {
        setQuickScheduleDialogOpen(open);
        if (!open) {
          setQuickScheduleTask(null);
          setQuickScheduleOptions([]);
          setQuickScheduleError(null);
          setQuickScheduleInfo(null);
        }
      }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Quick Schedule
            </DialogTitle>
            <DialogDescription>
              {quickScheduleTask && (
                <span className="flex flex-col gap-1">
                  <span>Schedule &quot;{quickScheduleTask.name}&quot;</span>
                  {quickScheduleInfo && (
                    <span className="text-xs">
                      {quickScheduleInfo.isFixedSchedule ? "Fixed schedule" : quickScheduleInfo.frequency}
                      {quickScheduleInfo.alreadyScheduled > 0 && ` • ${quickScheduleInfo.alreadyScheduled} already scheduled`}
                    </span>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {quickScheduleLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-3" />
                <p className="text-sm text-gray-500">Finding the best time slots...</p>
              </div>
            ) : quickScheduleError ? (
              <div className="text-center py-6">
                <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
                <p className="text-sm text-gray-600">{quickScheduleError}</p>
                <p className="text-xs text-gray-400 mt-2">
                  Try adjusting your work schedule or clearing some time blocks in Settings.
                </p>
              </div>
            ) : quickScheduleOptions.length > 0 ? (
              <div className="space-y-3">
                {quickScheduleInfo && quickScheduleOptions.length > 1 && (
                  <div className="text-sm text-gray-600 bg-purple-50 p-2 rounded-lg text-center">
                    Found {quickScheduleOptions.length} slot{quickScheduleOptions.length > 1 ? "s" : ""} to schedule
                  </div>
                )}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {quickScheduleOptions.map((option, index) => (
                    <div
                      key={`${option.date}-${option.startTime}`}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white"
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-100">
                        <CalendarClock className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">
                          {option.dayName}, {format(parseISO(option.date), "MMM d")}
                        </p>
                        <p className="text-xs text-gray-500">
                          {option.startTime} - {option.endTime}
                        </p>
                      </div>
                      {quickScheduleOptions.length === 1 && (
                        <Badge className="bg-purple-500 text-white text-xs">Best</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQuickScheduleDialogOpen(false);
                setQuickScheduleTask(null);
                setQuickScheduleOptions([]);
                setQuickScheduleError(null);
                setQuickScheduleInfo(null);
              }}
            >
              Cancel
            </Button>
            {quickScheduleOptions.length > 0 && (
              <Button
                onClick={handleQuickScheduleAll}
                disabled={quickScheduling}
                className="bg-gradient-to-r from-blue-600 to-purple-600"
              >
                {quickScheduling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Schedule {quickScheduleOptions.length > 1 ? `All ${quickScheduleOptions.length}` : ""}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Optimize My Week Task Selection Dialog */}
      <Dialog open={optimizeDialogOpen} onOpenChange={setOptimizeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Optimize My Week
            </DialogTitle>
            <DialogDescription>
              Not enough time for all tasks. Select which ones to prioritize.
            </DialogDescription>
          </DialogHeader>

          {loadingAvailableTime ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : availableTimeData ? (
            <div className="space-y-4">
              {/* Available Time Summary */}
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-sm">Available Time</p>
                    <p className="text-xs text-gray-500">{availableTimeData.daysRemaining} days remaining</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-blue-600">
                  {availableTimeData.availableHours}h
                </p>
              </div>

              {/* Selected vs Available */}
              <div className="flex items-center justify-between text-sm">
                <span>Selected tasks duration:</span>
                <span className={`font-medium ${
                  selectedTasksDuration > availableTimeData.availableMinutes
                    ? "text-red-600"
                    : "text-green-600"
                }`}>
                  {Math.round(selectedTasksDuration / 60 * 10) / 10}h / {availableTimeData.availableHours}h
                </span>
              </div>

              {selectedTasksDuration > availableTimeData.availableMinutes && (
                <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded text-xs text-yellow-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  Selected tasks exceed available time. Some may not fit.
                </div>
              )}

              {/* Task List */}
              <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                {availableTimeData.unscheduledTasks.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No unscheduled tasks. Add tasks first.
                  </div>
                ) : (
                  availableTimeData.unscheduledTasks.map((task) => (
                    <label
                      key={task.id}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTaskIds.has(task.id)}
                        onCheckedChange={(checked) => {
                          setSelectedTaskIds((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(task.id);
                            } else {
                              next.delete(task.id);
                            }
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{task.name}</p>
                        <p className="text-xs text-gray-500">
                          {task.duration} min • {task.type === "resolution" ? "Focus Time" : "Life Admin"}
                        </p>
                      </div>
                      {task.type === "resolution" ? (
                        <Target className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Home className="h-4 w-4 text-green-500 flex-shrink-0" />
                      )}
                    </label>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTaskIds(new Set(availableTimeData.unscheduledTasks.map((t) => t.id)))}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTaskIds(new Set())}
                  >
                    Clear
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOptimizeDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => optimizeWeek(Array.from(selectedTaskIds))}
                    disabled={selectedTaskIds.size === 0 || isOptimizing}
                    className="bg-gradient-to-r from-blue-600 to-purple-600"
                  >
                    {isOptimizing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Optimize ({selectedTaskIds.size} tasks)
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Failed to load available time data
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function ScheduleInfoButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Page information"
      >
        <Info className="h-5 w-5 text-gray-400 hover:text-gray-600" />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-10 z-50 w-80 p-4 bg-white rounded-lg shadow-lg border border-gray-200">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900">What you can do here</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-0.5 rounded hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <Plus className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <span><strong>Add tasks</strong> - Create Focus Time or Life Admin tasks</span>
              </li>
              <li className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <span><strong>Drag & drop</strong> - Drag tasks from sidebar or move scheduled tasks to different slots</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <span><strong>Conflict detection</strong> - AI warns you before double-booking</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span><strong>Mark complete</strong> - Click tasks to mark done or skip</span>
              </li>
              <li className="flex items-start gap-2">
                <Target className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                <span><strong>Give feedback</strong> - Help AI learn your preferences</span>
              </li>
              <li className="flex items-start gap-2">
                <CalendarIcon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <span><strong>Grey events</strong> - Imported from your calendar (Google/Microsoft/Apple) - these cannot be moved here</span>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
