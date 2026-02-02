"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Target, Home, Plus, Trash2, Edit, Loader2, Clock, Calendar, Repeat, CalendarClock } from "lucide-react";
import { useRegisterPageContext } from "@/contexts/AIAssistantContext";

const CATEGORIES = {
  resolution: ["Fitness", "Learning", "Reading", "Meditation", "Hobbies", "Health", "Other"],
  household: ["Cleaning", "Cooking", "Shopping", "Childcare", "Errands", "Maintenance", "Other"],
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
  isFlexible: boolean;
  category: string | null;
  priority: number;
  schedulingMode: string;
  fixedDays: string[];
  fixedTime: string | null;
  frequency: number | null;
  frequencyPeriod: string | null;
  requiredDays: string[];
  preferredDays: string[];
  preferredTimeStart: string | null;
  preferredTimeEnd: string | null;
  minDuration: number | null;
  maxDuration: number | null;
}

interface FormData {
  name: string;
  type: "resolution" | "household";
  duration: number;
  category: string;
  priority: number;
  schedulingMode: "fixed" | "flexible";
  // Fixed schedule
  fixedDays: string[];
  fixedTime: string;
  // Flexible schedule
  frequency: number;
  frequencyPeriod: "day" | "week";
  requiredDays: string[];
  preferredDays: string[];
  preferredTimeStart: string;
  preferredTimeEnd: string;
  minDuration: number;
  maxDuration: number;
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
  requiredDays: [],
  preferredDays: [],
  preferredTimeStart: "",
  preferredTimeEnd: "",
  minDuration: 30,
  maxDuration: 60,
};

