import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const addCalendarSchema = z.object({
  name: z.string().min(1, "Calendar name is required"),
  url: z.string().url("Please enter a valid URL").refine(
    (url) => url.startsWith("http://") || url.startsWith("https://") || url.startsWith("webcal://"),
    "URL must start with http://, https://, or webcal://"
  ),
});

// GET - List user's external calendars
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const calendars = await prisma.externalCalendar.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ calendars });
  } catch (error) {
    console.error("Error fetching external calendars:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendars" },
      { status: 500 }
    );
  }
}

// POST - Add a new external calendar
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, url } = addCalendarSchema.parse(body);

    // Normalize URL
    const normalizedUrl = url.replace(/^webcal:\/\//i, "https://");

    // Check if calendar already exists
    const existing = await prisma.externalCalendar.findUnique({
      where: {
        userId_url: {
          userId: session.user.id,
          url: normalizedUrl,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This calendar is already added" },
        { status: 400 }
      );
    }

    // Validate the URL by trying to fetch it
    try {
      const response = await fetch(normalizedUrl, {
        headers: { "Accept": "text/calendar" },
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: "Could not access the calendar URL. Please check the URL is correct and publicly accessible." },
          { status: 400 }
        );
      }

      const content = await response.text();
      if (!content.includes("BEGIN:VCALENDAR")) {
        return NextResponse.json(
          { error: "The URL does not appear to be a valid calendar file (ICS format)" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not connect to the calendar URL. Please check the URL is correct." },
        { status: 400 }
      );
    }

    // Create the calendar
    const calendar = await prisma.externalCalendar.create({
      data: {
        userId: session.user.id,
        name,
        url: normalizedUrl,
        lastSync: new Date(),
      },
    });

    return NextResponse.json({ calendar }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Error adding external calendar:", error);
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 }
    );
  }
}
