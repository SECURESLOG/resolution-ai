import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find user's family membership
    const membership = await prisma.familyMember.findUnique({
      where: { userId: session.user.id },
      include: {
        family: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not in a family." },
        { status: 400 }
      );
    }

    const family = membership.family;

    // If user is the only member, delete the family
    if (family.members.length === 1) {
      await prisma.family.delete({
        where: { id: family.id },
      });
    } else {
      // Remove user from family
      await prisma.familyMember.delete({
        where: { userId: session.user.id },
      });

      // If leaving user was admin, make another member admin
      if (membership.role === "admin") {
        const otherMember = family.members.find(m => m.userId !== session.user.id);
        if (otherMember) {
          await prisma.familyMember.update({
            where: { id: otherMember.id },
            data: { role: "admin" },
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error leaving family:", error);
    return NextResponse.json({ error: "Failed to leave family" }, { status: 500 });
  }
}