export default function TasksPage() {
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get("type");
  const resolutionRef = useRef<HTMLDivElement>(null);
  const householdRef = useRef<HTMLDivElement>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);

  // Register page context for AI assistant
  useRegisterPageContext("/tasks", "Tasks", {
    totalTasks: tasks.length,
    resolutionTasks: tasks.filter((t) => t.type === "resolution").length,
    householdTasks: tasks.filter((t) => t.type === "household").length,
  }, [
    "Which tasks need scheduling?",
    "Schedule all my unscheduled tasks",
    "Add a new task for meditation",
  ]);

  useEffect(() => {
    fetchTasks();
  }, []);

  // Scroll to the appropriate section based on URL parameter
  useEffect(() => {
    if (!loading && typeFilter) {
      const ref = typeFilter === "resolution" ? resolutionRef : householdRef;
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
        ref.current.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
        setTimeout(() => {
          ref.current?.classList.remove("ring-2", "ring-blue-500", "ring-offset-2");
        }, 2000);
      }
    }
  }, [loading, typeFilter]);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  }

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
      fixedDays: task.fixedDays || [],
      fixedTime: task.fixedTime || "",
      frequency: task.frequency || 1,
      frequencyPeriod: (task.frequencyPeriod || "week") as "day" | "week",
      requiredDays: task.requiredDays || [],
      preferredDays: task.preferredDays || [],
      preferredTimeStart: task.preferredTimeStart || "",
      preferredTimeEnd: task.preferredTimeEnd || "",
      minDuration: task.minDuration || task.duration,
      maxDuration: task.maxDuration || task.duration,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
      const method = editingTask ? "PATCH" : "POST";

      // Build the payload based on scheduling mode
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
        payload.requiredDays = formData.requiredDays;
        payload.preferredDays = formData.preferredDays;
        payload.preferredTimeStart = formData.preferredTimeStart || null;
        payload.preferredTimeEnd = formData.preferredTimeEnd || null;
        payload.minDuration = formData.minDuration;
        payload.maxDuration = formData.maxDuration;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save task");
      }

      await fetchTasks();
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving task:", error);
      alert(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Are you sure you want to delete this task?")) return;

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTasks(tasks.filter((t) => t.id !== id));
      }
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  }

  function toggleDay(day: string, field: "fixedDays" | "requiredDays" | "preferredDays") {
    const current = formData[field];
    if (current.includes(day)) {
      setFormData({ ...formData, [field]: current.filter((d) => d !== day) });
    } else {
      setFormData({ ...formData, [field]: [...current, day] });
    }
  }

  const resolutionTasks = tasks.filter((t) => t.type === "resolution");
  const householdTasks = tasks.filter((t) => t.type === "household");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Tasks</h1>
          <p className="text-gray-600 mt-1">
            Manage your New Year resolutions and household responsibilities
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Plus className="mr-2 h-4 w-4" />
              Add New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
              <DialogDescription>
                {editingTask
                  ? "Update your task details below."
                  : "Add a new resolution or household task to track."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Task Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Go to the gym, Grocery shopping"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: "resolution" | "household") =>
                        setFormData({ ...formData, type: value, category: "" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolution">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-blue-600" />
                            Resolution
                          </div>
                        </SelectItem>
                        <SelectItem value="household">
                          <div className="flex items-center gap-2">
                            <Home className="h-4 w-4 text-green-600" />
                            Household
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority.toString()}
                    onValueChange={(value) =>
                      setFormData({ ...formData, priority: parseInt(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">High (Must do)</SelectItem>
                      <SelectItem value="2">Medium-High</SelectItem>
                      <SelectItem value="3">Medium</SelectItem>
                      <SelectItem value="4">Low (If time permits)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Scheduling Mode */}
              <div className="space-y-4 border-t pt-4">
                <Label className="text-base font-semibold">Scheduling</Label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, schedulingMode: "fixed" })}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.schedulingMode === "fixed"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Fixed Schedule</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Same time every week (e.g., school pickup)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, schedulingMode: "flexible" })}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      formData.schedulingMode === "flexible"
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarClock className="h-4 w-4 text-purple-600" />
                      <span className="font-medium">Flexible Schedule</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      AI finds the best time (e.g., gym sessions)
                    </p>
                  </button>
                </div>

                {/* Fixed Schedule Options */}
                {formData.schedulingMode === "fixed" && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                    <div className="space-y-2">
                      <Label>Days of Week</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value, "fixedDays")}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fixedTime">Time</Label>
                        <Input
                          id="fixedTime"
                          type="time"
                          value={formData.fixedTime}
                          onChange={(e) => setFormData({ ...formData, fixedTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="duration">Duration (minutes)</Label>
                        <Input
                          id="duration"
                          type="number"
                          min={5}
                          max={480}
                          value={formData.duration}
                          onChange={(e) =>
                            setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Flexible Schedule Options */}
                {formData.schedulingMode === "flexible" && (
                  <div className="space-y-4 p-4 bg-purple-50 rounded-lg">
                    {/* Frequency */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Frequency</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={14}
                            value={formData.frequency}
                            onChange={(e) =>
                              setFormData({ ...formData, frequency: parseInt(e.target.value) || 1 })
                            }
                            className="w-20"
                          />
                          <span className="text-sm text-gray-600">times per</span>
                          <Select
                            value={formData.frequencyPeriod}
                            onValueChange={(value: "day" | "week") =>
                              setFormData({ ...formData, frequencyPeriod: value })
                            }
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
                    </div>

                    {/* Required Days (only available on these days) */}
                    <div className="space-y-2">
                      <Label>
                        Required Days{" "}
                        <span className="font-normal text-gray-500">(only available on these days)</span>
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value, "requiredDays")}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              formData.requiredDays.includes(day.value)
                                ? "bg-purple-600 text-white"
                                : "bg-white text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">
                        Leave empty if task can be scheduled any day
                      </p>
                    </div>

                    {/* Preferred Days */}
                    <div className="space-y-2">
                      <Label>
                        Preferred Days{" "}
                        <span className="font-normal text-gray-500">(soft preference)</span>
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value, "preferredDays")}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              formData.preferredDays.includes(day.value)
                                ? "bg-purple-400 text-white"
                                : "bg-white text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Preferred Time Window */}
                    <div className="space-y-2">
                      <Label>Preferred Time Window</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={formData.preferredTimeStart}
                          onChange={(e) =>
                            setFormData({ ...formData, preferredTimeStart: e.target.value })
                          }
                          className="w-32"
                        />
                        <span className="text-gray-500">to</span>
                        <Input
                          type="time"
                          value={formData.preferredTimeEnd}
                          onChange={(e) =>
                            setFormData({ ...formData, preferredTimeEnd: e.target.value })
                          }
                          className="w-32"
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Leave empty for any time of day
                      </p>
                    </div>

                    {/* Duration Range */}
                    <div className="space-y-2">
                      <Label>Duration Range (minutes)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={5}
                          max={480}
                          value={formData.minDuration}
                          onChange={(e) =>
                            setFormData({ ...formData, minDuration: parseInt(e.target.value) || 15 })
                          }
                          className="w-20"
                          placeholder="Min"
                        />
                        <span className="text-gray-500">to</span>
                        <Input
                          type="number"
                          min={5}
                          max={480}
                          value={formData.maxDuration}
                          onChange={(e) =>
                            setFormData({ ...formData, maxDuration: parseInt(e.target.value) || 60 })
                          }
                          className="w-20"
                          placeholder="Max"
                        />
                        <span className="text-sm text-gray-500">minutes</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        AI will adjust duration based on availability
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : editingTask ? (
                    "Update Task"
                  ) : (
                    "Add Task"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Resolution Tasks */}
        <Card ref={resolutionRef} className="transition-all duration-300">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-600" />
              <CardTitle>New Year Resolutions</CardTitle>
            </div>
            <CardDescription>
              Your personal goals and self-improvement tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resolutionTasks.length > 0 ? (
              <div className="space-y-3">
                {resolutionTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onEdit={openEditDialog}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No resolutions yet</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => {
                    setFormData({ ...DEFAULT_FORM_DATA, type: "resolution" });
                    setDialogOpen(true);
                  }}
                >
                  Add your first resolution
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Household Tasks */}
        <Card ref={householdRef} className="transition-all duration-300">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-green-600" />
              <CardTitle>Household Tasks</CardTitle>
            </div>
            <CardDescription>
              Chores and family responsibilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {householdTasks.length > 0 ? (
              <div className="space-y-3">
                {householdTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onEdit={openEditDialog}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Home className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No household tasks yet</p>
                <Button
                  variant="link"
                  className="mt-2"
                  onClick={() => {
                    setFormData({ ...DEFAULT_FORM_DATA, type: "household" });
                    setDialogOpen(true);
                  }}
                >
                  Add your first household task
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onEdit,
  onDelete,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const priorityColors = {
    1: "bg-red-100 text-red-700",
    2: "bg-orange-100 text-orange-700",
    3: "bg-blue-100 text-blue-700",
    4: "bg-gray-100 text-gray-700",
  };

  const getScheduleDisplay = () => {
    if (task.schedulingMode === "fixed") {
      const days = task.fixedDays?.length > 0
        ? task.fixedDays.map(d => d.charAt(0).toUpperCase() + d.slice(0, 2)).join(", ")
        : "Not set";
      const time = task.fixedTime || "";
      return `Fixed: ${days}${time ? ` at ${time}` : ""}`;
    } else {
      const freq = task.frequency || 1;
      const period = task.frequencyPeriod || "week";
      return `Flexible: ${freq}x/${period}`;
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-medium truncate">{task.name}</p>
          {task.category && (
            <Badge variant="outline" className="text-xs">
              {task.category}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {task.minDuration && task.maxDuration && task.minDuration !== task.maxDuration
              ? `${task.minDuration}-${task.maxDuration} min`
              : `${task.duration} min`}
          </span>
          <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
            P{task.priority}
          </Badge>
          <span className="flex items-center gap-1 text-xs">
            {task.schedulingMode === "fixed" ? (
              <Calendar className="h-3 w-3" />
            ) : (
              <Repeat className="h-3 w-3" />
            )}
            {getScheduleDisplay()}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Button variant="ghost" size="icon" onClick={() => onEdit(task)}>
          <Edit className="h-4 w-4 text-gray-500" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(task.id)}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  );
}
