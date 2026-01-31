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
import { Target, Home, Plus, Trash2, Edit, Loader2, Clock } from "lucide-react";
import { Task } from "@prisma/client";

const CATEGORIES = {
  resolution: ["Fitness", "Learning", "Reading", "Meditation", "Hobbies", "Health", "Other"],
  household: ["Cleaning", "Cooking", "Shopping", "Childcare", "Errands", "Maintenance", "Other"],
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

  const [formData, setFormData] = useState({
    name: "",
    type: "resolution" as "resolution" | "household",
    duration: 30,
    isFlexible: true,
    category: "",
    priority: 3,
  });

  useEffect(() => {
    fetchTasks();
  }, []);

  // Scroll to the appropriate section based on URL parameter
  useEffect(() => {
    if (!loading && typeFilter) {
      const ref = typeFilter === "resolution" ? resolutionRef : householdRef;
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
        // Add a highlight effect
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
    setFormData({
      name: "",
      type: "resolution",
      duration: 30,
      isFlexible: true,
      category: "",
      priority: 3,
    });
    setEditingTask(null);
  }

  function openEditDialog(task: Task) {
    setEditingTask(task);
    setFormData({
      name: task.name,
      type: task.type as "resolution" | "household",
      duration: task.duration,
      isFlexible: task.isFlexible,
      category: task.category || "",
      priority: task.priority,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingTask ? `/api/tasks/${editingTask.id}` : "/api/tasks";
      const method = editingTask ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
              <DialogDescription>
                {editingTask
                  ? "Update your task details below."
                  : "Add a new resolution or household task to track."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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

              <div className="grid grid-cols-2 gap-4">
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
                    required
                  />
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

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isFlexible"
                  checked={formData.isFlexible}
                  onChange={(e) => setFormData({ ...formData, isFlexible: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isFlexible" className="text-sm font-normal">
                  Flexible timing (can be scheduled at any available time)
                </Label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
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
                    setFormData({ ...formData, type: "resolution" });
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
                    setFormData({ ...formData, type: "household" });
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
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {task.duration} min
          </span>
          <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
            P{task.priority}
          </Badge>
          {!task.isFlexible && (
            <Badge variant="secondary" className="text-xs">
              Fixed time
            </Badge>
          )}
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
