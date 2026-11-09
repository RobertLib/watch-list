"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { getReleasesSinceLastVisit } from "@/lib/api";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { useSettings } from "@/hooks/useSettings";
import {
  describeGap,
  isGapWorthShowing,
  beginVisit,
  completeVisit,
  type Visit,
} from "@/lib/last-visit";
import { getActiveProfileId } from "@/lib/profiles";
import { withProfileStorage } from "@/lib/profile-storage";
import { getWatchlist, type WatchlistItem } from "@/lib/watchlist";
import { getEpisodeProgress, type ShowProgress } from "@/lib/episode-progress";
import { readStoredSettings } from "@/lib/settings";
import { episodeCode } from "@/lib/calendar-ics";
import { getImageUrl } from "@/lib/tmdb-image";
import type { CalendarSeed } from "@/lib/release-calendar";
import type { MissedRelease } from "@/lib/since-last-visit-data";
import { mediaHref } from "@/lib/routes";
import { todayLocal } from "@/lib/dates";

function followedSeeds(watchlist: WatchlistItem[], shows: ShowProgress[]): CalendarSeed[] {
  const bySeed = new Map<string, CalendarSeed>();

  for (const item of watchlist) {
    bySeed.set(`${item.mediaType}-${item.id}`, {
      id: item.id,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath,
      releaseDate: item.releaseDate || null,
    });
  }

  for (const show of shows) {
    const key = `tv-${show.tvId}`;
    if (bySeed.has(key)) continue;
    bySeed.set(key, {
      id: show.tvId,
      mediaType: "tv",
      title: show.name,
      posterPath: show.posterPath,
      releaseDate: null,
    });
  }

  return [...bySeed.values()];
}

function readFollowedSeeds(): CalendarSeed[] {
  return followedSeeds(getWatchlist({ strict: true }), Object.values(getEpisodeProgress({ strict: true })));
}

/** Activity timestamps may reorder shows without changing what was checked. */
function seedSignature(seeds: CalendarSeed[]): string {
  return seeds.map((seed) => JSON.stringify(seed)).sort().join("\n");
}

/**
 * "Two of your shows aired while you were away."
 *
 * The most valuable thing a home page can do for somebody returning is be
 * different from how they left it. Everything else here is the same trending row
 * they saw last week; this strip is the part that rewards having come back.
 *
 * Renders nothing at all when there is nothing to say – which is most visits, and
 * is exactly why it lands when it does appear.
 */
