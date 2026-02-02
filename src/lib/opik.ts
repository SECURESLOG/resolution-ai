import "server-only";
import { Opik } from "opik";

// Initialize Opik client
const opikClient = new Opik({
  apiKey: process.env.OPIK_API_KEY,
  workspaceName: process.env.OPIK_WORKSPACE || "resolution-ai",
  projectName: process.env.OPIK_PROJECT_NAME || "resolution-ai",
});

export { opikClient };

// Types for our evaluation system
export interface EvaluationScore {
  name: string;
  score: number; // 0-1
  reason: string;
}

export interface TraceMetadata {
  userId?: string;
  familyId?: string;
  feature: string;
  action: string;
  [key: string]: unknown;
}

export interface SpanMetadata {
  type: "llm" | "tool" | "general";
  model?: string;
  tokens?: {
    input: number;
    output: number;
  };
  [key: string]: unknown;
}

// Helper to create a traced AI call
export async function traceAICall<T>({
  name,
  metadata,
  input,
  operation,
}: {
  name: string;
  metadata: TraceMetadata;
  input: Record<string, unknown>;
  operation: (trace: ReturnType<typeof opikClient.trace>) => Promise<T>;
}): Promise<T> {
  const trace = opikClient.trace({
    name,
    input,
    metadata,
  });

  try {
    const result = await operation(trace);
    trace.end();
    return result;
  } catch (error) {
    trace.update({
      metadata: {
        ...metadata,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    trace.end();
    throw error;
  }
}

// Helper to add a span to an existing trace
export function addSpan(
  trace: ReturnType<typeof opikClient.trace>,
  {
    name,
    type,
    input,
    output,
    metadata,
  }: {
    name: string;
    type: SpanMetadata["type"];
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
) {
  const span = trace.span({
    name,
    type,
    input,
    metadata,
  });

  if (output) {
    span.update({ output });
  }

  span.end();
  return span;
}

// Helper to add evaluation scores to a trace
export function addEvaluations(
  trace: ReturnType<typeof opikClient.trace>,
  evaluations: EvaluationScore[]
) {
  for (const evaluation of evaluations) {
    trace.score({
      name: evaluation.name,
      value: evaluation.score,
      reason: evaluation.reason,
    });
  }
}

// Flush all pending traces (call at end of request)
export async function flushOpik() {
  try {
    await opikClient.flush();
  } catch (error) {
    console.error("Failed to flush Opik traces:", error);
  }
}

// Feature-specific trace creators

export function createSchedulingTrace(
  userId: string,
  familyId: string | null,
  action: string
) {
  return opikClient.trace({
    name: `scheduling:${action}`,
    metadata: {
      userId,
      familyId,
      feature: "scheduling",
      action,
    },
  });
}

export function createAgentTrace(
  userId: string,
  sessionId: string,
  action: string
) {
  return opikClient.trace({
    name: `agent:${action}`,
    metadata: {
      userId,
      sessionId,
      feature: "agent",
      action,
    },
  });
}

export function createInsightsTrace(userId: string, action: string) {
  return opikClient.trace({
    name: `insights:${action}`,
    metadata: {
      userId,
      feature: "insights",
      action,
    },
  });
}

export function createEvaluationTrace(
  userId: string,
  evaluationType: string
) {
  return opikClient.trace({
    name: `evaluation:${evaluationType}`,
    metadata: {
      userId,
      feature: "evaluation",
      action: evaluationType,
    },
  });
}
