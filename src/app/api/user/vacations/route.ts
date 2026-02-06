import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createVacationSchema = z.object({
  startDate: z.string(), // ISO date string
  endDate: z.string(), // ISO date string
  note: z.string().optional(),
});

// GET - Get user's vacations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const includePast = url.searchParams.get("includePast") === "true";

    const vacations = await prisma.userVacation.findMany({
      where: {
        userId: session.user.id,
        ...(includePast ? {} : { endDate: { gte: new Date() } }),
      },
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json({ vacations });
  } catch (error) {
    console.error("Error fetching vacations:", error);
    return NextResponse.json({ error: "Failed to fetch vacations" }, { status: 500 });
  }
}

// POST - Create a new vacation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { startDate, endDate, note } = createVacationSchema.parse(body);

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
    }

    const vacation = await prisma.userVacation.create({
      data: {
        userId: session.user.id,
        startDate: start,
        endDate: end,
        note,
      },
    });

    return NextResponse.json({ vacation }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error creating vacation:", error);
    return NextResponse.json({ error: "Failed to create vacation" }, { status: 500 });
  }
}
