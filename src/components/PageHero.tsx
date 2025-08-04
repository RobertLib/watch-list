import { Suspense } from "react";
import Image from "next/image";
import { Movie, TVShow } from "@/types/tmdb";
import { tmdbApi } from "@/lib/tmdb";

interface PageHeroContentProps {
  title: string;
  description: string;
  backgroundItem: Movie | TVShow;
}

function PageHeroContent({
  title,
  description,
  backgroundItem,
}: PageHeroContentProps) {
  const backdropUrl = tmdbApi.getImageUrl(
    backgroundItem.backdrop_path,
    "original"
  );

  const itemTitle =
    "title" in backgroundItem ? backgroundItem.title : backgroundItem.name;

  return (
    <div className="relative h-[40vh] sm:h-[45vh] lg:h-[50vh] w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={backdropUrl}
          alt={`Background image for ${itemTitle}`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-linear-to-r from-black/90 via-black/60 to-black/30" />
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative h-full flex items-center min-h-0 py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl space-y-3 sm:space-y-4">
            {/* Title */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              {title}
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg lg:text-xl text-gray-200 leading-relaxed max-w-xl">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PageHeroProps {
  title: string;
  description: string;
  mediaType?: "movie" | "tv" | "all";
}

// Helper function to get day of year (outside component to avoid impure function call during render)
function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

async function PageHeroAsync({
  title,
  description,
  mediaType = "all",
}: PageHeroProps) {
  let backgroundItem: Movie | TVShow | null = null;

  // Use static backgrounds to avoid issues with cookies during build process
  const staticBackgrounds = {
    movie: {
      id: 299536,
      title: "Avengers: Infinity War",
      overview:
        "As the Avengers and their allies have continued to protect the world from threats too large for any one hero to handle, a new danger has emerged from the cosmic shadows: Thanos.",
      backdrop_path: "/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
      poster_path: "/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg",
      release_date: "2018-04-25",
      vote_average: 8.2,
      vote_count: 25000,
      genre_ids: [12, 878, 28],
      adult: false,
      original_language: "en",
      original_title: "Avengers: Infinity War",
      popularity: 83.0,
      video: false,
      media_type: "movie" as const,
    },
    tv: {
      id: 94605,
      name: "Arcane",
      overview:
        "Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.",
      backdrop_path: "/rkB4LyZHo1NHXFEDHl9vSD9r1lI.jpg",
      poster_path: "/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg",
      first_air_date: "2021-11-06",
      vote_average: 8.7,
      vote_count: 4500,
      genre_ids: [16, 18, 10765],
      adult: false,
      original_language: "en",
      original_name: "Arcane",
      popularity: 120.0,
      media_type: "tv" as const,
    },
  };

  if (mediaType === "movie") {
    backgroundItem = staticBackgrounds.movie;
  } else if (mediaType === "tv") {
    backgroundItem = staticBackgrounds.tv;
  } else {
    // For "all" use stable selection based on date (changes daily)
    const dayOfYear = getDayOfYear();
    const useMovies = dayOfYear % 2 === 0;
    backgroundItem = useMovies ? staticBackgrounds.movie : staticBackgrounds.tv;
  }

  if (!backgroundItem || !backgroundItem.backdrop_path) {
    return <PageHeroSkeleton title={title} description={description} />;
  }

  return (
    <PageHeroContent
      title={title}
      description={description}
      backgroundItem={backgroundItem}
    />
  );
}

function PageHeroSkeleton({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative h-[40vh] sm:h-[45vh] lg:h-[50vh] bg-gray-800 animate-pulse">
      <div className="absolute inset-0 bg-linear-to-t from-gray-900 via-gray-900/50 to-transparent" />
      <div className="absolute inset-0 flex items-center py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="space-y-3 sm:space-y-4 max-w-2xl">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              {title}
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-200 leading-relaxed max-w-xl">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageHero({
  title,
  description,
  mediaType = "all",
}: PageHeroProps) {
  return (
    <Suspense
      fallback={<PageHeroSkeleton title={title} description={description} />}
    >
      <PageHeroAsync
        title={title}
        description={description}
        mediaType={mediaType}
      />
    </Suspense>
  );
}
