import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const createFamilySchema = z.object({
  name: z.string().min(1, "Family name is required"),
});

// GET - Get current user's family
export async function GET() {
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
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ family: null });
    }

    return NextResponse.json({
      family: membership.family,
      role: membership.role,
    });
  } catch (error) {
    console.error("Error fetching family:", error);
    return NextResponse.json({ error: "Failed to fetch family" }, { status: 500 });
  }
}

// POST - Create a new family
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
    const { name } = createFamilySchema.parse(body);

    // Generate unique invite code
    const inviteCode = randomBytes(4).toString("hex").toUpperCase();

    // Create family and add user as admin
    const family = await prisma.family.create({
      data: {
        name,
        inviteCode,
        members: {
          create: {
            userId: session.user.id,
            role: "admin",
          },
        },
      },
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

    return NextResponse.json({ family, role: "admin" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error creating family:", error);
    return NextResponse.json({ error: "Failed to create family" }, { status: 500 });
  }
}
