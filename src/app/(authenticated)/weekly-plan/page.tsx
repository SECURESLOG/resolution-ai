"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Sparkles,
  AlertCircle,
  Loader2,
  Pencil,
  Users,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRegisterPageContext } from "@/contexts/AIAssistantContext";

interface PlanItem {
  id: string;
  task: {
    id: string;
    name: string;
    type: string;
    duration: number;
    category: string | null;
  };
  assignedTo: {
    id: string;
    name: string | null;
    image: string | null;
  };
  scheduledDate: string;
  startTime: string;
  endTime: string;
  aiReasoning: string | null;
  version?: number;
  lastEditedBy?: { id: string; name: string } | null;
  lastEditedAt?: string | null;
}

interface ApprovalStatus {
  userId: string;
  userName: string | null;
  userImage: string | null;
  status: "pending" | "approved" | "rejected";
  approvedAt: string | null;
  rejectedAt: string | null;
  comment: string | null;
}

interface ApprovalSummary {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  isFullyApproved: boolean;
  hasRejection: boolean;
}

interface WeeklyPlan {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  aiReasoning: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  items: PlanItem[];
  approvalStatus?: ApprovalStatus[];
  approvalSummary?: ApprovalSummary;
  currentUserApproval?: ApprovalStatus;
}

interface FamilyMember {
  userId: string;
  name: string | null;
  image: string | null;
}

