/**
 * User Locations API
 *
 * GET - Fetch user's saved locations
 * POST - Save/update a location
 * DELETE - Remove a location
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Location types that can be saved
const VALID_LOCATION_TYPES = ["home", "work", "gym", "school", "other"] as const;
type LocationType = (typeof VALID_LOCATION_TYPES)[number];

interface SavedLocation {
  type: LocationType;
  label: string;
  address: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get locations from user preferences
    const locationPref = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "saved_locations",
        },
      },
    });

    const locations: SavedLocation[] = (locationPref?.value as unknown as SavedLocation[]) || [];

    return NextResponse.json({ locations });
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, label, address } = body;

    if (!type || !address) {
      return NextResponse.json(
        { error: "type and address are required" },
        { status: 400 }
      );
    }

    if (!VALID_LOCATION_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_LOCATION_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Get existing locations
    const existingPref = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "saved_locations",
        },
      },
    });

    let locations: SavedLocation[] = (existingPref?.value as unknown as SavedLocation[]) || [];

    // Update or add the location
    const existingIndex = locations.findIndex((l) => l.type === type);
    const newLocation: SavedLocation = {
      type,
      label: label || type.charAt(0).toUpperCase() + type.slice(1),
      address,
    };

    if (existingIndex >= 0) {
      locations[existingIndex] = newLocation;
    } else {
      locations.push(newLocation);
    }

    // Save to preferences
    await prisma.userPreference.upsert({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "saved_locations",
        },
      },
      update: {
        value: locations as object,
        source: "explicit",
        confidence: 1.0,
      },
      create: {
        userId: session.user.id,
        key: "saved_locations",
        value: locations as object,
        source: "explicit",
        confidence: 1.0,
      },
    });

    return NextResponse.json({
      success: true,
      location: newLocation,
      message: `${newLocation.label} location saved`,
    });
  } catch (error) {
    console.error("Error saving location:", error);
    return NextResponse.json(
      { error: "Failed to save location" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    if (!type) {
      return NextResponse.json(
        { error: "type parameter required" },
        { status: 400 }
      );
    }

    // Get existing locations
    const existingPref = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "saved_locations",
        },
      },
    });

    if (!existingPref) {
      return NextResponse.json({ error: "No locations found" }, { status: 404 });
    }

    let locations: SavedLocation[] = (existingPref.value as unknown as SavedLocation[]) || [];
    locations = locations.filter((l) => l.type !== type);

    // Save updated locations
    await prisma.userPreference.update({
      where: {
        userId_key: {
          userId: session.user.id,
          key: "saved_locations",
        },
      },
      data: {
        value: locations as object,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${type} location removed`,
    });
  } catch (error) {
    console.error("Error deleting location:", error);
    return NextResponse.json(
      { error: "Failed to delete location" },
      { status: 500 }
    );
  }
}
