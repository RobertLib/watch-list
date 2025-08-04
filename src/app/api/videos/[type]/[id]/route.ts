import { NextRequest, NextResponse } from "next/server";
import { checkBotId } from "botid/server";

// Server-side TMDB config (bez NEXT_PUBLIC_)
const TMDB_CONFIG = {
  BASE_URL: "https://api.themoviedb.org/3",
  headers: {
    Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
    "Content-Type": "application/json",
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { id, type } = await params;

    // Validate parameters
    if (!id || !type || !["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid parameters" },
        { status: 400 }
      );
    }

    const url = `${TMDB_CONFIG.BASE_URL}/${type}/${id}/videos`;
    const response = await fetch(url, {
      headers: TMDB_CONFIG.headers,
      next: { revalidate: 86400 }, // Cache for 24 hours
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500 }
    );
  }
}
