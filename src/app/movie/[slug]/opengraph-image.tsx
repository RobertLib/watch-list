import { ImageResponse } from "next/og";
import { extractIdFromSlug } from "@/lib/utils";
import { tmdbApi } from "@/lib/tmdb";

// Image metadata
export const alt = "Movie Details - WatchList";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Image generation
export default async function Image({ params }: { params: { slug: string } }) {
  // Extract ID from slug and get real movie data
  const movieId = extractIdFromSlug(params.slug);

  let movieTitle = "Movie";
  let backdropUrl = null;
  let overview = "Discover cast, crew, reviews, and more";

  if (movieId) {
    try {
      const movieDetails = await tmdbApi.getMovieDetails(movieId);
      movieTitle = movieDetails.title || movieTitle;
      overview = movieDetails.overview || overview;
      backdropUrl = movieDetails.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${movieDetails.backdrop_path}`
        : null;
    } catch (error) {
      console.error("Error fetching movie data:", error);
    }
  }

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

        {/* Logo/Brand - smaller for movie pages */}
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
            🎬
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
            Movie
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
            {movieTitle}
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
