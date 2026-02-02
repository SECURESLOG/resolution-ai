import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay, format } from "date-fns";

export const dynamic = "force-dynamic";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { context, completedSessions } = await request.json();

    // Get today's tasks for context
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    const todaysTasks = await prisma.scheduledTask.findMany({
      where: {
        assignedToUserId: session.user.id,
        scheduledDate: { gte: todayStart, lte: todayEnd },
      },
      include: { task: { select: { name: true, type: true } } },
      orderBy: { startTime: "asc" },
    });

    const pendingTasks = todaysTasks.filter((t) => t.status === "pending");
    const completedTasks = todaysTasks.filter((t) => t.status === "completed");

    // Get user's name
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });

    // Build context for AI
    const taskContext = pendingTasks.length > 0
      ? `Upcoming tasks: ${pendingTasks.map((t) => `${t.task.name} at ${format(new Date(t.startTime), "h:mm a")}`).join(", ")}`
      : "No more scheduled tasks for today";

    const prompt = context === "break"
      ? `You are a productivity coach. The user "${user?.name?.split(" ")[0] || "there"}" just completed focus session #${completedSessions}. Give them a brief, encouraging break suggestion (1-2 sentences). ${taskContext}. Be specific and actionable - suggest stretching, hydration, a quick walk, or rest based on how many sessions they've done.`
      : `You are a productivity coach. The user "${user?.name?.split(" ")[0] || "there"}" is about to start a focus session. They've completed ${completedSessions} sessions so far. ${taskContext}. Give a brief motivational tip (1-2 sentences) - maybe suggest which task to focus on or how to approach their work.`;

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 150,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate suggestion");
      }

      const result = await response.json();
      const textContent = result.content.find((c: { type: string }) => c.type === "text");
      const suggestion = textContent?.text || getDefaultSuggestion(context, completedSessions);

      return NextResponse.json({ suggestion });
    } catch (error) {
      console.error("Error calling AI:", error);
      return NextResponse.json({ suggestion: getDefaultSuggestion(context, completedSessions) });
    }
  } catch (error) {
    console.error("Error generating focus suggestion:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}

function getDefaultSuggestion(context: string, sessions: number): string {
  if (context === "break") {
    const breakSuggestions = [
      "Great work! Stand up and stretch for a minute - your body will thank you.",
      "Time for a break! Grab some water and rest your eyes by looking at something distant.",
      "Nice session! Take a short walk or do some light stretching.",
      "Well done! Step away from the screen and take a few deep breaths.",
    ];
    return breakSuggestions[sessions % breakSuggestions.length];
  } else {
    const focusSuggestions = [
      "Ready to focus? Clear your workspace and silence notifications.",
      "New session starting - pick one task and give it your full attention.",
      "Focus time! Remember: single-tasking beats multitasking every time.",
      "Let's go! Set a clear intention for what you want to accomplish.",
    ];
    return focusSuggestions[sessions % focusSuggestions.length];
  }
}
