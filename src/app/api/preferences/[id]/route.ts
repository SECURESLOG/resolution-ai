import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  resetConfidence: z.boolean().optional(),
});

// PATCH: Update a preference (toggle active, reset confidence)
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
    const validatedData = updateSchema.parse(body);

    // Verify ownership
    const preference = await prisma.userPreference.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!preference) {
      return NextResponse.json({ error: "Preference not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive;
    }

    if (validatedData.resetConfidence) {
      updateData.confidence = 0.5; // Reset to neutral
    }

    const updated = await prisma.userPreference.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      preference: updated,
      message: validatedData.isActive === false
        ? "Preference forgotten - AI will no longer use this insight"
        : validatedData.resetConfidence
          ? "Preference confidence reset - AI will re-learn from new data"
          : "Preference updated",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating preference:", error);
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }
}

// DELETE: Permanently delete a preference and its evidence
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const preference = await prisma.userPreference.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!preference) {
      return NextResponse.json({ error: "Preference not found" }, { status: 404 });
    }

    // Delete preference (evidence will cascade delete)
    await prisma.userPreference.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Preference and all evidence permanently deleted",
    });
  } catch (error) {
    console.error("Error deleting preference:", error);
    return NextResponse.json({ error: "Failed to delete preference" }, { status: 500 });
  }
}
