/**
 * Context Tools for AI Agents
 *
 * These tools provide external context like weather and traffic
 * that can influence scheduling decisions.
 *
 * Note: These are placeholder implementations. In production,
 * you would integrate with actual APIs like:
 * - Weather: OpenWeatherMap, WeatherAPI, etc.
 * - Traffic: Google Maps, HERE, TomTom, etc.
 */

import { format, addHours, isWeekend } from "date-fns";

interface WeatherData {
  temperature: number; // Celsius
  condition: "clear" | "cloudy" | "rainy" | "stormy" | "snowy" | "windy";
  humidity: number;
  windSpeed: number;
  description: string;
  isGoodForOutdoor: boolean;
}

interface TrafficData {
  congestionLevel: "low" | "moderate" | "heavy" | "severe";
  estimatedDelayMinutes: number;
  description: string;
  recommendation: string;
}

interface ContextSummary {
  weather?: WeatherData;
  traffic?: TrafficData;
  isWeekend: boolean;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  suggestions: string[];
}

/**
 * Get weather data for a location and time
 *
 * In production, replace with actual weather API call
 */
export async function getWeather(
  location: string,
  dateTime: Date
): Promise<WeatherData> {
  // Placeholder implementation - returns mock data
  // In production, call OpenWeatherMap or similar API

  const hour = dateTime.getHours();
  const month = dateTime.getMonth();

  // Simple mock logic based on time of day and season
  const isWinter = month >= 11 || month <= 2;
  const isSummer = month >= 5 && month <= 8;

  // Mock weather conditions
  const conditions: WeatherData["condition"][] = [
    "clear",
    "cloudy",
    "rainy",
    "clear",
    "cloudy",
    "clear",
    "windy",
  ];
  const conditionIndex = (dateTime.getDate() + hour) % conditions.length;
  const condition = conditions[conditionIndex];

  // Mock temperature based on season and time
  let baseTemp = isSummer ? 25 : isWinter ? 5 : 15;
  if (hour >= 10 && hour <= 16) baseTemp += 5;
  if (hour >= 22 || hour <= 6) baseTemp -= 5;

  const descriptions: Record<WeatherData["condition"], string> = {
    clear: "Clear skies",
    cloudy: "Overcast",
    rainy: "Rain expected",
    stormy: "Thunderstorms",
    snowy: "Snow expected",
    windy: "Strong winds",
  };

  const isGoodForOutdoor =
    condition === "clear" ||
    (condition === "cloudy" && baseTemp > 10 && baseTemp < 30);

  return {
    temperature: baseTemp,
    condition,
    humidity: condition === "rainy" ? 85 : 60,
    windSpeed: condition === "windy" ? 30 : 10,
    description: descriptions[condition],
    isGoodForOutdoor,
  };
}

/**
 * Get traffic conditions for a route
 *
 * In production, replace with actual traffic API call
 */
export async function getTraffic(
  origin: string,
  destination: string,
  departureTime: Date
): Promise<TrafficData> {
  // Placeholder implementation - returns mock data
  // In production, call Google Maps or similar API

  const hour = departureTime.getHours();
  const dayOfWeek = departureTime.getDay();
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

  // Simple mock logic based on typical traffic patterns
  let congestionLevel: TrafficData["congestionLevel"] = "low";
  let estimatedDelayMinutes = 0;

  if (!isWeekendDay) {
    // Morning rush: 7-9 AM
    if (hour >= 7 && hour <= 9) {
      congestionLevel = "heavy";
      estimatedDelayMinutes = 20;
    }
    // Evening rush: 5-7 PM
    else if (hour >= 17 && hour <= 19) {
      congestionLevel = "heavy";
      estimatedDelayMinutes = 25;
    }
    // Midday
    else if (hour >= 11 && hour <= 14) {
      congestionLevel = "moderate";
      estimatedDelayMinutes = 10;
    }
  } else {
    // Weekend - generally lighter traffic
    if (hour >= 10 && hour <= 18) {
      congestionLevel = "moderate";
      estimatedDelayMinutes = 5;
    }
  }

  const descriptions: Record<TrafficData["congestionLevel"], string> = {
    low: "Traffic is light",
    moderate: "Moderate traffic conditions",
    heavy: "Heavy traffic expected",
    severe: "Severe congestion - consider alternatives",
  };

  const recommendations: Record<TrafficData["congestionLevel"], string> = {
    low: "No adjustments needed",
    moderate: "Allow an extra 5-10 minutes",
    heavy: "Leave 15-20 minutes earlier than usual",
    severe: "Consider rescheduling or working remotely",
  };

  return {
    congestionLevel,
    estimatedDelayMinutes,
    description: descriptions[congestionLevel],
    recommendation: recommendations[congestionLevel],
  };
}

/**
 * Get time of day category
 */
