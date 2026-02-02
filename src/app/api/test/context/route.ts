/**
 * Test Context API
 *
 * GET - Test weather and traffic integrations without authentication
 * Use this to verify Open-Meteo and TomTom APIs are working
 */

import { NextRequest, NextResponse } from "next/server";
import * as contextTools from "@/lib/agent-tools/context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const location = url.searchParams.get("location") || "London";
  const destination = url.searchParams.get("destination") || "";
  const hoursAhead = parseInt(url.searchParams.get("hours") || "0");

  const testTime = new Date();
  if (hoursAhead > 0) {
    testTime.setHours(testTime.getHours() + hoursAhead);
  }

  try {
    // Test weather API
    console.log(`[Test] Fetching weather for "${location}"...`);
    const weatherStart = Date.now();
    const weather = await contextTools.getWeather(location, testTime);
    const weatherTime = Date.now() - weatherStart;

    // Test traffic API if destination provided
    let traffic = null;
    let trafficTime = 0;
    if (destination) {
      console.log(`[Test] Fetching traffic from "${location}" to "${destination}"...`);
      const trafficStart = Date.now();
      traffic = await contextTools.getTraffic(location, destination, testTime);
      trafficTime = Date.now() - trafficStart;
    }

    return NextResponse.json({
      success: true,
      testTime: testTime.toISOString(),
      weather: {
        data: weather,
        responseTimeMs: weatherTime,
      },
      traffic: traffic
        ? {
            data: traffic,
            responseTimeMs: trafficTime,
          }
        : null,
      usage: {
        weatherEndpoint: `?location=${encodeURIComponent(location)}`,
        trafficEndpoint: `?location=${encodeURIComponent(location)}&destination=${encodeURIComponent(destination || "123 Main St, City")}`,
        futureWeather: `?location=${encodeURIComponent(location)}&hours=3`,
      },
    });
  } catch (error) {
    console.error("[Test] Error:", error);
    return NextResponse.json(
      {
        error: "Test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
