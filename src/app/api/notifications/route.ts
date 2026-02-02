/**
 * Notifications API
 *
 * GET - Fetch user's notifications
 * PATCH - Mark notifications as read/dismissed
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const type = url.searchParams.get("type"); // "reminder", "weekly_plan", "conflict", etc.

    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        scheduledFor: { lte: new Date() },
        ...(unreadOnly && { readAt: null, dismissedAt: null }),
        ...(type && { type }),
      },
      orderBy: { scheduledFor: "desc" },
      take: limit,
    });

    // Get unread count
    const unreadCount = await prisma.notification.count({
      where: {
        userId: session.user.id,
        scheduledFor: { lte: new Date() },
        readAt: null,
        dismissedAt: null,
      },
    });

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationIds, action } = body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: "notificationIds array required" },
        { status: 400 }
      );
    }

    if (!["read", "dismiss", "markAllRead"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action - use 'read', 'dismiss', or 'markAllRead'" },
        { status: 400 }
      );
    }

    if (action === "markAllRead") {
      // Mark all unread notifications as read
      await prisma.notification.updateMany({
        where: {
          userId: session.user.id,
          readAt: null,
          dismissedAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });
    } else {
      // Update specific notifications
      const updateData = action === "read"
        ? { readAt: new Date() }
        : { dismissedAt: new Date() };

      await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: session.user.id, // Security: only update own notifications
        },
        data: updateData,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notifications:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