export function getTimeOfDay(
  date: Date
): "morning" | "afternoon" | "evening" | "night" {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Get comprehensive context for scheduling decisions
 */
export async function getEnvironmentContext(
  location: string,
  dateTime: Date,
  needsTravel: boolean = false,
  destination?: string
): Promise<ContextSummary> {
  const weather = await getWeather(location, dateTime);
  const suggestions: string[] = [];

  let traffic: TrafficData | undefined;
  if (needsTravel && destination) {
    traffic = await getTraffic(location, destination, dateTime);

    if (traffic.congestionLevel === "heavy" || traffic.congestionLevel === "severe") {
      suggestions.push(traffic.recommendation);
    }
  }

  // Weather-based suggestions
  if (!weather.isGoodForOutdoor) {
    if (weather.condition === "rainy") {
      suggestions.push("Consider indoor alternatives or bring rain gear");
    } else if (weather.condition === "stormy") {
      suggestions.push("Outdoor activities not recommended - consider rescheduling");
    } else if (weather.temperature < 5) {
      suggestions.push("Very cold - dress warmly if going outside");
    } else if (weather.temperature > 30) {
      suggestions.push("Very hot - stay hydrated and avoid peak sun hours");
    }
  }

  // Time-based suggestions
  const timeOfDay = getTimeOfDay(dateTime);
  const weekend = isWeekend(dateTime);

  if (timeOfDay === "night" && !weekend) {
    suggestions.push("Late scheduling - ensure adequate rest time");
  }

  return {
    weather,
    traffic,
    isWeekend: weekend,
    timeOfDay,
    suggestions,
  };
}

/**
 * Check if weather is suitable for a specific activity type
 */
export async function isWeatherSuitable(
  location: string,
  dateTime: Date,
  activityType: "outdoor_exercise" | "outdoor_errand" | "indoor" | "any"
): Promise<{ suitable: boolean; reason?: string }> {
  if (activityType === "indoor" || activityType === "any") {
    return { suitable: true };
  }

  const weather = await getWeather(location, dateTime);

  if (activityType === "outdoor_exercise") {
    if (weather.condition === "stormy" || weather.condition === "snowy") {
      return { suitable: false, reason: `${weather.description} - not safe for outdoor exercise` };
    }
    if (weather.temperature < 0) {
      return { suitable: false, reason: "Too cold for outdoor exercise" };
    }
    if (weather.temperature > 35) {
      return { suitable: false, reason: "Too hot for outdoor exercise" };
    }
    if (weather.condition === "rainy") {
      return { suitable: false, reason: "Rain expected - consider indoor alternatives" };
    }
  }

  if (activityType === "outdoor_errand") {
    if (weather.condition === "stormy") {
      return { suitable: false, reason: "Storms expected - postpone if possible" };
    }
    if (weather.condition === "rainy" && weather.humidity > 80) {
      return { suitable: false, reason: "Heavy rain expected - consider rescheduling" };
    }
  }

  return { suitable: true };
}

/**
 * Get the best time window for an activity based on context
 */
export async function suggestBestTimeWindow(
  location: string,
  date: Date,
  activityType: "outdoor_exercise" | "outdoor_errand" | "indoor" | "commute",
  preferredHours: number[] = [8, 9, 10, 11, 14, 15, 16, 17, 18]
): Promise<{ hour: number; reason: string }[]> {
  const suggestions: { hour: number; reason: string }[] = [];

  for (const hour of preferredHours) {
    const dateTime = new Date(date);
    dateTime.setHours(hour, 0, 0, 0);

    const weather = await getWeather(location, dateTime);
    const reasons: string[] = [];

    // Check weather suitability
    if (activityType === "outdoor_exercise" || activityType === "outdoor_errand") {
      if (weather.isGoodForOutdoor) {
        reasons.push(`Good weather (${weather.temperature}°C, ${weather.description})`);
      } else {
        continue; // Skip this hour
      }
    }

    // Check traffic for commute-type activities
    if (activityType === "commute") {
      const traffic = await getTraffic(location, "destination", dateTime);
      if (traffic.congestionLevel === "low") {
        reasons.push("Low traffic expected");
      } else if (traffic.congestionLevel === "moderate") {
        reasons.push("Moderate traffic");
      } else {
        continue; // Skip rush hours
      }
    }

    if (reasons.length > 0 || activityType === "indoor") {
      suggestions.push({
        hour,
        reason: reasons.length > 0 ? reasons.join(", ") : "Indoor activity - any time works",
      });
    }
  }

  return suggestions;
}

/**
 * Format context for AI
 */
export function formatContextForAI(context: ContextSummary): string {
  const parts: string[] = [];

  if (context.weather) {
    parts.push(
      `Weather: ${context.weather.description}, ${context.weather.temperature}°C` +
        (context.weather.isGoodForOutdoor ? " (good for outdoor)" : " (indoor preferred)")
    );
  }

  if (context.traffic) {
    parts.push(`Traffic: ${context.traffic.description} (${context.traffic.recommendation})`);
  }

  parts.push(`Time: ${context.timeOfDay}${context.isWeekend ? " (weekend)" : " (weekday)"}`);

  if (context.suggestions.length > 0) {
    parts.push("Suggestions:\n" + context.suggestions.map((s) => `- ${s}`).join("\n"));
  }

  return parts.join("\n");
}
