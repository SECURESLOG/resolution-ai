import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const weeksBack = parseInt(searchParams.get("weeks") || "4");

    const now = new Date();
    const startDate = startOfWeek(subWeeks(now, weeksBack), { weekStartsOn: 1 });
    const endDate = endOfWeek(now, { weekStartsOn: 1 });

    // Get all conflicts in the date range
    const conflicts = await prisma.scheduleConflict.findMany({
      where: {
        userId: session.user.id,
        weekOf: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        movedTask: {
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
          },
        },
        displacedTask: {
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group conflicts by task
    const conflictsByTask = new Map<string, {
      taskId: string;
      taskName: string;
      taskType: string;
      taskCategory: string | null;
      totalMoves: number;
      weeklyMoves: Map<string, number>;
    }>();

    for (const conflict of conflicts) {
      const taskId = conflict.movedTaskId;
      const existing = conflictsByTask.get(taskId);
      const weekKey = format(conflict.weekOf, "yyyy-MM-dd");

      if (existing) {
        existing.totalMoves++;
        existing.weeklyMoves.set(
          weekKey,
          (existing.weeklyMoves.get(weekKey) || 0) + 1
        );
      } else {
        const weeklyMoves = new Map<string, number>();
        weeklyMoves.set(weekKey, 1);
        conflictsByTask.set(taskId, {
          taskId,
          taskName: conflict.movedTask.name,
          taskType: conflict.movedTask.type,
          taskCategory: conflict.movedTask.category,
          totalMoves: 1,
          weeklyMoves,
        });
      }
    }

    // Convert to array and calculate patterns
    const taskPatterns = Array.from(conflictsByTask.values()).map((task) => ({
      taskId: task.taskId,
      taskName: task.taskName,
      taskType: task.taskType,
      taskCategory: task.taskCategory,
      totalMoves: task.totalMoves,
      averageMovesPerWeek: task.totalMoves / weeksBack,
      weeklyBreakdown: Array.from(task.weeklyMoves.entries()).map(([week, count]) => ({
        week,
        count,
      })),
    })).sort((a, b) => b.totalMoves - a.totalMoves);

    // Calculate summary stats
    const summary = {
      totalConflicts: conflicts.length,
      conflictsThisWeek: conflicts.filter(
        (c) => c.weekOf >= startOfWeek(now, { weekStartsOn: 1 })
      ).length,
      mostRescheduledTasks: taskPatterns.slice(0, 5),
      resolutionTypes: {
        displaced: conflicts.filter((c) => c.resolutionType === "displaced").length,
        shortened: conflicts.filter((c) => c.resolutionType === "shortened").length,
        overlapping: conflicts.filter((c) => c.resolutionType === "overlapping").length,
      },
    };

    return NextResponse.json({
      summary,
      conflicts: conflicts.slice(0, 50), // Last 50 conflicts
      patterns: taskPatterns,
    });
  } catch (error) {
    console.error("Error fetching conflict insights:", error);
    return NextResponse.json({ error: "Failed to fetch conflict insights" }, { status: 500 });
  }
}
