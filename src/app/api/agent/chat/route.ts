import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  AGENT_TOOL_DEFINITIONS,
  safeExecuteTool,
  getFamilyForUser,
  formatFamilyForAI,
  getAllPreferences,
  formatPreferencesForAI,
} from "@/lib/agent-tools";
import prisma from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for agent responses

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown> | null;
}

interface TextBlock {
  type: "text";
  text: string;
}

type ContentBlock = ToolUseBlock | TextBlock;

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: ContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

async function callAnthropic(
  system: string,
  messages: Array<{ role: string; content: unknown }>,
  tools: Array<{ name: string; description: string; input_schema: unknown }>
): Promise<AnthropicResponse> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system,
      messages,
      tools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  return response.json();
}

const chatRequestSchema = z.object({
  message: z.string().min(1),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  pageContext: z
    .object({
      page: z.string(),
      title: z.string(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

// System prompt for the family scheduling agent
function getSystemPrompt(
  userName: string,
  familyContext: string,
  preferencesContext: string,
  pageContext?: { page: string; title: string; data?: Record<string, unknown> }
): string {
  let pageContextSection = "";
  if (pageContext) {
    pageContextSection = `
## Current Page Context
The user is currently viewing: ${pageContext.title} (${pageContext.page})
${pageContext.data ? `Page Data: ${JSON.stringify(pageContext.data, null, 2)}` : ""}
Use this context to provide more relevant suggestions and help.
`;
  }

  return `You are an AI assistant for ResolutionAI, a family scheduling app that helps users manage their New Year's resolutions and household tasks. You help schedule tasks, resolve conflicts, and provide scheduling advice.

## Current User
Name: ${userName}
${pageContextSection}
## Family Context
${familyContext}

## User Preferences (Learned from feedback)
${preferencesContext}

## Your Capabilities
You can help users with:
1. **Natural Language Scheduling**: "Schedule gym for tomorrow morning" or "Find time for grocery shopping this week"
2. **Conflict Resolution**: Detect and help resolve scheduling conflicts between family members
3. **Schedule Optimization**: Suggest better times based on calendar density, preferences, and context
4. **Task Management**: View tasks, check what's scheduled, see completion stats
5. **Fairness Analysis**: Check if household tasks are distributed fairly between family members

## Guidelines
- Be helpful, concise, and friendly
- When scheduling, always explain your reasoning
- Consider the user's learned preferences (energy levels, preferred times, etc.)
- For household tasks, consider fair distribution between family members
- If you're unsure about something, ask for clarification
- When creating schedules, aim for realistic, achievable plans
- Respect existing calendar events - don't double-book

## Important
- Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Always use the tools to get real data before making recommendations
- When scheduling tasks, use the create_scheduled_task tool
- Always provide the AI reasoning when scheduling tasks

## Tool Selection Guide
- For today's tasks: use get_todays_tasks
- For tomorrow's tasks: use get_tomorrows_tasks
- For this week's tasks: use get_weeks_tasks
- For another family member's tasks: first use get_family_info to get their userId, then use get_family_member_tasks with that userId
- For custom date ranges: use get_scheduled_tasks`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationHistory, pageContext } = chatRequestSchema.parse(body);

    // Get user context
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    // Get family context
    const family = await getFamilyForUser(session.user.id);
    const familyContext = formatFamilyForAI(family);

    // Get preferences context
    const preferences = await getAllPreferences(session.user.id);
    const preferencesContext = formatPreferencesForAI(preferences);

    // Build messages array
    const apiMessages: Array<{ role: string; content: unknown }> = [];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory.slice(-10)) {
        // Keep last 10 messages
        apiMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    apiMessages.push({
      role: "user",
      content: message,
    });

    // Inject user context into tool calls
    const toolsWithContext = AGENT_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }));

    const systemPrompt = getSystemPrompt(
      user?.name || "User",
      familyContext,
      preferencesContext,
      pageContext
    );

    // Call Claude with tools (using raw fetch to avoid SDK Zod validation issues)
    let response = await callAnthropic(systemPrompt, apiMessages, toolsWithContext);

    // Process tool calls in a loop until we get a final response
    const toolResults: { toolName: string; input: unknown; output: unknown }[] = [];
    let iterations = 0;
    const maxIterations = 10;

    while (response.stop_reason === "tool_use" && iterations < maxIterations) {
      iterations++;

      // Extract tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      // Execute each tool
      const toolResultContents: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const toolUse of toolUseBlocks) {
        // Ensure input is an object (Claude sometimes sends null)
        const rawInput = (toolUse.input ?? {}) as Record<string, unknown>;

        // Inject userId into tool calls that need it
        const toolInput = injectUserContext(
          toolUse.name,
          rawInput,
          session.user.id,
          family?.id
        );

        const result = await safeExecuteTool(toolUse.name, toolInput);

        toolResults.push({
          toolName: toolUse.name,
          input: toolInput,
          output: result,
        });

        toolResultContents.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the conversation with tool results
      apiMessages.push({
        role: "assistant",
        content: response.content,
      });

      apiMessages.push({
        role: "user",
        content: toolResultContents,
      });

      // Get next response
      response = await callAnthropic(systemPrompt, apiMessages, toolsWithContext);
    }

    // Extract the final text response
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === "text"
    );

    const assistantMessage = textBlocks.map((block) => block.text).join("\n");

    return NextResponse.json({
      message: assistantMessage,
      toolsUsed: toolResults.map((r) => r.toolName),
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Agent chat error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * Inject user context into tool calls that need userId or familyId
 */
function injectUserContext(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
  familyId?: string
): Record<string, unknown> {
  const toolsNeedingUserId = [
    "get_calendar_events",
    "find_free_time_slots",
    "get_calendar_density",
    "get_user_tasks",
    "get_todays_tasks",
    "get_weeks_tasks",
    "get_tomorrows_tasks",
    "get_unscheduled_tasks",
    "check_for_conflicts",
    "get_family_info",
    "get_user_preferences",
    "get_scheduling_context",
    "get_preferred_time_slots",
    "create_reminder",
    "create_smart_reminder",
    "create_conflict_notification",
  ];

  // Tools that query family members - don't override their user ID params
  const toolsForFamilyMemberQueries = [
    "get_family_member_tasks",
  ];

  const toolsNeedingFamilyId = [
    "analyze_task_fairness",
    "suggest_task_assignment",
  ];

  const result = { ...input };

  // ALWAYS override userId with the session user for security
  // Claude may hallucinate or provide incorrect user IDs
  if (toolsNeedingUserId.includes(toolName)) {
    result.userId = userId;
  }

  // ALWAYS override familyId with the session user's family
  if (toolsNeedingFamilyId.includes(toolName) && familyId) {
    result.familyId = familyId;
  }

  // For task creation, always use current user unless explicitly assigning to family member
  if (toolName === "create_scheduled_task") {
    // If no assignedToUserId specified, default to current user
    if (!result.assignedToUserId) {
      result.assignedToUserId = userId;
    }
    // Note: We allow assignedToUserId to be different for assigning tasks to family members
  }

  // For scheduled tasks, allow family view by passing familyId
  if (toolName === "get_scheduled_tasks" && !result.userId && !result.familyId && familyId) {
    result.familyId = familyId;
  }

  return result;
}
