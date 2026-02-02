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

    const searchParams = request.nextUrl.searchParams;
    const location = searchParams.get("location"); // "weekly_plan", "tasks", "insights", "dashboard"
    const status = searchParams.get("status") || "pending";

    const where: {
      userId: string;
      status: string;
      displayLocation?: string;
      expiresAt?: { gt: Date };
    } = {
      userId: session.user.id,
      status,
    };

    if (location) {
      where.displayLocation = location;
    }

    // Only get non-expired recommendations
    if (status === "pending") {
      where.expiresAt = { gt: new Date() };
    }

    const recommendations = await prisma.aIRecommendation.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
          },
        },
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return NextResponse.json({ error: "Failed to fetch recommendations" }, { status: 500 });
  }
}
