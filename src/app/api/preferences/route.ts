import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: Fetch all learned preferences with evidence trail
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await prisma.userPreference.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        evidence: {
          orderBy: { createdAt: "desc" },
          include: {
            scheduledTask: {
              select: {
                id: true,
                scheduledDate: true,
                startTime: true,
                status: true,
                wasManuallyMoved: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Format preferences with evidence summary
    const formattedPreferences = preferences.map((pref) => {
      const completedCount = pref.evidence.filter((e) => e.signalType === "completed").length;
      const skippedCount = pref.evidence.filter((e) => e.signalType === "skipped").length;
      const rescheduledCount = pref.evidence.filter((e) => e.signalType === "rescheduled").length;

      // Determine the learned insight
      const value = pref.value as Record<string, unknown>;
      const taskName = value.taskName as string || pref.key.replace(/_time_preference$/, "").replace(/_/g, " ");
      const preferredTime = value.preferredTimeOfDay as string || "unknown";

      // Calculate dominant time pattern from evidence
      const timePatterns: Record<string, number> = {};
      pref.evidence
        .filter((e) => e.signalType === "completed")
        .forEach((e) => {
          timePatterns[e.timeOfDay] = (timePatterns[e.timeOfDay] || 0) + 1;
        });

      const dominantTime = Object.entries(timePatterns)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || preferredTime;

      // Calculate dominant day pattern
      const dayPatterns: Record<string, number> = {};
      pref.evidence
        .filter((e) => e.signalType === "completed")
        .forEach((e) => {
          dayPatterns[e.dayOfWeek] = (dayPatterns[e.dayOfWeek] || 0) + 1;
        });

      const dominantDays = Object.entries(dayPatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([day]) => day);

      return {
        id: pref.id,
        key: pref.key,
        taskName: taskName.charAt(0).toUpperCase() + taskName.slice(1),
        insight: `${taskName.charAt(0).toUpperCase() + taskName.slice(1)} works best in the ${dominantTime}${dominantDays.length > 0 ? ` on ${dominantDays.join(", ")}` : ""}`,
        confidence: Math.round(pref.confidence * 100),
        isActive: pref.isActive,
        source: pref.source,
        createdAt: pref.createdAt,
        updatedAt: pref.updatedAt,
        summary: {
          completedCount,
          skippedCount,
          rescheduledCount,
          totalEvidence: pref.evidence.length,
          dominantTime,
          dominantDays,
        },
        evidence: pref.evidence.map((e) => ({
          id: e.id,
          signalType: e.signalType,
          taskName: e.taskName,
          scheduledTime: e.scheduledTime,
          dayOfWeek: e.dayOfWeek,
          timeOfDay: e.timeOfDay,
          createdAt: e.createdAt,
        })),
      };
    });

    return NextResponse.json({
      preferences: formattedPreferences,
      totalPreferences: preferences.length,
      activePreferences: preferences.filter((p) => p.isActive).length,
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}
