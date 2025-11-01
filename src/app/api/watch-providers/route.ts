import { NextRequest, NextResponse } from "next/server";
import {
  getCachedMovieWatchProviders,
  getCachedTVWatchProviders,
} from "@/lib/tmdb-cache";
import { getRegion } from "@/lib/region-server";
import { getRegionCode } from "@/lib/region";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const mediaType = searchParams.get("mediaType");

    if (!id || !mediaType) {
      return NextResponse.json(
        { error: "Missing id or mediaType parameter" },
        { status: 400 }
      );
    }

    if (mediaType !== "movie" && mediaType !== "tv") {
      return NextResponse.json(
        { error: "Invalid mediaType. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    const currentRegion = await getRegion();
    const regionCode = getRegionCode(currentRegion);

    let watchProviders;
    if (mediaType === "movie") {
      watchProviders = await getCachedMovieWatchProviders(
        parseInt(id),
        regionCode
      );
    } else {
      watchProviders = await getCachedTVWatchProviders(
        parseInt(id),
        regionCode
      );
    }

    const regionProviders = watchProviders.results[regionCode];
    const flatrateProviders = regionProviders?.flatrate || [];

    return NextResponse.json({
      providers: flatrateProviders,
      region: regionCode,
    });
  } catch (error) {
    console.error("Error fetching watch providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch watch providers" },
      { status: 500 }
    );
  }
}
