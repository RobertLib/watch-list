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
import {
  STREAMING_LANDING_PLATFORMS,
  type StreamingPlatform,
} from "@/lib/streaming-landing";
import { moodHref } from "@/lib/routes";

function parsePage(raw: string | null) {
  return Math.max(1, Math.min(parseInt(raw ?? "1", 10) || 1, MAX_MOOD_PAGE));
}

interface MoodContentProps {
  /** Resolved by the page from `moods.ts`; the path names it. */
  mood: Mood;
  /** Set on a platform landing – `/mood/christmas/netflix`. */
  platform?: StreamingPlatform;
  /** Page one, loaded at build time – or `null` for a build without TMDB. */
  snapshot: MoodPicksPage | null;
}

/**
 * One mood's picks – `/mood/easy-watch` – or what one streaming platform has of
 * them, at `/mood/easy-watch/netflix`. The list of moods lives at `/moods`.
 *
 * Built like `GenreListing`: the page number comes from the query string, which
 * the prerender cannot read, so the Suspense fallback is the prerendered page –
 * page one, from the build's snapshot – and the live half starts from the same
 * snapshot in the browser.
 */
export function MoodContent({ mood, platform, snapshot }: MoodContentProps) {
  return (
    <Suspense
      fallback={
        snapshot ? (
          <MoodPicksView mood={mood} platform={platform} page={1} picks={snapshot} />
        ) : (
          <MoodSkeleton mood={mood} platform={platform} />
        )
      }
    >
      <MoodPicks mood={mood} platform={platform} snapshot={snapshot} />
    </Suspense>
  );
}

function MoodSkeleton({
  mood,
  platform,
}: {
  mood: Mood;
  platform?: StreamingPlatform;
}) {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <MoodHeading mood={mood} platform={platform} page={1} />
      <LoadingSection count={12} />
    </div>
  );
}