export function WelcomeBack() {
  const { watchlist, profileId, refreshWatchlist, isLoading: isWatchlistLoading } = useWatchlist();
  const { shows, profileId: progressProfileId, refreshProgress, isLoading: isProgressLoading } = useEpisodeProgress();
  const { region } = useSettings();

  const [visit, setVisit] = useState<Visit | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const isLoading = isWatchlistLoading || isProgressLoading;

  // Capture once per session and profile; acknowledge only after a successful
  // check. The interval is the rendered profile's own: whoever else uses this
  // browser, with whatever they follow, cannot acknowledge it for them.
  // Repeated calls in one session return the interval already captured.
  useEffect(() => {
    if (isWatchlistLoading) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reading and
       capturing a browser-only store, which the server render cannot do */
    setVisit(beginVisit(profileId));
  }, [isWatchlistLoading, profileId]);

  // Tracked shows are followed even if they were never added to the queue.
  const seeds = useMemo(() => followedSeeds(watchlist, shows), [watchlist, shows]);
  const [loaded, setLoaded] = useState<{
    seeds: typeof seeds;
    region: string;
    attempt: number;
    releases: MissedRelease[];
    failure: "sources" | "releases" | null;
  } | null>(null);

  // A visit captured for another profile is never shown or completed here.
  const ownVisit = visit?.profileId === profileId ? visit : null;
  const previousVisit = ownVisit?.previous ?? null;
  const worthAsking = isGapWorthShowing(previousVisit) && seeds.length > 0;
  const currentLoad = loaded?.seeds === seeds && loaded.region === region && loaded.attempt === attempt
    ? loaded : null;
  const failed = currentLoad?.failure != null;

  useEffect(() => {
    if (!failed) return;
    const retry = () => setAttempt((current) => current + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);

  useEffect(() => {
    if (isLoading || !ownVisit || profileId !== progressProfileId) return;

    let isCurrent = true;
    const controller = new AbortController();
    const checkedSeeds = seedSignature(seeds);
    const refreshSources = () => {
      refreshWatchlist();
      refreshProgress();
    };
    // Empty context values can be rendering fallbacks after a refused read.
    // Compare both live sources with the titles actually checked, including
    // after waiting for the completion lock or another tab's storage event.
    const sourcesMatch = () => {
      try {
        const currentSeeds = withProfileStorage(profileId, readFollowedSeeds);
        if (seedSignature(currentSeeds) === checkedSeeds) return true;
        refreshSources();
      } catch (error) {
        console.error("Error reading followed titles for recent releases:", error);
        setLoaded({ seeds, region, attempt, releases: [], failure: "sources" });
      }
      return false;
    };
    const canComplete = () => isCurrent && !controller.signal.aborted &&
      getActiveProfileId({ strict: true }) === profileId &&
      readStoredSettings({ strict: true }).region === region && sourcesMatch();

    (async () => {
      if (!sourcesMatch()) return;
      if (!worthAsking || !previousVisit) {
        await completeVisit(ownVisit, canComplete);
        return;
      }

      try {
        const found = await getReleasesSinceLastVisit(
          seeds,
          todayLocal(new Date(previousVisit)),
          controller.signal,
        );
        if (isCurrent && !controller.signal.aborted) {
          setLoaded({ seeds, region, attempt, releases: found, failure: null });
          await completeVisit(ownVisit, canComplete);
        }
      } catch (error) {
        if (!isCurrent || controller.signal.aborted) return;
        console.error("Error loading what happened since the last visit:", error);
        setLoaded({ seeds, region, attempt, releases: [], failure: "releases" });
      }
    })();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [seeds, ownVisit, previousVisit, worthAsking, isLoading, region, profileId, progressProfileId, attempt, refreshWatchlist, refreshProgress]);

  if (dismissed || isLoading) return null;

  if (failed) {
    return (
      <LoadFailureNotice
        compact
        title="Could not load recent releases"
        description={currentLoad?.failure === "sources"
          ? "Your saved titles could not be read. Check your browser's storage settings or restore a backup and try again."
          : "Check your connection and try again to see what came out while you were away."}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    );
  }

  if (!worthAsking || !previousVisit) return null;

  const releases = currentLoad?.releases ?? [];
  if (releases.length === 0) return null;

  return (
    <section
      aria-labelledby="welcome-back-heading"
      className="rounded-2xl border border-blue-500/30 bg-linear-to-br from-blue-500/10 to-purple-500/5 p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            id="welcome-back-heading"
            className="text-lg font-semibold text-white flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5 text-blue-400" aria-hidden="true" />
            Since you were here {describeGap(previousVisit)}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {releases.length} thing{releases.length === 1 ? "" : "s"} you follow
            came out.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <ul className="flex gap-3 overflow-x-auto pb-1">
        {releases.map((release) => (
          <li key={release.key} className="shrink-0 w-32">
            <Link
              href={mediaHref(release.mediaType, release.slug)}
              prefetch={false}
              className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
            >
              <div className="relative aspect-2/3 rounded-lg overflow-hidden bg-gray-800 mb-2">
                {release.posterPath && (
                  <Image
                    src={getImageUrl(release.posterPath, "w185")}
                    alt={release.title}
                    fill
                    className="object-cover"
                  />
                )}
              </div>
              <p className="text-xs font-medium text-white group-hover:text-blue-300 transition-colors line-clamp-2">
                {release.title}
              </p>
              <p className="text-[11px] text-gray-500 line-clamp-1">
                {release.seasonNumber !== null && release.episodeNumber !== null
                  ? episodeCode(release.seasonNumber, release.episodeNumber)
                  : release.movieReleaseSource === "regional-theatrical" ? "In cinemas" : "Release date"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
