/**
 * Weekly Plan Item API
 *
 * GET - Get details of a specific plan item
 * PATCH - Edit a plan item (with conflict detection)
 * DELETE - Remove a plan item
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { addMinutes } from "date-fns";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface EditHistory {
  userId: string;
  userName: string;
  timestamp: string;
  changes: {
    field: string;
    from: unknown;
    to: unknown;
  }[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;

    const item = await prisma.weeklyPlanItem.findUnique({
      where: { id: itemId },
      include: {
        weeklyPlan: {
          select: { familyId: true, status: true },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Verify user is in the same family
    const familyMember = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      select: { familyId: true },
    });

    if (!familyMember || familyMember.familyId !== item.weeklyPlan.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get task and assigned user details
    const [task, assignedTo] = await Promise.all([
      prisma.task.findUnique({
        where: { id: item.taskId },
        select: { id: true, name: true, type: true, duration: true, category: true },
      }),
      prisma.user.findUnique({
        where: { id: item.assignedToUserId },
        select: { id: true, name: true, image: true },
      }),
    ]);

    // Get all family members for reassignment options
    const familyMembers = await prisma.familyMember.findMany({
      where: { familyId: familyMember.familyId },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    return NextResponse.json({
      item: {
        id: item.id,
        task,
        assignedTo,
        scheduledDate: item.scheduledDate,
        startTime: item.startTime,
        endTime: item.endTime,
        aiReasoning: item.aiReasoning,
        version: item.version,
        lastEditedBy: item.lastEditedBy,
        lastEditedAt: item.lastEditedAt,
        editHistory: item.editHistory,
        planStatus: item.weeklyPlan.status,
      },
      familyMembers: familyMembers.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        image: m.user.image,
      })),
    });
  } catch (error) {
    console.error("Error fetching plan item:", error);
    return NextResponse.json({ error: "Failed to fetch item" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;
    const body = await request.json();
    const { assignedToUserId, scheduledDate, startTime, expectedVersion } = body;

    // Get current item with plan details
    const item = await prisma.weeklyPlanItem.findUnique({
      where: { id: itemId },
      include: {
        weeklyPlan: {
          select: { familyId: true, status: true, id: true },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Verify user is in the same family
    const familyMember = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      select: { familyId: true },
    });

    if (!familyMember || familyMember.familyId !== item.weeklyPlan.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check plan status - only allow edits on draft or pending_approval
    if (!["draft", "pending_approval"].includes(item.weeklyPlan.status)) {
      return NextResponse.json(
        { error: `Cannot edit items in a ${item.weeklyPlan.status} plan` },
        { status: 400 }
      );
    }

    // CONFLICT DETECTION: Check version matches
    if (expectedVersion !== undefined && expectedVersion !== item.version) {
      // Someone else edited this item since the user loaded it
      const lastEditor = item.lastEditedBy
        ? await prisma.user.findUnique({
            where: { id: item.lastEditedBy },
            select: { name: true },
          })
        : null;

      return NextResponse.json(
        {
          error: "Conflict detected",
          conflict: true,
          message: `This task was edited by ${lastEditor?.name || "another user"} at ${item.lastEditedAt?.toISOString()}. Please refresh and try again.`,
          currentVersion: item.version,
          lastEditedBy: lastEditor?.name,
          lastEditedAt: item.lastEditedAt,
        },
        { status: 409 }
      );
    }

    // Build update data
    const updateData: Prisma.WeeklyPlanItemUpdateInput = {
      version: item.version + 1,
      lastEditedBy: session.user.id,
      lastEditedAt: new Date(),
    };

    const changes: { field: string; from: unknown; to: unknown }[] = [];

    // Track changes for history
    if (assignedToUserId && assignedToUserId !== item.assignedToUserId) {
      // Verify the new assignee is in the family
      const newAssignee = await prisma.familyMember.findUnique({
        where: { userId: assignedToUserId },
        select: { familyId: true },
      });

      if (!newAssignee || newAssignee.familyId !== familyMember.familyId) {
        return NextResponse.json(
          { error: "Invalid assignee - must be a family member" },
          { status: 400 }
        );
      }

      changes.push({
        field: "assignedToUserId",
        from: item.assignedToUserId,
        to: assignedToUserId,
      });
      updateData.assignedToUserId = assignedToUserId;
    }

    if (scheduledDate) {
      const newDate = new Date(scheduledDate);
      if (newDate.getTime() !== item.scheduledDate.getTime()) {
        changes.push({
          field: "scheduledDate",
          from: item.scheduledDate.toISOString(),
          to: newDate.toISOString(),
        });
        updateData.scheduledDate = newDate;
      }
    }

    if (startTime) {
      const newStartTime = new Date(startTime);
      if (newStartTime.getTime() !== item.startTime.getTime()) {
        // Get task duration to calculate end time
        const task = await prisma.task.findUnique({
          where: { id: item.taskId },
          select: { duration: true },
        });

        const newEndTime = addMinutes(newStartTime, task?.duration || 30);

        changes.push({
          field: "startTime",
          from: item.startTime.toISOString(),
          to: newStartTime.toISOString(),
        });
        updateData.startTime = newStartTime;
        updateData.endTime = newEndTime;
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ message: "No changes to apply", item });
    }

    // Build edit history
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    const editEntry: EditHistory = {
      userId: session.user.id,
      userName: currentUser?.name || "Unknown",
      timestamp: new Date().toISOString(),
      changes,
    };

    const existingHistory = (item.editHistory as EditHistory[] | null) || [];
    updateData.editHistory = [...existingHistory, editEntry] as unknown as Prisma.InputJsonValue;

    // Perform the update
    const updatedItem = await prisma.weeklyPlanItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Reset all approvals since the plan was modified
    await prisma.weeklyPlanApproval.updateMany({
      where: { weeklyPlanId: item.weeklyPlan.id },
      data: {
        status: "pending",
        approvedAt: null,
        rejectedAt: null,
      },
    });

    // Reset plan status to draft
    await prisma.weeklyPlan.update({
      where: { id: item.weeklyPlan.id },
      data: { status: "draft" },
    });

    return NextResponse.json({
      success: true,
      message: "Item updated successfully. All approvals have been reset.",
      item: updatedItem,
      changes,
    });
  } catch (error) {
    console.error("Error updating plan item:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { itemId } = await params;

    const item = await prisma.weeklyPlanItem.findUnique({
      where: { id: itemId },
      include: {
        weeklyPlan: {
          select: { familyId: true, status: true, id: true },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Verify user is in the same family
    const familyMember = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      select: { familyId: true },
    });

    if (!familyMember || familyMember.familyId !== item.weeklyPlan.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check plan status
    if (!["draft", "pending_approval"].includes(item.weeklyPlan.status)) {
      return NextResponse.json(
        { error: `Cannot delete items from a ${item.weeklyPlan.status} plan` },
        { status: 400 }
      );
    }

    // Delete the item
    await prisma.weeklyPlanItem.delete({
      where: { id: itemId },
    });

    // Reset all approvals since the plan was modified
    await prisma.weeklyPlanApproval.updateMany({
      where: { weeklyPlanId: item.weeklyPlan.id },
      data: {
        status: "pending",
        approvedAt: null,
        rejectedAt: null,
      },
    });

    // Reset plan status to draft
    await prisma.weeklyPlan.update({
      where: { id: item.weeklyPlan.id },
      data: { status: "draft" },
    });

    return NextResponse.json({
      success: true,
      message: "Item removed from plan. All approvals have been reset.",
    });
  } catch (error) {
    console.error("Error deleting plan item:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
