import { NextResponse } from "next/server";
import { checkBotId } from "botid/server";

// Server-side TMDB config
const TMDB_CONFIG = {
  BASE_URL: "https://api.themoviedb.org/3",
  headers: {
    Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
    "Content-Type": "application/json",
  },
};

export async function GET() {
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const [movieGenresResponse, tvGenresResponse] = await Promise.all([
      fetch(`${TMDB_CONFIG.BASE_URL}/genre/movie/list`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 }, // Cache for 24 hours
      }),
      fetch(`${TMDB_CONFIG.BASE_URL}/genre/tv/list`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 }, // Cache for 24 hours
      }),
    ]);

    if (!movieGenresResponse.ok || !tvGenresResponse.ok) {
      throw new Error("Failed to fetch genres from TMDB");
    }

    const [movieGenres, tvGenres] = await Promise.all([
      movieGenresResponse.json(),
      tvGenresResponse.json(),
    ]);

    return NextResponse.json({
      movieGenres: movieGenres.genres,
      tvGenres: tvGenres.genres,
    });
  } catch (error) {
    console.error("Error fetching genres:", error);
    return NextResponse.json(
      { error: "Failed to fetch genres" },
      { status: 500 }
    );
  }
}
