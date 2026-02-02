import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

export const dynamic = "force-dynamic";

// This endpoint provides stats for the Opik Insights dashboard
// Note: In a full implementation, you'd query Opik's API for trace data
// For the hackathon demo, we'll compute metrics from our local data

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = subWeeks(currentWeekStart, 1);
    const fourWeeksAgo = subWeeks(currentWeekStart, 4);

    // Get user's family
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

    const familyUserIds = membership?.family
      ? membership.family.members.map((m) => m.userId)
      : [session.user.id];

    // === BURNOUT RISK METRICS ===
    const currentWeekTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: currentWeekStart, lte: currentWeekEnd },
        status: { not: "skipped" },
      },
      include: { task: { select: { duration: true, type: true } } },
    });

    const totalHoursThisWeek = currentWeekTasks.reduce(
      (sum, st) => sum + st.task.duration / 60,
      0
    );
    const resolutionTasks = currentWeekTasks.filter((st) => st.task.type === "resolution").length;
    const householdTasks = currentWeekTasks.filter((st) => st.task.type === "household").length;

    // Simple burnout risk calculation
    const burnoutRiskScore =
      totalHoursThisWeek > 20
        ? "high"
        : totalHoursThisWeek > 12
          ? "medium"
          : "low";

    // === FAMILY FAIRNESS METRICS ===
    let familyFairnessData = null;
    if (membership?.family) {
      const familyTasks = await prisma.scheduledTask.findMany({
        where: {
          assignedToUserId: { in: familyUserIds },
          scheduledDate: { gte: currentWeekStart, lte: currentWeekEnd },
          status: { not: "skipped" },
        },
        include: {
          task: { select: { duration: true, category: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      });

      const memberStats = new Map<string, { name: string; tasks: number; minutes: number }>();

      for (const member of membership.family.members) {
        memberStats.set(member.userId, {
          name: member.user.name || "Unknown",
          tasks: 0,
          minutes: 0,
        });
      }

      for (const task of familyTasks) {
        const stats = memberStats.get(task.assignedToUserId);
        if (stats) {
          stats.tasks++;
          stats.minutes += task.task.duration;
        }
      }

      const members = Array.from(memberStats.values());
      const avgTasks = members.reduce((sum, m) => sum + m.tasks, 0) / members.length;
      const maxDeviation = Math.max(...members.map((m) => Math.abs(m.tasks - avgTasks)));
      const fairnessScore = Math.max(0, 1 - maxDeviation / Math.max(avgTasks, 1));

      familyFairnessData = {
        members,
        fairnessScore,
        totalFamilyTasks: familyTasks.length,
      };
    }

    // === SCHEDULE ADHERENCE METRICS ===
    const completedTasks = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: fourWeeksAgo, lte: now },
        status: "completed",
      },
    });

    const totalScheduledTasks = await prisma.scheduledTask.count({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: fourWeeksAgo, lte: now },
      },
    });

    const adherenceRate = totalScheduledTasks > 0 ? completedTasks / totalScheduledTasks : 0;

    // === CONFLICT/RESCHEDULE METRICS ===
    const conflicts = await prisma.scheduleConflict.findMany({
      where: {
        userId: session.user.id,
        weekOf: { gte: fourWeeksAgo },
      },
      include: {
        movedTask: { select: { name: true } },
      },
    });

    const conflictsByWeek = new Map<string, number>();
    for (const conflict of conflicts) {
      const weekKey = format(conflict.weekOf, "yyyy-MM-dd");
      conflictsByWeek.set(weekKey, (conflictsByWeek.get(weekKey) || 0) + 1);
    }

    // Most rescheduled tasks
    const taskReschedules = new Map<string, { name: string; count: number }>();
    for (const conflict of conflicts) {
      const existing = taskReschedules.get(conflict.movedTaskId);
      if (existing) {
        existing.count++;
      } else {
        taskReschedules.set(conflict.movedTaskId, {
          name: conflict.movedTask.name,
          count: 1,
        });
      }
    }

    const mostRescheduled = Array.from(taskReschedules.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // === INTELLIGENCE LOOP METRICS ===
    // Track how preferences have improved scheduling
    const preferences = await prisma.userPreference.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    const learnedPreferences = preferences.map((p) => ({
      key: p.key,
      confidence: p.confidence,
      source: p.source,
      updatedAt: p.updatedAt,
    }));

    // Calculate intelligence loop effectiveness
    // Compare adherence rate before/after preferences were learned
    const recentAdherence = adherenceRate;
    // Simulated baseline (in a real app, you'd track this historically)
    const baselineAdherence = 0.6;
    const intelligenceImprovement = ((recentAdherence - baselineAdherence) / baselineAdherence) * 100;

    // === WEEKLY TRENDS ===
    const weeklyTrends = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = subWeeks(currentWeekStart, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

      const weekTasks = await prisma.scheduledTask.findMany({
        where: {
          assignedToUserId: session.user.id,
          scheduledDate: { gte: weekStart, lte: weekEnd },
        },
        select: { status: true },
      });

      const completed = weekTasks.filter((t) => t.status === "completed").length;
      const total = weekTasks.length;

      weeklyTrends.push({
        week: format(weekStart, "MMM d"),
        completed,
        total,
        adherenceRate: total > 0 ? completed / total : 0,
        conflicts: conflictsByWeek.get(format(weekStart, "yyyy-MM-dd")) || 0,
      });
    }

    return NextResponse.json({
      burnoutRisk: {
        score: burnoutRiskScore,
        totalHoursThisWeek: Math.round(totalHoursThisWeek * 10) / 10,
        resolutionTasks,
        householdTasks,
        totalTasks: currentWeekTasks.length,
      },
      familyFairness: familyFairnessData,
      scheduleAdherence: {
        rate: Math.round(adherenceRate * 100),
        completed: completedTasks,
        total: totalScheduledTasks,
      },
      conflicts: {
        totalLast4Weeks: conflicts.length,
        mostRescheduled,
        byWeek: Array.from(conflictsByWeek.entries()).map(([week, count]) => ({
          week,
          count,
        })),
      },
      intelligenceLoop: {
        learnedPreferences: learnedPreferences.length,
        preferences: learnedPreferences,
        improvement: Math.round(intelligenceImprovement),
      },
      weeklyTrends,
    });
  } catch (error) {
    console.error("Error fetching Opik stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}

// Fix typo
