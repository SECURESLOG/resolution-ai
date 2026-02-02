/**
 * Weekly Plan API
 *
 * GET - Retrieve the current draft or latest weekly plan for the user's family
 * POST - Approve or reject a weekly plan (requires all family members to approve)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, addWeeks } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's family
    const familyMember = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      select: { familyId: true },
    });

    if (!familyMember) {
      return NextResponse.json({ error: "Not part of a family" }, { status: 404 });
    }

    // Get the week parameter or default to next week
    const url = new URL(request.url);
    const weekParam = url.searchParams.get("week");

    let weekStart: Date;
    if (weekParam) {
      weekStart = startOfWeek(new Date(weekParam), { weekStartsOn: 1 });
    } else {
      // Default to next week
      weekStart = startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 });
    }

    // Get the weekly plan with items and approvals
    const weeklyPlan = await prisma.weeklyPlan.findUnique({
      where: {
        familyId_weekStart: {
          familyId: familyMember.familyId,
          weekStart,
        },
      },
      include: {
        items: {
          orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
        },
        approvals: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        },
      },
    });

    if (!weeklyPlan) {
      return NextResponse.json({
        plan: null,
        message: "No plan available for this week",
      });
    }

    // Get all family members to show who hasn't approved yet
    const familyMembers = await prisma.familyMember.findMany({
      where: { familyId: familyMember.familyId },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    // Build approval status for each family member
    const approvalStatus = familyMembers.map((member) => {
      const approval = weeklyPlan.approvals.find((a) => a.userId === member.userId);
      return {
        userId: member.userId,
        userName: member.user.name,
        userImage: member.user.image,
        status: approval?.status || "pending",
        approvedAt: approval?.approvedAt,
        rejectedAt: approval?.rejectedAt,
        comment: approval?.comment,
      };
    });

    // Enrich items with task and user details
    const enrichedItems = (
      await Promise.all(
        weeklyPlan.items.map(async (item) => {
          const [task, user, lastEditor] = await Promise.all([
            prisma.task.findUnique({
              where: { id: item.taskId },
              select: { id: true, name: true, type: true, duration: true, category: true },
            }),
            prisma.user.findUnique({
              where: { id: item.assignedToUserId },
              select: { id: true, name: true, image: true },
            }),
            item.lastEditedBy
              ? prisma.user.findUnique({
                  where: { id: item.lastEditedBy },
                  select: { id: true, name: true },
                })
              : null,
          ]);

          // Skip items where task or user was deleted
          if (!task || !user) {
            return null;
          }

          return {
            id: item.id,
            task,
            assignedTo: user,
            scheduledDate: item.scheduledDate,
            startTime: item.startTime,
            endTime: item.endTime,
            aiReasoning: item.aiReasoning,
            version: item.version,
            lastEditedBy: lastEditor,
            lastEditedAt: item.lastEditedAt,
          };
        })
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    // Calculate approval summary
    const totalMembers = familyMembers.length;
    const approvedCount = approvalStatus.filter((a) => a.status === "approved").length;
    const rejectedCount = approvalStatus.filter((a) => a.status === "rejected").length;
    const pendingCount = approvalStatus.filter((a) => a.status === "pending").length;

    return NextResponse.json({
      plan: {
        id: weeklyPlan.id,
        weekStart: weeklyPlan.weekStart,
        weekEnd: weeklyPlan.weekEnd,
        status: weeklyPlan.status,
        aiReasoning: weeklyPlan.aiReasoning,
        createdAt: weeklyPlan.createdAt,
        expiresAt: weeklyPlan.expiresAt,
        approvedAt: weeklyPlan.approvedAt,
        items: enrichedItems,
        approvalStatus,
        approvalSummary: {
          total: totalMembers,
          approved: approvedCount,
          rejected: rejectedCount,
          pending: pendingCount,
          isFullyApproved: approvedCount === totalMembers,
          hasRejection: rejectedCount > 0,
        },
        currentUserApproval: approvalStatus.find((a) => a.userId === session.user.id),
      },
    });
  } catch (error) {
    console.error("Error fetching weekly plan:", error);
    return NextResponse.json({ error: "Failed to fetch weekly plan" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { planId, action, comment } = body;

    if (!planId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid request - planId and action (approve/reject) required" },
        { status: 400 }
      );
    }

    // Get user's family
    const familyMember = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      select: { familyId: true, role: true },
    });

    if (!familyMember) {
      return NextResponse.json({ error: "Not part of a family" }, { status: 404 });
    }

    // Get the plan with approvals
    const plan = await prisma.weeklyPlan.findUnique({
      where: { id: planId },
      include: {
        items: true,
        approvals: true,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (plan.familyId !== familyMember.familyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (plan.status === "approved") {
      return NextResponse.json({ error: "Plan already fully approved" }, { status: 400 });
    }

    if (plan.status === "rejected") {
      return NextResponse.json({ error: "Plan was rejected" }, { status: 400 });
    }

    // Record this user's approval/rejection
    await prisma.weeklyPlanApproval.upsert({
      where: {
        weeklyPlanId_userId: {
          weeklyPlanId: planId,
          userId: session.user.id,
        },
      },
      update: {
        status: action === "approve" ? "approved" : "rejected",
        approvedAt: action === "approve" ? new Date() : null,
        rejectedAt: action === "reject" ? new Date() : null,
        comment: comment || null,
      },
      create: {
        weeklyPlanId: planId,
        userId: session.user.id,
        status: action === "approve" ? "approved" : "rejected",
        approvedAt: action === "approve" ? new Date() : null,
        rejectedAt: action === "reject" ? new Date() : null,
        comment: comment || null,
      },
    });

    // Get all family members and their approval status
    const familyMembers = await prisma.familyMember.findMany({
      where: { familyId: familyMember.familyId },
      select: { userId: true },
    });

    const allApprovals = await prisma.weeklyPlanApproval.findMany({
      where: { weeklyPlanId: planId },
    });

    const totalMembers = familyMembers.length;
    const approvedCount = allApprovals.filter((a) => a.status === "approved").length;
    const rejectedCount = allApprovals.filter((a) => a.status === "rejected").length;

    // Check if anyone rejected - if so, mark plan as rejected
    if (rejectedCount > 0) {
      await prisma.weeklyPlan.update({
        where: { id: planId },
        data: {
          status: "rejected",
          rejectedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Plan rejected. You can manually schedule tasks or generate a new plan.",
        planStatus: "rejected",
      });
    }

    // Check if all members have approved
    if (approvedCount === totalMembers) {
      // Convert plan items to actual scheduled tasks
      const scheduledTasks = await Promise.all(
        plan.items.map(async (item) => {
          return prisma.scheduledTask.create({
            data: {
              taskId: item.taskId,
              assignedToUserId: item.assignedToUserId,
              scheduledDate: item.scheduledDate,
              startTime: item.startTime,
              endTime: item.endTime,
              aiReasoning: item.aiReasoning,
              status: "pending",
            },
          });
        })
      );

      // Update plan status to fully approved
      await prisma.weeklyPlan.update({
        where: { id: planId },
        data: {
          status: "approved",
          approvedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `All members approved! ${scheduledTasks.length} tasks have been added to your schedule.`,
        scheduledCount: scheduledTasks.length,
        planStatus: "approved",
      });
    }

    // Update plan to pending_approval status
    await prisma.weeklyPlan.update({
      where: { id: planId },
      data: {
        status: "pending_approval",
      },
    });

    const remainingCount = totalMembers - approvedCount;
    return NextResponse.json({
      success: true,
      message: `Your approval recorded. Waiting for ${remainingCount} more family member${remainingCount > 1 ? "s" : ""} to approve.`,
      planStatus: "pending_approval",
      approvalSummary: {
        total: totalMembers,
        approved: approvedCount,
        pending: remainingCount,
      },
    });
  } catch (error) {
    console.error("Error processing weekly plan action:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