function MoodPicks({ mood, platform, snapshot }: MoodContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const settingsKey = useSettingsKey();
  const page = parsePage(searchParams.get("page"));

  const { data, isLoading, error, reload, refreshError, isRetrying } = useAsyncData(
    () => loadMoodPicks(mood, page, platform),
    [mood.slug, platform?.slug, page, settingsKey],
    page === 1 ? snapshot : null,
  );

  // A shared link or a settings change can leave the URL beyond the catalogue's
  // last page. Only correct it once both listings have answered: a failed half
  // may still have later pages. Keep the skeleton until the valid page loads.
  const correctionHref =
    data && !data.moviesFailed && !data.showsFailed && page > data.totalPages
      ? moodHref(mood.slug, data.totalPages, platform?.slug)
      : null;
  useEffect(() => {
    if (correctionHref) router.replace(correctionHref, { scroll: false });
  }, [correctionHref, router]);

  if (error) {
    return <LoadFailureNotice title="Could not load this mood" onRetry={reload} />;
  }

  if (isLoading || !data || correctionHref) {
    return <MoodSkeleton mood={mood} platform={platform} />;
  }

  return (
    <MoodPicksView
      mood={mood}
      platform={platform}
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

/**
 * The top of the page: the mood in the app's own words, then what the page is.
 *
 * The label was the heading – "Something easy" – which is a fine name for a
 * card and tells neither a visitor arriving from a search nor the search engine
 * that sent them what is listed here. So the `<h1>` is the mood's `title`
 * ("Feel-Good Movies & TV Shows", and "… on Netflix" for a landing), and the
 * label stays as the line above it, where it reads as the voice it is.
 */
function MoodHeading({
  mood,
  platform,
  page,
}: {
  mood: Mood;
  platform?: StreamingPlatform;
  page: number;
}) {
  return (
    <div className="mb-8">
      <Link
        href={platform ? moodHref(mood.slug) : "/moods"}
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {platform ? `${mood.label}, on every service` : "All moods"}
      </Link>
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-2">
        <span aria-hidden="true" className="mr-1.5">
          {mood.emoji}
        </span>
        {mood.label}
      </p>
      <h1 className="text-4xl font-bold text-white mb-3">
        {mood.title}
        {platform && ` on ${platform.name}`}
      </h1>
      <p className="text-gray-400 text-lg max-w-2xl">
        {mood.description}
        {page > 1 && ` – page ${page}`}
      </p>
      {platform && (
        <p className="text-gray-500 text-sm mt-2 max-w-2xl">
          Only what {platform.name} is streaming in your region right now,
          best-rated first.
        </p>
      )}
    </div>
  );
}

function MoodPicksView({
  mood,
  platform,
  page,
  picks,
  onRetry,
  notice = null,
}: {
  mood: Mood;
  platform?: StreamingPlatform;
  page: number;
  picks: MoodPicksPage;
  /** Absent in the prerender, where a failed half never gets this far. */
  onRetry?: () => void;
  /** Shown under the heading: the snapshot's refresh failing, for one. */
  notice?: ReactNode;
}) {
  const { movies, shows, moviesFailed, showsFailed, totalPages } = picks;
  const nothingHere = platform
    ? `Nothing in this mood is streaming on ${platform.name} in your region right now.`
    : "Nothing came back for this one. Try another mood.";

  // The others in the same section of `/moods`, not all sixty: a list of
  // everything is a sitemap, and the neighbours are what someone who came for
  // heists might also be in the mood for.
  const neighbours = MOODS.filter(
    (other) => other.group === mood.group && other.slug !== mood.slug,
  );

  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <MoodHeading mood={mood} platform={platform} page={page} />
      {notice}

      {/* A half the mood does not have is not a half that came back empty. */}
      {mood.movie &&
        (moviesFailed ? (
          <LoadFailureNotice title="Could not load films" onRetry={onRetry} compact />
        ) : (
          <MediaSection
            title={shows.length > 0 ? "Films" : ""}
            items={movies}
            size="medium"
            showViewToggle
            emptyMessage={shows.length > 0 ? "No films on this page." : nothingHere}
          />
        ))}

      {showsFailed ? (
        <LoadFailureNotice title="Could not load series" onRetry={onRetry} compact />
      ) : mood.movie ? (
        shows.length > 0 && (
          <div className="mt-12">
            <MediaSection
              title="Series"
              items={shows}
              size="medium"
              emptyMessage=""
            />
          </div>
        )
      ) : (
        mood.tv && (
          <MediaSection
            title=""
            items={shows}
            size="medium"
            showViewToggle
            emptyMessage={nothingHere}
          />
        )
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-4 mt-12"
        >
          {page > 1 && (
            <Link
              href={moodHref(mood.slug, page - 1, platform?.slug)}
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
              href={moodHref(mood.slug, page + 1, platform?.slug)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              Next →
            </Link>
          )}
        </nav>
      )}

      {/* Sideways links between the mood and its per-platform views. */}
      {mood.platforms && (
        <section className="mt-16 border-t border-gray-800 pt-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            {platform
              ? `${mood.title} on other platforms`
              : `${mood.title} on your streaming service`}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {STREAMING_LANDING_PLATFORMS.filter(
              (other) => other.slug !== platform?.slug,
            ).map((other) => (
              <li key={other.slug}>
                <Link
                  href={moodHref(mood.slug, 1, other.slug)}
                  prefetch={false}
                  className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className={
          mood.platforms ? "mt-10" : "mt-16 border-t border-gray-800 pt-8"
        }
      >
        <h2 className="text-xl font-semibold text-white mb-4">
          Another kind of evening
        </h2>
        <ul className="flex flex-wrap gap-2">
          {neighbours.map((other) => (
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
          <li>
            <Link
              href="/moods"
              prefetch={false}
              className="inline-flex items-center px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 text-sm text-gray-300 hover:text-white transition-colors"
            >
              All moods →
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
