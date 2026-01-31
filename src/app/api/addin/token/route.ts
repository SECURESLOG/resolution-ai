import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

// GET - Get or create an add-in token for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for existing valid token
    const existingToken = await prisma.addinToken.findFirst({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingToken) {
      return NextResponse.json({
        token: existingToken.token,
        expiresAt: existingToken.expiresAt,
      });
    }

    // Create a new token (valid for 30 days)
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const addinToken = await prisma.addinToken.create({
      data: {
        userId: session.user.id,
        token,
        expiresAt,
      },
    });

    return NextResponse.json({
      token: addinToken.token,
      expiresAt: addinToken.expiresAt,
    });
  } catch (error) {
    console.error("Error generating add-in token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}

// DELETE - Revoke an add-in token
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.addinToken.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking add-in token:", error);
    return NextResponse.json(
      { error: "Failed to revoke token" },
      { status: 500 }
    );
  }
}
