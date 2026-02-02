/**
 * Test endpoint to view all submitted feedback
 * GET /api/test/feedback - List all feedback with task details
 * GET /api/test/feedback?userId=xxx - Filter by user
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where = userId ? { userId } : {};

    const feedback = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        scheduledTask: {
          include: {
            task: {
              select: { id: true, name: true, type: true, duration: true, category: true },
            },
          },
        },
      },
    });

    // Format the response for easier reading
    const formattedFeedback = feedback.map((f) => ({
      id: f.id,
      createdAt: f.createdAt,
      user: f.user.name || f.user.email,
      userId: f.userId,
      task: f.scheduledTask?.task?.name || "Unknown",
      taskType: f.scheduledTask?.task?.type,
      taskCategory: f.scheduledTask?.task?.category,
      scheduledDate: f.scheduledTask?.scheduledDate,
      startTime: f.scheduledTask?.startTime,
      feedback: {
        actualDuration: f.actualDuration,
        estimatedDuration: f.scheduledTask?.task?.duration,
        durationDiff: f.actualDuration && f.scheduledTask?.task?.duration
          ? f.actualDuration - f.scheduledTask.task.duration
          : null,
        timeAccuracy: f.timeAccuracy,
        timeSlotRating: f.timeSlotRating,
        energyLevel: f.energyLevel,
        trafficImpact: f.trafficImpact,
        weatherImpact: f.weatherImpact,
        wouldReschedule: f.wouldReschedule,
        preferredTime: f.preferredTime,
        notes: f.notes,
      },
    }));

    // Summary stats
    const stats = {
      totalFeedback: feedback.length,
      avgTimeSlotRating: feedback.filter(f => f.timeSlotRating).length > 0
        ? (feedback.reduce((sum, f) => sum + (f.timeSlotRating || 0), 0) /
           feedback.filter(f => f.timeSlotRating).length).toFixed(1)
        : null,
      timeAccuracyBreakdown: {
        tooShort: feedback.filter(f => f.timeAccuracy === "too_short").length,
        justRight: feedback.filter(f => f.timeAccuracy === "just_right").length,
        tooLong: feedback.filter(f => f.timeAccuracy === "too_long").length,
      },
      energyLevelBreakdown: {
        low: feedback.filter(f => f.energyLevel === "low").length,
        medium: feedback.filter(f => f.energyLevel === "medium").length,
        high: feedback.filter(f => f.energyLevel === "high").length,
      },
      trafficImpacted: feedback.filter(f => f.trafficImpact === true).length,
      weatherImpacted: feedback.filter(f => f.weatherImpact === true).length,
    };

    return NextResponse.json({
      stats,
      feedback: formattedFeedback,
    });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback", details: String(error) },
      { status: 500 }
    );
  }
}
