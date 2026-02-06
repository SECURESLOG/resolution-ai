import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const workScheduleSchema = z.object({
  dayOfWeek: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  isWorking: z.boolean(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  location: z.enum(["home", "office"]).default("home"),
  commuteToMin: z.number().nullable().optional(),
  commuteFromMin: z.number().nullable().optional(),
});

const bulkUpdateSchema = z.object({
  schedules: z.array(workScheduleSchema),
  bufferMinutes: z.number().optional(),
  availableTimeStart: z.number().min(0).max(23).optional(),
  availableTimeEnd: z.number().min(0).max(23).optional(),
});

// GET - Get user's work schedule
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get existing schedule
    const schedules = await prisma.userWorkSchedule.findMany({
      where: { userId: session.user.id },
      orderBy: { dayOfWeek: "asc" },
    });

    // Get user settings
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bufferMinutes: true, country: true, availableTimeStart: true, availableTimeEnd: true },
    });

    // If no schedules exist, return defaults (9-5 Mon-Fri)
    if (schedules.length === 0) {
      const defaults = DAYS_OF_WEEK.map((day) => ({
        dayOfWeek: day,
        isWorking: !["saturday", "sunday"].includes(day),
        startTime: !["saturday", "sunday"].includes(day) ? "09:00" : null,
        endTime: !["saturday", "sunday"].includes(day) ? "17:00" : null,
        location: "home" as const,
        commuteToMin: null,
        commuteFromMin: null,
      }));

      return NextResponse.json({
        schedules: defaults,
        bufferMinutes: user?.bufferMinutes ?? 0,
        country: user?.country ?? "UK",
        availableTimeStart: user?.availableTimeStart ?? 6,
        availableTimeEnd: user?.availableTimeEnd ?? 22,
        isDefault: true,
      });
    }

    // Sort by day order
    const sortedSchedules = DAYS_OF_WEEK.map((day) => {
      const found = schedules.find((s) => s.dayOfWeek === day);
      if (found) {
        return {
          dayOfWeek: found.dayOfWeek,
          isWorking: found.isWorking,
          startTime: found.startTime,
          endTime: found.endTime,
          location: found.location,
          commuteToMin: found.commuteToMin,
          commuteFromMin: found.commuteFromMin,
        };
      }
      // Return default for missing days
      return {
        dayOfWeek: day,
        isWorking: !["saturday", "sunday"].includes(day),
        startTime: !["saturday", "sunday"].includes(day) ? "09:00" : null,
        endTime: !["saturday", "sunday"].includes(day) ? "17:00" : null,
        location: "home" as const,
        commuteToMin: null,
        commuteFromMin: null,
      };
    });

    return NextResponse.json({
      schedules: sortedSchedules,
      bufferMinutes: user?.bufferMinutes ?? 0,
      country: user?.country ?? "UK",
      availableTimeStart: user?.availableTimeStart ?? 6,
      availableTimeEnd: user?.availableTimeEnd ?? 22,
      isDefault: false,
    });
  } catch (error) {
    console.error("Error fetching work schedule:", error);
    return NextResponse.json({ error: "Failed to fetch work schedule" }, { status: 500 });
  }
}

// PUT - Update user's work schedule (bulk update all days)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { schedules, bufferMinutes, availableTimeStart, availableTimeEnd } = bulkUpdateSchema.parse(body);

    // Upsert each day's schedule
    const upsertPromises = schedules.map((schedule) =>
      prisma.userWorkSchedule.upsert({
        where: {
          userId_dayOfWeek: {
            userId: session.user.id,
            dayOfWeek: schedule.dayOfWeek,
          },
        },
        create: {
          userId: session.user.id,
          dayOfWeek: schedule.dayOfWeek,
          isWorking: schedule.isWorking,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          location: schedule.location,
          commuteToMin: schedule.commuteToMin,
          commuteFromMin: schedule.commuteFromMin,
        },
        update: {
          isWorking: schedule.isWorking,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          location: schedule.location,
          commuteToMin: schedule.commuteToMin,
          commuteFromMin: schedule.commuteFromMin,
        },
      })
    );

    await Promise.all(upsertPromises);

    // Update user settings if provided
    const userUpdates: Record<string, number> = {};
    if (bufferMinutes !== undefined) userUpdates.bufferMinutes = bufferMinutes;
    if (availableTimeStart !== undefined) userUpdates.availableTimeStart = availableTimeStart;
    if (availableTimeEnd !== undefined) userUpdates.availableTimeEnd = availableTimeEnd;

    if (Object.keys(userUpdates).length > 0) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: userUpdates,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating work schedule:", error);
    return NextResponse.json({ error: "Failed to update work schedule" }, { status: 500 });
  }
}
