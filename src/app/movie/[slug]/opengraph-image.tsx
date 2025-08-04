import { ImageResponse } from "next/og";
import { cache } from "react";
import { extractIdFromSlug } from "@/lib/utils";
import { tmdbApi } from "@/lib/tmdb";

// Using Edge runtime for better performance
export const runtime = "edge";

// Image metadata
export const alt = "Movie Details - WatchList";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Cache for 30 days to match the parent movie page revalidation period
export const revalidate = 2592000;

// Cached function to fetch only necessary data for OG image
const getMovieOGData = cache(async (movieId: number) => {
  try {
    // Only fetch the basic movie details, no need for credits, videos, etc.
    const movieDetails = await tmdbApi.getMovieDetails(movieId);
    return {
      title: movieDetails.title || "Movie",
      overview:
        movieDetails.overview || "Discover cast, crew, reviews, and more",
    };
  } catch (error) {
    console.error("Error fetching movie data:", error);
    return {
      title: "Movie",
      overview: "Discover cast, crew, reviews, and more",
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
  const movieId = extractIdFromSlug(slug);

  if (!movieId) {
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
        Movie Not Found
      </div>,
      { ...size },
    );
  }

  const { title: movieTitle, overview } = await getMovieOGData(movieId);

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
          🎬 WatchList
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
          MOVIE
        </div>

        <h1
          style={{
            fontSize: "72px",
            fontWeight: "bold",
            marginBottom: "30px",
            lineHeight: "1.1",
          }}
        >
          {movieTitle}
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
