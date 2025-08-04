"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MediaSection } from "@/components/MediaSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { NotFoundNotice } from "@/components/NotFoundNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useCanonicalUrl } from "@/hooks/useCanonicalUrl";
import { useSettingsKey } from "@/hooks/useSettings";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "@/lib/media-converters";
import { findMood, MOODS, type Mood } from "@/lib/moods";
import { absoluteUrl, moodHref } from "@/lib/routes";

// How deep the pager goes. The value of these pages is the first screenful.
const MAX_PAGE = 10;

function parsePage(raw: string | undefined) {
  return Math.max(1, Math.min(parseInt(raw ?? "1", 10) || 1, MAX_PAGE));
}

/** One mood's picks – `?id=cozy`. The list of moods lives at `/moods`. */
export function MoodContent() {
  return (
    <Suspense fallback={<MoodSkeleton />}>
      <MoodPicks />
    </Suspense>
  );
}

function MoodSkeleton({ mood }: { mood?: Mood }) {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <div className="mb-8">
        {mood ? (
          <h1 className="text-4xl font-bold text-white mb-3">
            <span aria-hidden="true" className="mr-2">
              {mood.emoji}
            </span>
            {mood.label}
          </h1>
        ) : (
          <div className="h-10 w-64 bg-gray-700 rounded animate-pulse" />
        )}
      </div>
      <LoadingSection count={12} />
    </div>
  );
}

function MoodPicks() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const settingsKey = useSettingsKey();
  const mood = findMood(searchParams.get("id") ?? "");
  const page = parsePage(searchParams.get("page") ?? undefined);

  useDocumentTitle(mood ? `${mood.label} – What to Watch` : null);
  // Page two of a mood is its own URL rather than a duplicate of page one.
  useCanonicalUrl(mood ? absoluteUrl(moodHref(mood.slug, page)) : null);

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!mood) return null;

    // Both halves are fetched together where the mood has a television side; a
    // failure in either leaves the other section available and offers a retry.
    const [movieResult, showResult] = await Promise.allSettled([
      tmdbDiscoverApi.discoverMovies(page, mood.movie),
      mood.tv
        ? tmdbDiscoverApi.discoverTVShows(page, mood.tv)
        : Promise.resolve(null),
    ]);

    return {
      movies:
        movieResult.status === "fulfilled"
          ? movieResult.value.results.map(convertMovieToMediaItem)
          : [],
      shows:
        showResult.status === "fulfilled" && showResult.value
          ? showResult.value.results.map(convertTVShowToMediaItem)
          : [],
      moviesFailed: movieResult.status === "rejected",
      showsFailed: showResult.status === "rejected",
      totalPages: Math.min(MAX_PAGE, Math.max(
        1,
        movieResult.status === "fulfilled" ? movieResult.value.total_pages : 0,
        showResult.status === "fulfilled" && showResult.value
          ? showResult.value.total_pages : 0,
      )),
    };
  }, [mood?.slug, page, settingsKey]);

  // A shared link or a settings change can leave the URL beyond the catalogue's
  // last page. Only correct it once both listings have answered: a failed half
  // may still have later pages. Keep the skeleton until the valid page loads.
  const correctionHref =
    mood && data && !data.moviesFailed && !data.showsFailed && page > data.totalPages
      ? moodHref(mood.slug, data.totalPages)
      : null;
  useEffect(() => {
    if (correctionHref) router.replace(correctionHref, { scroll: false });
  }, [correctionHref, router]);

  if (!mood) {
    return (
      <NotFoundNotice
        title="Mood not found"
        description="That is not one of the moods on offer. Pick another kind of evening."
        backHref="/moods"
        backLabel="All moods"
      />
    );
  }

  if (error) {
    return <LoadFailureNotice title="Could not load this mood" onRetry={reload} />;
  }

  if (isLoading || !data || correctionHref) return <MoodSkeleton mood={mood} />;

  const { movies, shows, moviesFailed, showsFailed, totalPages } = data;

  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          href="/moods"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          All moods
        </Link>
        <h1 className="text-4xl font-bold text-white mb-3">
          <span aria-hidden="true" className="mr-2">
            {mood.emoji}
          </span>
          {mood.label}
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          {mood.description}
          {page > 1 && ` – page ${page}`}
        </p>
      </div>

      {moviesFailed ? (
        <LoadFailureNotice title="Could not load films" onRetry={reload} compact />
      ) : (
        <MediaSection
          title={shows.length > 0 ? "Films" : ""}
          items={movies}
          size="medium"
          showViewToggle
          emptyMessage={shows.length > 0
            ? "No films on this page."
            : "Nothing came back for this one. Try another mood."}
        />
      )}

      {showsFailed ? (
        <LoadFailureNotice title="Could not load series" onRetry={reload} compact />
      ) : shows.length > 0 && (
        <div className="mt-12">
          <MediaSection
            title="Series"
            items={shows}
            size="medium"
            emptyMessage=""
          />
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-4 mt-12"
        >
          {page > 1 && (
            <Link
              href={moodHref(mood.slug, page - 1)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="text-gray-400 text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={moodHref(mood.slug, page + 1)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              Next →
            </Link>
          )}
        </nav>
      )}

      <section className="mt-16 border-t border-gray-800 pt-8">
        <h2 className="text-xl font-semibold text-white mb-4">
          Another kind of evening
        </h2>
        <ul className="flex flex-wrap gap-2">
          {MOODS.filter((other) => other.slug !== mood.slug).map((other) => (
            <li key={other.slug}>
              <Link
                href={moodHref(other.slug)}
                prefetch={false}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <span aria-hidden="true">{other.emoji}</span>
                {other.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
