"use client";

import Image from "next/image";
import { useLocalDay } from "@/hooks/useLocalDay";
import { getImageUrl } from "@/lib/tmdb-image";

type BackdropKind = "movie" | "tv";

/**
 * The two backdrops a banner can show. Hard-coded rather than fetched: this is
 * decoration, and a page's first paint should not wait on a request for
 * decoration.
 */
const BACKDROPS: Record<BackdropKind, { title: string; backdropPath: string }> =
  {
    movie: {
      title: "Avengers: Infinity War",
      backdropPath: "/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    },
    tv: {
      title: "Arcane",
      backdropPath: "/rkB4LyZHo1NHXFEDHl9vSD9r1lI.jpg",
    },
  };

/**
 * What a mixed banner shows before the browser has said what day it is – in
 * the prerendered HTML, and in the hydration pass that has to match it.
 */
const UNDATED_BACKDROP: BackdropKind = "movie";

/**
 * The backdrop a mixed banner shows on a given local day: films one day,
 * series the next.
 *
 * Counted in whole days since the epoch rather than by day of the year, which
 * repeats itself across New Year (the 365th and the 1st are both odd).
 */
export function backdropForDay(day: string): BackdropKind {
  const [year, month, date] = day.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);
  return dayNumber % 2 === 0 ? "movie" : "tv";
}

function PageHeroContent({
  title,
  description,
  backdrop,
  settled,
}: {
  title: string;
  description: string;
  backdrop: BackdropKind;
  /** False while the backdrop may still be swapped for another once hydrated. */
  settled: boolean;
}) {
  const { title: itemTitle, backdropPath } = BACKDROPS[backdrop];

  // w1280, not `original`: TMDB's originals are often 1920–3840px wide, and
  // this is the page's largest paint, so its weight is what the first view
  // waits on. The browser cannot be offered a choice of sizes – `next/image`
  // drops `srcSet` under `unoptimized` – and under two near-black gradients
  // 1280px is the better trade even where a wide 2x screen could use more.
  const backdropUrl = getImageUrl(backdropPath, "w1280");

  return (
    <div className="relative h-[40vh] sm:h-[45vh] lg:h-[50vh] w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={backdropUrl}
          alt={`Background image for ${itemTitle}`}
          fill
          className="object-cover object-top"
          // A preload is a promise to use the file. A mixed banner may replace
          // its prerendered backdrop the moment it hydrates, so it only asks
          // for the image not to wait for layout, as a lazy one would.
          {...(settled ? { preload: true } : { loading: "eager" as const })}
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

/**
 * A banner that alternates between the two backdrops by the visitor's day.
 *
 * It used to pick in a Server Component, which in a static export means once,
 * at build time: "changes daily" was true for the day of the build and then
 * frozen until the next one. The day has to be read in the browser – and
 * because the prerendered HTML cannot know it, the hydration pass renders the
 * same undated choice the HTML holds, and the real one replaces it after.
 * `useLocalDay` also turns the page over at midnight while it stays open.
 */
function DailyPageHero({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const day = useLocalDay();

  return (
    <PageHeroContent
      title={title}
      description={description}
      backdrop={day ? backdropForDay(day) : UNDATED_BACKDROP}
      settled={false}
    />
  );
}

interface PageHeroProps {
  title: string;
  description: string;
  mediaType?: "movie" | "tv" | "all";
}

/**
 * The banner at the top of a listing page: a film's backdrop on /movies, a
 * series' on /tv-shows, and on a page about both – /genres – one or the other,
 * changing daily.
 */
export function PageHero({
  title,
  description,
  mediaType = "all",
}: PageHeroProps) {
  if (mediaType === "all") {
    return <DailyPageHero title={title} description={description} />;
  }

  return (
    <PageHeroContent
      title={title}
      description={description}
      backdrop={mediaType}
      settled
    />
  );
}
