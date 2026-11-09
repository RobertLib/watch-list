"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MediaSection } from "@/components/MediaSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { SnapshotRefreshNotice } from "@/components/SnapshotRefreshNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { MOODS, type Mood } from "@/lib/moods";
import { MAX_MOOD_PAGE, loadMoodPicks, type MoodPicksPage } from "@/lib/mood-data";
import { moodHref } from "@/lib/routes";

function parsePage(raw: string | null) {
  return Math.max(1, Math.min(parseInt(raw ?? "1", 10) || 1, MAX_MOOD_PAGE));
}

interface MoodContentProps {
  /** Resolved by the page from `moods.ts`; the path names it. */
  mood: Mood;
  /** Page one, loaded at build time – or `null` for a build without TMDB. */
  snapshot: MoodPicksPage | null;
}

/**
 * One mood's picks – `/mood/easy-watch`. The list of moods lives at `/moods`.
 *
 * Built like `GenreListing`: the page number comes from the query string, which
 * the prerender cannot read, so the Suspense fallback is the prerendered page –
 * page one, from the build's snapshot – and the live half starts from the same
 * snapshot in the browser.
 */
export function MoodContent({ mood, snapshot }: MoodContentProps) {
  return (
    <Suspense
      fallback={
        snapshot ? (
          <MoodPicksView mood={mood} page={1} picks={snapshot} />
        ) : (
          <MoodSkeleton mood={mood} />
        )
      }
    >
      <MoodPicks mood={mood} snapshot={snapshot} />
    </Suspense>
  );
}

function MoodSkeleton({ mood }: { mood: Mood }) {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <MoodHeading mood={mood} page={1} />
      <LoadingSection count={12} />
    </div>
  );
}

function MoodPicks({ mood, snapshot }: MoodContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const settingsKey = useSettingsKey();
  const page = parsePage(searchParams.get("page"));

  const { data, isLoading, error, reload, refreshError, isRetrying } = useAsyncData(
    () => loadMoodPicks(mood, page),
    [mood.slug, page, settingsKey],
    page === 1 ? snapshot : null,
  );

  // A shared link or a settings change can leave the URL beyond the catalogue's
  // last page. Only correct it once both listings have answered: a failed half
  // may still have later pages. Keep the skeleton until the valid page loads.
  const correctionHref =
    data && !data.moviesFailed && !data.showsFailed && page > data.totalPages
      ? moodHref(mood.slug, data.totalPages)
      : null;
  useEffect(() => {
    if (correctionHref) router.replace(correctionHref, { scroll: false });
  }, [correctionHref, router]);

  if (error) {
    return <LoadFailureNotice title="Could not load this mood" onRetry={reload} />;
  }

  if (isLoading || !data || correctionHref) return <MoodSkeleton mood={mood} />;

  return (
    <MoodPicksView
      mood={mood}
      page={page}
      picks={data}
      onRetry={reload}
      notice={
        refreshError != null ? (
          // The build's picks stay up; the visitor's own (their region, their
          // services) are what did not arrive.
          <SnapshotRefreshNotice
            className="mb-8"
            message="Showing saved picks – the ones for your region and services could not be loaded."
            onRetry={reload}
            isRetrying={isRetrying}
          />
        ) : null
      }
    />
  );
}

function MoodHeading({ mood, page }: { mood: Mood; page: number }) {
  return (
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
  );
}

function MoodPicksView({
  mood,
  page,
  picks,
  onRetry,
  notice = null,
}: {
  mood: Mood;
  page: number;
  picks: MoodPicksPage;
  /** Absent in the prerender, where a failed half never gets this far. */
  onRetry?: () => void;
  /** Shown under the heading: the snapshot's refresh failing, for one. */
  notice?: ReactNode;
}) {
  const { movies, shows, moviesFailed, showsFailed, totalPages } = picks;

  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <MoodHeading mood={mood} page={page} />
      {notice}

      {moviesFailed ? (
        <LoadFailureNotice title="Could not load films" onRetry={onRetry} compact />
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
        <LoadFailureNotice title="Could not load series" onRetry={onRetry} compact />
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
