import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateCountrySchema = z.object({
  country: z.string().min(2).max(3), // ISO country code
});

// GET - Get user's country
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { country: true },
    });

    return NextResponse.json({ country: user?.country ?? "UK" });
  } catch (error) {
    console.error("Error fetching country:", error);
    return NextResponse.json({ error: "Failed to fetch country" }, { status: 500 });
  }
}

// PUT - Update user's country
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { country } = updateCountrySchema.parse(body);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { country },
    });

    return NextResponse.json({ success: true, country });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating country:", error);
    return NextResponse.json({ error: "Failed to update country" }, { status: 500 });
  }
}
