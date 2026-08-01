"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Clock, Play } from "lucide-react";
import { getContinueWatching } from "@/app/actions";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn } from "@/lib/utils";
import type { UpNextEpisode } from "@/lib/continue-watching";
import type { ShowRef } from "@/lib/episode-progress";

// Mirrors the server-side cap – anything beyond it is discarded there anyway.
const MAX_SHOWS_SENT = 12;
// Ticking several episodes in a row should cost one request, not one per click.
const REFRESH_DELAY_MS = 500;

/**
 * "Continue Watching" – the next unwatched episode of every show in progress.
 *
 * Episode ticks are browser state, so the row is requested after mount and the
 * home page itself stays statically rendered, exactly like the recommendations.
 */
export function ContinueWatching() {
  const { shows, isLoading, toggleEpisode } = useEpisodeProgress();
  const [episodes, setEpisodes] = useState<UpNextEpisode[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const seeds = useMemo(
    () =>
      shows.slice(0, MAX_SHOWS_SENT).map((show) => ({
        tvId: show.tvId,
        name: show.name,
        posterPath: show.posterPath,
        seasons: show.seasons,
        updatedAt: show.updatedAt,
      })),
    [shows],
  );

  useEffect(() => {
    if (isLoading) return;

    if (seeds.length === 0) {
      setEpisodes([]);
      return;
    }

    let isCurrent = true;
    setIsFetching(true);

    const timer = setTimeout(async () => {
      try {
        const next = await getContinueWatching(seeds);
        if (isCurrent) setEpisodes(next);
      } catch (error) {
        console.error("Error loading continue watching:", error);
        if (isCurrent) setEpisodes([]);
      } finally {
        if (isCurrent) setIsFetching(false);
      }
    }, REFRESH_DELAY_MS);

    // The ticks changed (or the user navigated away) – drop the stale response.
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [seeds, isLoading]);

  if (isLoading || seeds.length === 0) return null;

  if (isFetching && episodes.length === 0) {
    return <ContinueWatchingSkeleton />;
  }

  // Every tracked show is caught up: nothing to continue, and what is still
  // coming belongs in the release calendar rather than here.
  if (episodes.length === 0) return null;

  return (
    <section aria-labelledby="continue-watching-heading">
      <div className="mb-6">
        <h2
          id="continue-watching-heading"
          className="text-2xl font-bold text-white"
        >
          Continue Watching
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Pick up where you left off – tick an episode and the next one takes its
          place.
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 snap-x scrollbar-thin">
        {episodes.map((episode) => (
          <UpNextCard
            key={`${episode.tvId}-${episode.seasonNumber}-${episode.episodeNumber}`}
            episode={episode}
            onMarkWatched={() =>
              toggleEpisode(
                toShowRef(episode),
                episode.seasonNumber,
                episode.episodeNumber,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}

function toShowRef(episode: UpNextEpisode): ShowRef {
  return {
    tvId: episode.tvId,
    name: episode.showName,
    posterPath: episode.posterPath,
  };
}

function UpNextCard({
  episode,
  onMarkWatched,
}: {
  episode: UpNextEpisode;
  onMarkWatched: () => void;
}) {
  const code = `S${String(episode.seasonNumber).padStart(2, "0")}E${String(
    episode.episodeNumber,
  ).padStart(2, "0")}`;
  const progressPercent =
    episode.airedCount > 0
      ? (episode.watchedCount / episode.airedCount) * 100
      : 0;

  // The episode still is the point of the card; the poster is the fallback for
  // an episode TMDB has no image for yet, which is common for a fresh airing.
  const artwork = episode.stillPath
    ? getImageUrl(episode.stillPath, "w500")
    : episode.posterPath
      ? getImageUrl(episode.posterPath, "w500")
      : null;

  return (
    <div className="w-64 sm:w-72 shrink-0 snap-start rounded-xl bg-gray-900/60 border border-gray-800 overflow-hidden flex flex-col">
      <Link
        href={`/tv/${episode.slug}`}
        prefetch={false}
        className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="relative aspect-video bg-gray-800">
          {artwork ? (
            <Image
              src={artwork}
              alt={`${episode.showName} ${code}`}
              fill
              className={cn(
                "object-cover transition-transform duration-200 group-hover:scale-105",
                // A poster standing in for a still would be cropped to a strip;
                // containing it keeps the whole image visible instead.
                !episode.stillPath && "object-contain",
              )}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
              No image
            </div>
          )}

          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent" />
          <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-mono text-white">
            {code}
          </span>
          <div className="absolute bottom-2 left-2 right-2">
            <p className="text-sm font-semibold text-white line-clamp-1">
              {episode.showName}
            </p>
            {episode.episodeName && (
              <p className="text-xs text-gray-300 line-clamp-1">
                {episode.episodeName}
              </p>
            )}
          </div>
        </div>
      </Link>

      <div className="p-3 space-y-3 grow flex flex-col">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div
            className="h-1.5 flex-1 rounded-full bg-gray-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={episode.watchedCount}
            aria-valuemin={0}
            aria-valuemax={episode.airedCount}
            aria-label={`${episode.showName} progress`}
          >
            <div
              className="h-full rounded-full bg-green-500 transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="shrink-0">
            {episode.watchedCount} / {episode.airedCount}
          </span>
        </div>

        {episode.runtime && (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {episode.runtime} min
          </p>
        )}

        <div className="flex gap-2 mt-auto">
          <Link
            href={`/tv/${episode.slug}`}
            prefetch={false}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            Details
          </Link>
          <button
            onClick={onMarkWatched}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            aria-label={`Mark ${episode.showName} ${code} as watched`}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Watched
          </button>
        </div>
      </div>
    </div>
  );
}

function ContinueWatchingSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="h-8 w-56 bg-gray-800 rounded animate-pulse mb-2" />
      <div className="h-4 w-80 bg-gray-800/60 rounded animate-pulse mb-6" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="w-64 sm:w-72 shrink-0 rounded-xl bg-gray-900/60 border border-gray-800 overflow-hidden"
          >
            <div className="aspect-video bg-gray-800 animate-pulse" />
            <div className="p-3 space-y-3">
              <div className="h-1.5 bg-gray-800 rounded animate-pulse" />
              <div className="h-9 bg-gray-800 rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
