import { ImageResponse } from "next/og";
import { cache } from "react";
import { extractIdFromSlug } from "@/lib/utils";
import { tmdbApi } from "@/lib/tmdb";

// Using Node.js runtime due to Edge Function size limitations
// export const runtime = "edge";

// Image metadata
export const alt = "TV Show Details - WatchList";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Cache for 1 hour (3600 seconds)
export const revalidate = 3600;

// Cached function to fetch only necessary data for OG image
const getTVOGData = cache(async (tvId: number) => {
  try {
    // Only fetch the basic TV show details, no need for credits, videos, etc.
    const tvDetails = await tmdbApi.getTVShowDetails(tvId);
    return {
      title: tvDetails.name || "TV Show",
      overview:
        tvDetails.overview || "Discover episodes, seasons, cast, and more",
      backdropUrl: tvDetails.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${tvDetails.backdrop_path}`
        : null,
    };
  } catch (error) {
    console.error("Error fetching TV show data:", error);
    return {
      title: "TV Show",
      overview: "Discover episodes, seasons, cast, and more",
      backdropUrl: null,
    };
  }
});

// Image generation
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tvId = extractIdFromSlug(slug);

  if (!tvId) {
    // Return default image if no valid ID
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
            color: "white",
            fontSize: "48px",
            fontWeight: "bold",
          }}
        >
          TV Show Not Found
        </div>
      ),
      { ...size }
    );
  }

  const { title: showTitle, overview, backdropUrl } = await getTVOGData(tvId);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: backdropUrl
            ? `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url(${backdropUrl})`
            : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: "white",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Background Pattern - only show if no backdrop */}
        {!backdropUrl && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage:
                "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 0%, transparent 50%)",
            }}
          />
        )}

        {/* Logo/Brand - smaller for TV show pages */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "30px",
            position: "absolute",
            top: "40px",
            left: "40px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              background: "linear-gradient(45deg, #ff6b6b, #4ecdc4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "15px",
              fontSize: "20px",
            }}
          >
            📺
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              background: "linear-gradient(45deg, #ff6b6b, #4ecdc4)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            WatchList
          </div>
        </div>

        {/* Main Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            maxWidth: "900px",
            padding: "0 60px",
          }}
        >
          <div
            style={{
              fontSize: "32px",
              opacity: 0.8,
              marginBottom: "20px",
              textTransform: "uppercase",
              letterSpacing: "3px",
              textShadow: backdropUrl ? "0 2px 4px rgba(0,0,0,0.8)" : "none",
            }}
          >
            TV Show
          </div>

          <h1
            style={{
              fontSize: "72px",
              fontWeight: "bold",
              marginBottom: "30px",
              lineHeight: "1.1",
              textAlign: "center",
              textShadow: backdropUrl ? "0 4px 8px rgba(0,0,0,0.8)" : "none",
            }}
          >
            {showTitle}
          </h1>

          <p
            style={{
              fontSize: "24px",
              opacity: 0.9,
              lineHeight: "1.4",
              textAlign: "center",
              textShadow: backdropUrl ? "0 2px 4px rgba(0,0,0,0.8)" : "none",
              maxWidth: "800px",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {overview.length > 150
              ? `${overview.substring(0, 150)}...`
              : overview}
          </p>
        </div>

        {/* Bottom decoration */}
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            right: "0",
            height: "4px",
            background:
              "linear-gradient(90deg, #ff6b6b, #4ecdc4, #45b7d1, #f39c12)",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