export default function WeeklyPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit modal state
  const [editingItem, setEditingItem] = useState<PlanItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [editForm, setEditForm] = useState({
    assignedToUserId: "",
    scheduledDate: "",
    startTime: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Register page context for AI assistant
  useRegisterPageContext("/weekly-plan", "Weekly Plan", {
    planStatus: plan?.status,
    itemsCount: plan?.items?.length || 0,
    approvalSummary: plan?.approvalSummary,
  });

  useEffect(() => {
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/weekly-plan");
      const data = await response.json();

      if (response.ok) {
        setPlan(data.plan);
      } else {
        setError(data.error || "Failed to fetch plan");
      }
    } catch {
      setError("Failed to load weekly plan");
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async (week: "current" | "next") => {
    try {
      setGenerating(true);
      setError(null);
      const response = await fetch("/api/weekly-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      });

      const data = await response.json();

      if (response.ok) {
        await fetchPlan();
      } else {
        setError(data.error || "Failed to generate plan");
      }
    } catch {
      setError("Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (action: "approve" | "reject") => {
    if (!plan) return;

    try {
      setActionLoading(true);
      setError(null);
      const response = await fetch("/api/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, action }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(data.message);
        await fetchPlan();

        // Only redirect if plan is fully approved
        if (data.planStatus === "approved") {
          setTimeout(() => router.push("/calendar"), 2000);
        }
      } else {
        setError(data.error || "Failed to process action");
      }
    } catch {
      setError("Failed to process action");
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = async (item: PlanItem) => {
    try {
      // Fetch item details with family members
      const response = await fetch(`/api/weekly-plan/items/${item.id}`);
      const data = await response.json();

      if (response.ok) {
        setFamilyMembers(data.familyMembers);
        setEditingItem(item);
        setEditForm({
          assignedToUserId: item.assignedTo.id,
          scheduledDate: format(parseISO(item.scheduledDate), "yyyy-MM-dd"),
          startTime: format(parseISO(item.startTime), "HH:mm"),
        });
        setConflictError(null);
        setEditModalOpen(true);
      }
    } catch {
      setError("Failed to load task details");
    }
  };

  const handleEditSubmit = async () => {
    if (!editingItem) return;

    try {
      setEditLoading(true);
      setConflictError(null);

      const response = await fetch(`/api/weekly-plan/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedToUserId: editForm.assignedToUserId,
          scheduledDate: new Date(editForm.scheduledDate).toISOString(),
          startTime: new Date(
            `${editForm.scheduledDate}T${editForm.startTime}:00`
          ).toISOString(),
          expectedVersion: editingItem.version,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // Conflict detected
        setConflictError(data.message);
        return;
      }

      if (response.ok) {
        setSuccessMessage(data.message);
        setEditModalOpen(false);
        setEditingItem(null);
        await fetchPlan();
      } else {
        setError(data.error || "Failed to update task");
      }
    } catch {
      setError("Failed to update task");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Remove this task from the plan?")) return;

    try {
      const response = await fetch(`/api/weekly-plan/items/${itemId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage(data.message);
        await fetchPlan();
      } else {
        setError(data.error || "Failed to remove task");
      }
    } catch {
      setError("Failed to remove task");
    }
  };

  // Group items by day (filter out any with null task/assignedTo)
  const validItems = plan?.items.filter((item) => item.task && item.assignedTo) || [];
  const itemsByDay = validItems.reduce(
    (acc, item) => {
      const day = format(parseISO(item.scheduledDate), "yyyy-MM-dd");
      if (!acc[day]) acc[day] = [];
      acc[day].push(item);
      return acc;
    },
    {} as Record<string, PlanItem[]>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
        <Button onClick={fetchPlan} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Plan</h1>
          <p className="text-gray-600 mt-1">
            Review and approve your AI-generated weekly schedule.
          </p>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Plan Available</h3>
            <p className="text-gray-600 max-w-md mx-auto mb-6">
              A new weekly plan will be generated every Sunday at 6:00 PM. Or you can generate one
              now.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => generatePlan("current")} disabled={generating}>
                {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generate for This Week
              </Button>
              <Button onClick={() => generatePlan("next")} disabled={generating}>
                {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Sparkles className="h-4 w-4 mr-2" />
                Generate for Next Week
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800",
    pending_approval: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    expired: "bg-gray-100 text-gray-800",
  };

  const statusLabels: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Pending Approval",
    approved: "Approved",
    rejected: "Rejected",
    expired: "Expired",
  };

  const canEdit = ["draft", "pending_approval"].includes(plan.status);
  const hasApproved = plan.currentUserApproval?.status === "approved";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Weekly Plan</h1>
        <p className="text-gray-600 mt-1">
          Review and approve your AI-generated weekly schedule.
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <p className="text-green-700">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-green-500 hover:text-green-700"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Plan Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Week of {format(parseISO(plan.weekStart), "MMMM d")} -{" "}
                {format(parseISO(plan.weekEnd), "MMMM d, yyyy")}
              </CardTitle>
              <CardDescription className="mt-1">
                {validItems.length} tasks scheduled across {Object.keys(itemsByDay).length} days
              </CardDescription>
            </div>
            <Badge className={statusColors[plan.status] || statusColors.draft}>
              {statusLabels[plan.status] || plan.status}
            </Badge>
          </div>
        </CardHeader>

        {/* Approval Status */}
        {plan.approvalStatus && plan.approvalStatus.length > 0 && (
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-700">Family Approvals</h4>
                {plan.approvalSummary && (
                  <span className="text-xs text-gray-500">
                    ({plan.approvalSummary.approved}/{plan.approvalSummary.total} approved)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {plan.approvalStatus.map((approval) => (
                  <div
                    key={approval.userId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      approval.status === "approved"
                        ? "bg-green-50 border-green-200"
                        : approval.status === "rejected"
                          ? "bg-red-50 border-red-200"
                          : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={approval.userImage || ""} />
                      <AvatarFallback className="text-xs">
                        {approval.userName?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{approval.userName}</span>
                    {approval.status === "approved" && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {approval.status === "rejected" && (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    {approval.status === "pending" && (
                      <Clock className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}

        {plan.aiReasoning && (
          <CardContent className="pt-0">
            <div className="bg-purple-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-purple-900 mb-2">AI Planning Strategy</h4>
              <p className="text-sm text-purple-700">{plan.aiReasoning}</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Daily Schedule */}
      <div className="space-y-4">
        {Object.entries(itemsByDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, items]) => (
            <Card key={day}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{format(parseISO(day), "EEEE, MMMM d")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg group"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={item.assignedTo.image || ""} />
                        <AvatarFallback className="text-xs">
                          {item.assignedTo.name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 truncate">{item.task.name}</p>
                          <Badge
                            variant="outline"
                            className={
                              item.task.type === "resolution"
                                ? "border-blue-200 text-blue-700"
                                : "border-green-200 text-green-700"
                            }
                          >
                            {item.task.type}
                          </Badge>
                          {item.lastEditedBy && (
                            <span className="text-xs text-orange-600">
                              (edited by {item.lastEditedBy.name})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{item.assignedTo.name}</p>
                      </div>

                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Clock className="h-4 w-4" />
                        {format(parseISO(item.startTime), "h:mm a")} -{" "}
                        {format(parseISO(item.endTime), "h:mm a")}
                      </div>

                      {/* Edit/Delete buttons - only show if plan is editable */}
                      {canEdit && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(item)}
                            className="h-8 w-8 p-0"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteItem(item.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Action Buttons */}
      {canEdit && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                {hasApproved ? (
                  <>
                    <p className="font-medium text-green-700">You have approved this plan</p>
                    <p className="text-sm text-gray-600">
                      Waiting for other family members to approve.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">Ready to commit?</p>
                    <p className="text-sm text-gray-600">
                      All family members must approve before tasks are added to the calendar.
                    </p>
                  </>
                )}
              </div>
              {!hasApproved && (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => handleAction("reject")}
                    disabled={actionLoading}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleAction("approve")}
                    disabled={actionLoading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Approve
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {plan.status === "approved" && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 text-green-700">
              <CheckCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Schedule Approved by All Members</p>
                <p className="text-sm text-green-600">
                  All tasks have been added to your calendar.
                  {plan.approvedAt &&
                    ` Approved on ${format(parseISO(plan.approvedAt), "MMMM d 'at' h:mm a")}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {plan.status === "rejected" && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-red-700">
                <XCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Plan Rejected</p>
                  <p className="text-sm text-red-600">
                    You can generate a new plan or manually schedule tasks.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => generatePlan("current")}
                  disabled={generating}
                >
                  {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Generate for This Week
                </Button>
                <Button
                  onClick={() => generatePlan("next")}
                  disabled={generating}
                >
                  {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate for Next Week
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Modify the assignment or time for this task. Changes will reset all approvals.
            </DialogDescription>
          </DialogHeader>

          {conflictError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Conflict Detected</p>
                <p className="text-sm text-red-700">{conflictError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setEditModalOpen(false);
                    fetchPlan();
                  }}
                >
                  Refresh & Try Again
                </Button>
              </div>
            </div>
          )}

          {editingItem && (
            <div className="space-y-4 py-2">
              <div>
                <p className="font-medium text-gray-900">{editingItem.task.name}</p>
                <p className="text-sm text-gray-500">
                  Duration: {editingItem.task.duration} minutes
                </p>
              </div>

              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select
                  value={editForm.assignedToUserId}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, assignedToUserId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select family member" />
                  </SelectTrigger>
                  <SelectContent>
                    {familyMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.name || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={editForm.scheduledDate}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Start Time</Label>
                <Select
                  value={editForm.startTime}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, startTime: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {Array.from({ length: 64 }, (_, i) => {
                      const hour = Math.floor(i / 4) + 6; // Start at 6 AM
                      const minute = (i % 4) * 15;
                      const time24 = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
                      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                      const ampm = hour >= 12 ? "PM" : "AM";
                      const time12 = `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
                      return (
                        <SelectItem key={time24} value={time24}>
                          {time12}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEditSubmit} disabled={editLoading}>
                  {editLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
