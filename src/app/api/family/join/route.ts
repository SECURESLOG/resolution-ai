import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const joinFamilySchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is already in a family
    const existingMembership = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "You are already in a family. Leave your current family first." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { inviteCode } = joinFamilySchema.parse(body);

    // Find family by invite code
    const family = await prisma.family.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: {
        members: true,
      },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Invalid invite code. Please check and try again." },
        { status: 404 }
      );
    }

    // Check if family already has 2 members (limit for 2-person families)
    if (family.members.length >= 2) {
      return NextResponse.json(
        { error: "This family already has the maximum number of members (2)." },
        { status: 400 }
      );
    }

    // Add user to family
    await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: session.user.id,
        role: "member",
      },
    });

    // Fetch updated family
    const updatedFamily = await prisma.family.findUnique({
      where: { id: family.id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ family: updatedFamily, role: "member" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error joining family:", error);
    return NextResponse.json({ error: "Failed to join family" }, { status: 500 });
  }
}
