/**
 * Context Tools for AI Agents
 *
 * These tools provide external context like weather and traffic
 * that can influence scheduling decisions.
 *
 * Traffic: TomTom Routing API (https://developer.tomtom.com)
 * Weather: Open-Meteo API (https://open-meteo.com) - Free, no API key required
 */

import { format, addHours, isWeekend } from "date-fns";

interface WeatherData {
  temperature: number; // Celsius
  condition: "clear" | "cloudy" | "rainy" | "stormy" | "snowy" | "windy" | "foggy";
  humidity: number;
  windSpeed: number;
  description: string;
  isGoodForOutdoor: boolean;
  source: "open-meteo" | "mock";
}

// Open-Meteo API response types
interface OpenMeteoGeocodingResult {
  results?: {
    latitude: number;
    longitude: number;
    name: string;
    country: string;
  }[];
}

interface OpenMeteoWeatherResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    weather_code: number[];
    wind_speed_10m: number[];
  };
}

// Cache for weather geocoding (separate from traffic geocoding)
const weatherGeocodeCache = new Map<string, { lat: number; lon: number }>();

interface TrafficData {
  congestionLevel: "low" | "moderate" | "heavy" | "severe";
  estimatedDelayMinutes: number;
  travelTimeMinutes: number;
  travelTimeWithoutTrafficMinutes: number;
  distanceKm: number;
  description: string;
  recommendation: string;
  source: "tomtom" | "mock";
}

interface TomTomRouteSummary {
  lengthInMeters: number;
  travelTimeInSeconds: number;
  trafficDelayInSeconds: number;
  trafficLengthInMeters: number;
  departureTime: string;
  arrivalTime: string;
  noTrafficTravelTimeInSeconds: number;
}

interface TomTomRouteResponse {
  routes: {
    summary: TomTomRouteSummary;
  }[];
}

// Cache for geocoded locations to avoid repeated API calls
const geocodeCache = new Map<string, { lat: number; lon: number }>();

const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;

interface ContextSummary {
  weather?: WeatherData;
  traffic?: TrafficData;
  isWeekend: boolean;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  suggestions: string[];
}

/**
 * Geocode a location name using Open-Meteo Geocoding API
 */
async function geocodeForWeather(location: string): Promise<{ lat: number; lon: number } | null> {
  // Check cache first
  if (weatherGeocodeCache.has(location)) {
    return weatherGeocodeCache.get(location)!;
  }

  // Handle generic "local" location - default to a reasonable location
  // In production, you'd get user's actual location from their profile
  if (location === "local") {
    // Default to London if no specific location
    return { lat: 51.5074, lon: -0.1278 };
  }

  try {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodedLocation}&count=1&language=en&format=json`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Weather] Geocoding failed: ${response.status}`);
      return null;
    }

    const data: OpenMeteoGeocodingResult = await response.json();
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const coords = { lat: result.latitude, lon: result.longitude };
      weatherGeocodeCache.set(location, coords);
      console.log(`[Weather] Geocoded "${location}" to ${result.name}, ${result.country}`);
      return coords;
    }

    return null;
  } catch (error) {
    console.error("[Weather] Geocoding error:", error);
    return null;
  }
}

/**
 * Map Open-Meteo weather codes to our condition types
 * https://open-meteo.com/en/docs#weathervariables
 */
function mapWeatherCode(code: number): { condition: WeatherData["condition"]; description: string } {
  // WMO Weather interpretation codes
  if (code === 0) {
    return { condition: "clear", description: "Clear sky" };
  } else if (code >= 1 && code <= 3) {
    return { condition: "cloudy", description: code === 1 ? "Mainly clear" : code === 2 ? "Partly cloudy" : "Overcast" };
  } else if (code >= 45 && code <= 48) {
    return { condition: "foggy", description: "Foggy" };
  } else if (code >= 51 && code <= 55) {
    return { condition: "rainy", description: "Drizzle" };
  } else if (code >= 56 && code <= 57) {
    return { condition: "rainy", description: "Freezing drizzle" };
  } else if (code >= 61 && code <= 65) {
    return { condition: "rainy", description: code === 61 ? "Light rain" : code === 63 ? "Moderate rain" : "Heavy rain" };
  } else if (code >= 66 && code <= 67) {
    return { condition: "rainy", description: "Freezing rain" };
  } else if (code >= 71 && code <= 77) {
    return { condition: "snowy", description: code <= 75 ? "Snow" : "Snow grains" };
  } else if (code >= 80 && code <= 82) {
    return { condition: "rainy", description: "Rain showers" };
  } else if (code >= 85 && code <= 86) {
    return { condition: "snowy", description: "Snow showers" };
  } else if (code >= 95 && code <= 99) {
    return { condition: "stormy", description: code === 95 ? "Thunderstorm" : "Thunderstorm with hail" };
  }

  return { condition: "cloudy", description: "Unknown conditions" };
}

