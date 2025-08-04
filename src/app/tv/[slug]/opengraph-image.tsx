import { ImageResponse } from "next/og";
import { cache } from "react";
import { extractIdFromSlug } from "@/lib/utils";
import { tmdbApi } from "@/lib/tmdb";

// Using Edge runtime for better performance
export const runtime = "edge";

// Image metadata
export const alt = "TV Show Details - WatchList";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Cache for 30 days to match the parent TV show page revalidation period
export const revalidate = 2592000;

// Cached function to fetch only necessary data for OG image
const getTVOGData = cache(async (tvId: number) => {
  try {
    // Only fetch the basic TV show details, no need for credits, videos, etc.
    const tvDetails = await tmdbApi.getTVShowDetails(tvId);
    return {
      title: tvDetails.name || "TV Show",
      overview:
        tvDetails.overview || "Discover episodes, seasons, cast, and more",
    };
  } catch (error) {
    console.error("Error fetching TV show data:", error);
    return {
      title: "TV Show",
      overview: "Discover episodes, seasons, cast, and more",
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
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#16213e",
          color: "white",
          fontSize: "48px",
          fontWeight: "bold",
        }}
      >
        TV Show Not Found
      </div>,
      { ...size },
    );
  }

  const { title: showTitle, overview } = await getTVOGData(tvId);

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#16213e",
        color: "white",
      }}
    >
      {/* Logo/Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          position: "absolute",
          top: "40px",
          left: "40px",
        }}
      >
        <div
          style={{
            fontSize: "24px",
            fontWeight: "bold",
          }}
        >
          📺 WatchList
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
          }}
        >
          TV SHOW
        </div>

        <h1
          style={{
            fontSize: "72px",
            fontWeight: "bold",
            marginBottom: "30px",
            lineHeight: "1.1",
          }}
        >
          {showTitle}
        </h1>

        <p
          style={{
            fontSize: "24px",
            opacity: 0.9,
            lineHeight: "1.4",
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
    </div>,
    {
      ...size,
    },
  );
}
