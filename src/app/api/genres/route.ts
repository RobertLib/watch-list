import { NextResponse } from "next/server";
import { TMDB_CONFIG } from "@/lib/tmdb-cache";

export const revalidate = 31536000; // 1 year — genre lists almost never change

export async function GET() {
  try {
    const headers = TMDB_CONFIG.headers;
    const [movieGenresResponse, tvGenresResponse] = await Promise.all([
      fetch(`${TMDB_CONFIG.BASE_URL}/genre/movie/list`, {
        headers,
        next: { revalidate: 31536000 }, // Cache for 1 year
      }),
      fetch(`${TMDB_CONFIG.BASE_URL}/genre/tv/list`, {
        headers,
        next: { revalidate: 31536000 }, // Cache for 1 year
      }),
    ]);

    if (!movieGenresResponse.ok || !tvGenresResponse.ok) {
      throw new Error(
        `Failed to fetch genres from TMDB: movie=${movieGenresResponse.status}, tv=${tvGenresResponse.status}`,
      );
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
      { status: 500 },
    );
  }
}
