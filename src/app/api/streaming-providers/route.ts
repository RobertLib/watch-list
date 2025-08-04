import { NextRequest, NextResponse } from "next/server";
import { checkBotId } from "botid/server";
import { getRegion } from "@/lib/region-server";
import { getRegionCode, isValidRegion } from "@/lib/region";
import { TMDB_CONFIG } from "@/lib/tmdb-cache";
import type { Region } from "@/lib/region-server";

export interface StreamingProviderFromAPI {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

// Global popular streaming platforms - ordered by global popularity
// These get sorted to the top regardless of TMDB's display_priority
const POPULAR_PROVIDER_IDS = [
  8, // Netflix
  337, // Disney Plus
  9, // Amazon Prime Video
  119, // Amazon Prime Video (alternate ID)
  1899, // Max (HBO Max)
  384, // HBO Max
  350, // Apple TV+
  2, // Apple TV
  1773, // SkyShowtime
  531, // Paramount+
  15, // Hulu
  387, // Peacock
  39, // Now TV
  283, // Crunchyroll
];

const POPULAR_PROVIDER_SET = new Set(POPULAR_PROVIDER_IDS);

export async function GET(request: NextRequest) {
  try {
    const verification = await checkBotId();
    if (verification.isBot) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if region is provided in query params (for real-time updates)
    const searchParams = request.nextUrl.searchParams;
    const regionParam = searchParams.get("region");

    let regionCode: string;
    if (regionParam && isValidRegion(regionParam)) {
      regionCode = getRegionCode(regionParam as Region);
    } else {
      const currentRegion = await getRegion();
      regionCode = getRegionCode(currentRegion);
    }

    // Fetch movie providers for the region
    const response = await fetch(
      `${TMDB_CONFIG.BASE_URL}/watch/providers/movie?watch_region=${regionCode}`,
      {
        headers: TMDB_CONFIG.headers,
        next: {
          revalidate: 86400, // Cache for 24 hours - providers don't change often
          tags: ["tmdb", "streaming-providers", `region-${regionCode}`],
        },
      }
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    const providers: StreamingProviderFromAPI[] = data.results || [];

    // Sort providers: popular ones first, then by display_priority
    const sortedProviders = providers
      .sort((a, b) => {
        const aIsPopular = POPULAR_PROVIDER_SET.has(a.provider_id);
        const bIsPopular = POPULAR_PROVIDER_SET.has(b.provider_id);

        // Popular providers come first
        if (aIsPopular && !bIsPopular) return -1;
        if (!aIsPopular && bIsPopular) return 1;

        // Among popular providers, sort by our predefined order
        if (aIsPopular && bIsPopular) {
          return (
            POPULAR_PROVIDER_IDS.indexOf(a.provider_id) -
            POPULAR_PROVIDER_IDS.indexOf(b.provider_id)
          );
        }

        // For non-popular, use display_priority
        return a.display_priority - b.display_priority;
      })
      .slice(0, 30); // Limit to top 30 providers

    return NextResponse.json({
      providers: sortedProviders,
      region: regionCode,
    });
  } catch (error) {
    console.error("Error fetching streaming providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch streaming providers" },
      { status: 500 }
    );
  }
}
