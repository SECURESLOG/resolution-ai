import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserCalendarProviders } from "@/lib/calendar";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providers = await getUserCalendarProviders(session.user.id);

    return NextResponse.json({
      providers,
      google: providers.includes("google"),
      microsoft: providers.includes("azure-ad"),
    });
  } catch (error) {
    console.error("Error fetching calendar providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar providers" },
      { status: 500 }
    );
  }
}
