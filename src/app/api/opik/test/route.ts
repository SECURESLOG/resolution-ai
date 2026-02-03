import { NextResponse } from "next/server";
import { opikClient, flushOpik } from "@/lib/opik";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Check environment variables
    const config = {
      apiKey: process.env.OPIK_API_KEY ? "SET (hidden)" : "NOT SET",
      workspace: process.env.OPIK_WORKSPACE || "NOT SET",
      projectName: process.env.OPIK_PROJECT_NAME || "NOT SET",
      urlOverride: process.env.OPIK_URL_OVERRIDE || "NOT SET",
    };

    // Try to create a test trace
    const trace = opikClient.trace({
      name: "test:connection",
      input: { test: true, timestamp: new Date().toISOString() },
      metadata: {
        feature: "connection_test",
        environment: "development",
      },
    });

    trace.update({
      output: { success: true, message: "Test trace created successfully" },
    });

    trace.score({
      name: "test_score",
      value: 1.0,
      reason: "Connection test successful",
    });

    trace.end();

    // Flush immediately
    console.log("Flushing Opik traces...");
    await flushOpik();
    console.log("Flush complete");

    return NextResponse.json({
      success: true,
      message: "Test trace sent to Opik",
      config,
      instructions: "Check your Opik dashboard at https://www.comet.com/opik for the trace named 'test:connection'",
    });
  } catch (error) {
    console.error("Opik test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