/**
 * Get weather data for a location and time using Open-Meteo API
 * Falls back to mock data if API fails
 */
export async function getWeather(
  location: string,
  dateTime: Date
): Promise<WeatherData> {
  try {
    const weatherData = await getOpenMeteoWeather(location, dateTime);
    if (weatherData) {
      return weatherData;
    }
  } catch (error) {
    console.error("[Weather] Open-Meteo API error, falling back to mock:", error);
  }

  // Fallback to mock data
  return getMockWeather(dateTime);
}

/**
 * Get real weather data from Open-Meteo API
 */
async function getOpenMeteoWeather(
  location: string,
  dateTime: Date
): Promise<WeatherData | null> {
  // Geocode the location
  const coords = await geocodeForWeather(location);
  if (!coords) {
    console.warn(`[Weather] Could not geocode location: ${location}`);
    return null;
  }

  // Format date for API (YYYY-MM-DD)
  const dateStr = format(dateTime, "yyyy-MM-dd");

  // Build Open-Meteo API URL
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Weather] Open-Meteo API failed: ${response.status}`);
      return null;
    }

    const data: OpenMeteoWeatherResponse = await response.json();

    if (!data.hourly || !data.hourly.time || data.hourly.time.length === 0) {
      console.warn("[Weather] No hourly data in response");
      return null;
    }

    // Find the closest hour in the forecast
    const targetHour = dateTime.getHours();
    const hourIndex = Math.min(targetHour, data.hourly.time.length - 1);

    const temperature = Math.round(data.hourly.temperature_2m[hourIndex]);
    const humidity = Math.round(data.hourly.relative_humidity_2m[hourIndex]);
    const windSpeed = Math.round(data.hourly.wind_speed_10m[hourIndex]);
    const weatherCode = data.hourly.weather_code[hourIndex];

    const { condition, description } = mapWeatherCode(weatherCode);

    // Determine if good for outdoor activities
    const isGoodForOutdoor =
      (condition === "clear" || condition === "cloudy") &&
      temperature > 5 &&
      temperature < 32 &&
      windSpeed < 40;

    console.log(`[Weather] ${location} at ${format(dateTime, "HH:mm")}: ${temperature}°C, ${description}`);

    return {
      temperature,
      condition,
      humidity,
      windSpeed,
      description,
      isGoodForOutdoor,
      source: "open-meteo",
    };
  } catch (error) {
    console.error("[Weather] Error calling Open-Meteo API:", error);
    return null;
  }
}

/**
 * Mock weather data based on typical patterns
 * Used as fallback when Open-Meteo API fails
 */
function getMockWeather(dateTime: Date): WeatherData {
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
    foggy: "Foggy conditions",
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
    source: "mock",
  };
}

/**
 * Geocode an address using TomTom Search API
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  // Check cache first
  if (geocodeCache.has(address)) {
    return geocodeCache.get(address)!;
  }

  if (!TOMTOM_API_KEY) {
    console.warn("[Traffic] No TomTom API key configured");
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://api.tomtom.com/search/2/geocode/${encodedAddress}.json?key=${TOMTOM_API_KEY}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Traffic] Geocoding failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const position = data.results[0].position;
      const coords = { lat: position.lat, lon: position.lon };
      geocodeCache.set(address, coords);
      return coords;
    }

    return null;
  } catch (error) {
    console.error("[Traffic] Geocoding error:", error);
    return null;
  }
}

/**
 * Get traffic conditions for a route using TomTom Routing API
 * Falls back to mock data if API is not configured or fails
 */
export async function getTraffic(
  origin: string,
  destination: string,
  departureTime: Date
): Promise<TrafficData> {
  // Try TomTom API first
  if (TOMTOM_API_KEY && origin !== "home" && destination !== "destination") {
    try {
      const trafficData = await getTomTomTraffic(origin, destination, departureTime);
      if (trafficData) {
        return trafficData;
      }
    } catch (error) {
      console.error("[Traffic] TomTom API error, falling back to mock:", error);
    }
  }

  // Fallback to mock data
  return getMockTraffic(departureTime);
}

/**
 * Get real traffic data from TomTom Routing API
 */
async function getTomTomTraffic(
  origin: string,
  destination: string,
  departureTime: Date
): Promise<TrafficData | null> {
  // Geocode origin and destination
  const [originCoords, destCoords] = await Promise.all([
    geocodeAddress(origin),
    geocodeAddress(destination),
  ]);

  if (!originCoords || !destCoords) {
    console.warn("[Traffic] Could not geocode addresses");
    return null;
  }

  // Format departure time for TomTom API
  const departAt = departureTime.toISOString();

  // Call TomTom Routing API
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${originCoords.lat},${originCoords.lon}:${destCoords.lat},${destCoords.lon}/json?key=${TOMTOM_API_KEY}&departAt=${departAt}&traffic=true&travelMode=car`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Traffic] TomTom Routing API failed: ${response.status}`);
      return null;
    }

    const data: TomTomRouteResponse = await response.json();

    if (!data.routes || data.routes.length === 0) {
      console.warn("[Traffic] No routes found");
      return null;
    }

    const summary = data.routes[0].summary;

    // Calculate metrics
    const travelTimeMinutes = Math.round(summary.travelTimeInSeconds / 60);
    const noTrafficTimeMinutes = Math.round(summary.noTrafficTravelTimeInSeconds / 60);
    const delayMinutes = Math.round(summary.trafficDelayInSeconds / 60);
    const distanceKm = Math.round(summary.lengthInMeters / 100) / 10;

    // Determine congestion level based on delay percentage
    const delayPercentage = noTrafficTimeMinutes > 0
      ? (delayMinutes / noTrafficTimeMinutes) * 100
      : 0;

    let congestionLevel: TrafficData["congestionLevel"];
    if (delayPercentage < 10) {
      congestionLevel = "low";
    } else if (delayPercentage < 25) {
      congestionLevel = "moderate";
    } else if (delayPercentage < 50) {
      congestionLevel = "heavy";
    } else {
      congestionLevel = "severe";
    }

    const descriptions: Record<TrafficData["congestionLevel"], string> = {
      low: "Traffic is light",
      moderate: "Moderate traffic conditions",
      heavy: "Heavy traffic expected",
      severe: "Severe congestion - consider alternatives",
    };

    const recommendations: Record<TrafficData["congestionLevel"], string> = {
      low: "No adjustments needed",
      moderate: `Allow an extra ${Math.max(5, delayMinutes)} minutes`,
      heavy: `Leave ${delayMinutes} minutes earlier than usual`,
      severe: `Significant delays expected (${delayMinutes} min). Consider rescheduling`,
    };

    return {
      congestionLevel,
      estimatedDelayMinutes: delayMinutes,
      travelTimeMinutes,
      travelTimeWithoutTrafficMinutes: noTrafficTimeMinutes,
      distanceKm,
      description: descriptions[congestionLevel],
      recommendation: recommendations[congestionLevel],
      source: "tomtom",
    };
  } catch (error) {
    console.error("[Traffic] Error calling TomTom API:", error);
    return null;
  }
}

/**
 * Mock traffic data based on typical patterns
 * Used when TomTom API is not configured or fails
 */
function getMockTraffic(departureTime: Date): TrafficData {
  const hour = departureTime.getHours();
  const dayOfWeek = departureTime.getDay();
  const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

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
    travelTimeMinutes: 20 + estimatedDelayMinutes, // Assumed base travel time
    travelTimeWithoutTrafficMinutes: 20,
    distanceKm: 10, // Assumed
    description: descriptions[congestionLevel],
    recommendation: recommendations[congestionLevel],
    source: "mock",
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
