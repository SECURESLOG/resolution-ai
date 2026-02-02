/**
 * Scheduling Suggestions API
 *
 * GET - Get optimal scheduling suggestions for a task type
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSchedulingSuggestions } from "@/lib/agent-tools/patterns";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const taskType = url.searchParams.get("taskType") || "resolution";
    const category = url.searchParams.get("category") || null;
    const duration = parseInt(url.searchParams.get("duration") || "30");

    const suggestions = await getSchedulingSuggestions(
      session.user.id,
      taskType,
      category,
      duration
    );

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Error getting suggestions:", error);
    return NextResponse.json(
      { error: "Failed to get suggestions" },
      { status: 500 }
    );
  }
}
