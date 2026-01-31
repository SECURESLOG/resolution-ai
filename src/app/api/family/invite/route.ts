import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendFamilyInviteEmail } from "@/lib/email";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's family
    const membership = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      include: {
        family: {
          include: {
            members: true,
          },
        },
        user: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You must be in a family to send invitations." },
        { status: 400 }
      );
    }

    // Check if family already has 2 members
    if (membership.family.members.length >= 2) {
      return NextResponse.json(
        { error: "Your family already has the maximum number of members (2)." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { email } = inviteSchema.parse(body);

    // Check if the email belongs to an existing user who is already in this family
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: {
        familyMember: true,
      },
    });

    if (existingUser?.familyMember?.familyId === membership.family.id) {
      return NextResponse.json(
        { error: "This person is already in your family." },
        { status: 400 }
      );
    }

    // Send the invitation email
    await sendFamilyInviteEmail({
      to: email,
      inviterName: membership.user.name || "A family member",
      familyName: membership.family.name,
      inviteCode: membership.family.inviteCode,
    });

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Error sending family invitation:", error);
    const message = error instanceof Error ? error.message : "Failed to send invitation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
