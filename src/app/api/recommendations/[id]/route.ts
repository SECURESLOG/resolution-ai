import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["accepted", "dismissed"]),
  applyChanges: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { status, applyChanges } = updateSchema.parse(body);

    // Get the recommendation
    const recommendation = await prisma.aIRecommendation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!recommendation) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    // If accepting and applyChanges is true, update the task
    if (status === "accepted" && applyChanges && recommendation.taskId && recommendation.suggestedChange) {
      const changes = recommendation.suggestedChange as Record<string, unknown>;

      await prisma.task.update({
        where: { id: recommendation.taskId },
        data: changes,
      });
    }

    // Update recommendation status
    const updated = await prisma.aIRecommendation.update({
      where: { id },
      data: {
        status,
        respondedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating recommendation:", error);
    return NextResponse.json({ error: "Failed to update recommendation" }, { status: 500 });
  }
}
