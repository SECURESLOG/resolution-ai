import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek } from "date-fns";
import {
  evaluateBurnoutRisk,
  evaluateFamilyFairness,
  trackIntelligencePropagation,
  ScheduleData,
  FamilyTaskDistribution,
} from "@/lib/opik-evaluators";
import { flushOpik } from "@/lib/opik";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { evaluationType } = body;

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    let result;

    switch (evaluationType) {
      case "burnout_risk": {
        // Get user's scheduled tasks for the week
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true },
        });

        const scheduledTasks = await prisma.scheduledTask.findMany({
          where: {
            assignedToUserId: session.user.id,
            scheduledDate: { gte: weekStart, lte: weekEnd },
            status: { not: "skipped" },
          },
          include: {
            task: {
              select: { name: true, type: true, duration: true },
            },
          },
          orderBy: { startTime: "asc" },
        });

        const scheduleData: ScheduleData = {
          userId: session.user.id,
          userName: user?.name || "User",
          weekStart,
          tasks: scheduledTasks.map((st) => ({
            name: st.task.name,
            type: st.task.type,
            duration: st.task.duration,
            scheduledDate: st.scheduledDate,
            startTime: st.startTime,
          })),
          totalHoursScheduled: scheduledTasks.reduce(
            (sum, st) => sum + st.task.duration / 60,
            0
          ),
          resolutionCount: scheduledTasks.filter((st) => st.task.type === "resolution").length,
          householdCount: scheduledTasks.filter((st) => st.task.type === "household").length,
        };

        result = await evaluateBurnoutRisk(scheduleData);
        break;
      }

      case "family_fairness": {
        // Get family membership
        const membership = await prisma.familyMember.findUnique({
          where: { userId: session.user.id },
          include: {
            family: {
              include: {
                members: {
                  include: {
                    user: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        });

        if (!membership?.family) {
          return NextResponse.json(
            { error: "You must be part of a family to evaluate fairness" },
            { status: 400 }
          );
        }

        // Get all family members' tasks for the week
        const familyUserIds = membership.family.members.map((m) => m.userId);

        const allTasks = await prisma.scheduledTask.findMany({
          where: {
            assignedToUserId: { in: familyUserIds },
            scheduledDate: { gte: weekStart, lte: weekEnd },
            status: { not: "skipped" },
          },
          include: {
            task: {
              select: { type: true, category: true, duration: true },
            },
            assignedTo: {
              select: { id: true, name: true },
            },
          },
        });

        // Group by member
        const memberMap = new Map<
          string,
          {
            userId: string;
            name: string;
            taskCount: number;
            totalMinutes: number;
            taskTypes: Record<string, number>;
          }
        >();

        for (const member of membership.family.members) {
          memberMap.set(member.userId, {
            userId: member.userId,
            name: member.user.name || "Unknown",
            taskCount: 0,
            totalMinutes: 0,
            taskTypes: {},
          });
        }

        for (const task of allTasks) {
          const member = memberMap.get(task.assignedToUserId);
          if (member) {
            member.taskCount++;
            member.totalMinutes += task.task.duration;
            const category = task.task.category || task.task.type;
            member.taskTypes[category] = (member.taskTypes[category] || 0) + 1;
          }
        }

        const distribution: FamilyTaskDistribution = {
          familyId: membership.familyId,
          weekStart,
          members: Array.from(memberMap.values()),
        };

        result = await evaluateFamilyFairness(distribution);
        break;
      }

      case "intelligence_propagation": {
        // Track a sample intelligence propagation (this would normally be triggered by actual events)
        const { sourceFeature, targetFeature, insight, applied, outcome } = body;

        trackIntelligencePropagation({
          sourceFeature: sourceFeature || "conflict_tracking",
          targetFeature: targetFeature || "scheduling",
          insight: insight || "User prefers morning workouts",
          applied: applied ?? true,
          outcome: outcome || {
            success: true,
            metric: "schedule_adherence",
            beforeValue: 0.65,
            afterValue: 0.82,
          },
        });

        result = { tracked: true, message: "Intelligence propagation tracked" };
        break;
      }

      default:
        return NextResponse.json(
          { error: "Invalid evaluation type" },
          { status: 400 }
        );
    }

    await flushOpik();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to run evaluation" },
      { status: 500 }
    );
  }
}
