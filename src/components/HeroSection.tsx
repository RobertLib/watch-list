"use client";

import Image from "next/image";
import Link from "@/i18n/Link";
import { Star } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { HeroButtons } from "./HeroButtons";
import { HeroSkeleton } from "@/components/skeletons";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { releaseYear } from "@/lib/dates";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatVoteAverage, mediaTypeLabel } from "./MediaCard";

interface HeroSectionContentProps {
  featuredItem: MediaItem;
}

function HeroSectionContent({ featuredItem }: HeroSectionContentProps) {
  const locale = useLocale();
  const t = useT();
  // w1280, not `original`: TMDB's originals are often 1920–3840px wide, and this
  // is the page's largest paint, so its weight is what the first view waits on.
  // The browser cannot be offered a choice of sizes – `next/image` drops
  // `srcSet` under `unoptimized` – and under two dark gradients 1280px is the
  // better trade even where a wide 2x screen could use more.
  const backdropUrl = tmdbApi.getImageUrl(featuredItem.backdrop_path, "w1280");
  const year = releaseYear(featuredItem.release_date);
  const rating = formatVoteAverage(featuredItem.vote_average, locale);
  const overview = featuredItem.overview?.trim();

  // Get the correct title for both movies and TV shows
  const title =
    featuredItem.title ||
    ("name" in featuredItem
      ? (featuredItem as { name: string }).name
      : t("Unknown Title", "Neznámý titul"));

  return (
    <div className="relative flex min-h-[50vh] sm:min-h-[60vh] lg:min-h-[70vh] w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={backdropUrl}
          alt={`${t("Featured backdrop for", "Obrázek na pozadí:")} ${title}`}
          fill
          className="object-cover object-top"
          preload
        />
        <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative flex w-full items-center py-4 sm:py-6">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="max-w-2xl space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Title */}
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-tight">
              {title}
            </h2>

            {/* Meta information */}
            <div className="flex items-center gap-2 sm:gap-4 text-sm sm:text-base text-gray-200">
              <div
                className="flex items-center gap-1"
                role="img"
                aria-label={t(
                  `Rating: ${rating} out of 10 stars`,
                  `Hodnocení: ${rating} z 10 hvězdiček`,
                )}
              >
                <Star
                  className="w-4 h-4 sm:w-5 sm:h-5 fill-yellow-400 text-yellow-400"
                  aria-hidden="true"
                />
                <span className="font-medium">{rating}</span>
              </div>
              <span aria-hidden="true">•</span>
              <span>{year}</span>
              <span aria-hidden="true">•</span>
              <span className="capitalize">
                {mediaTypeLabel(featuredItem.media_type, t)}
              </span>
            </div>

            {/* Overview. Left out rather than left empty: TMDB answers a
                Czech request with `overview: ""` for every title nobody has
                translated, and an empty paragraph is just a gap. */}
            {overview && (
              <p className="text-sm sm:text-base lg:text-lg text-gray-200 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl">
                {overview}
              </p>
            )}

            {/* Action Buttons */}
            <HeroButtons featuredItem={featuredItem} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The title the banner features: the top of this week's trending, unless it
 * has no synopsis and one of the next few does.
 *
 * In English nearly every title has one. A Czech page asks TMDB in Czech,
 * which answers with an empty `overview` for each title nobody has translated
 * – and a banner is a title, its numbers and its pitch, so one of the five hottest
 * with a pitch beats the very hottest without. If none of them has one, the
 * first is featured anyway and the paragraph is left out.
 */
const FEATURE_CANDIDATES = 5;

function pickFeatured(results: MediaItem[]): MediaItem | null {
  return (
    results
      .slice(0, FEATURE_CANDIDATES)
      .find((item) => item.overview?.trim()) ??
    results[0] ??
    null
  );
}

/**
 * The top of the home page: whatever is trending hardest this week.
 *
 * It fetches trending itself rather than being handed it by the page, which used
 * to matter because the same list also feeds the carousel below. It still costs
 * one request: both go through the same URL, and the TMDB cache hands the second
 * caller the first one's promise.
 */
export function HeroSection() {
  const settingsKey = useSettingsKey();
  const t = useT();
  const { data, isLoading, error, reload } = useAsyncData(
    () => tmdbDiscoverApi.getTrending("all", "week"),
    [settingsKey],
  );

  const featuredItem = data ? pickFeatured(data.results) : null;

  if (isLoading) {
    return <HeroSkeleton gradientFrom="from-gray-900" />;
  }

  // The compact notice rather than the full-page one: the rows below the banner
  // fetch separately and may well have arrived, so this reports the banner's own
  // failure without claiming the page is empty. It is also the only visible sign
  // when TMDB is unreachable altogether – the carousels below leave themselves
  // out in silence.
  if (error) {
    return (
      <LoadFailureNotice
        title={t(
          "Could not load what's trending",
          "Trendy se nepodařilo načíst",
        )}
        description={t(
          "TMDB did not answer. Your watchlist and everything saved in this browser are unaffected.",
          "TMDB neodpovídá. Vašeho seznamu ani ničeho dalšího uloženého v tomto prohlížeči se to nedotkne.",
        )}
        onRetry={reload}
        compact
      />
    );
  }

  if (!featuredItem) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 text-center">
        <h2 className="text-xl font-bold mb-2">
          {t(
            "No titles match your settings",
            "Vašemu nastavení neodpovídá žádný titul",
          )}
        </h2>
        <p className="text-gray-400 max-w-md mx-auto">
          {t(
            "No movies or series were found for your region and streaming preferences. Review your settings to broaden the catalogue.",
            "Pro váš region a vybrané streamovací služby jsme nenašli žádné filmy ani seriály. Upravte nastavení, ať je z čeho vybírat.",
          )}
        </p>
        <Link
          href="/profile"
          prefetch={false}
          className="mt-6 inline-flex px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {t("Review profile settings", "Upravit nastavení profilu")}
        </Link>
      </div>
    );
  }

  return <HeroSectionContent featuredItem={featuredItem} />;
}
