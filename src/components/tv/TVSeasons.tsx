"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  Clock,
  Calendar,
  Star,
} from "lucide-react";
import { getImageUrl } from "@/lib/tmdb-image";
import { fetchSeasonDetails } from "@/app/actions";
import { useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { cn } from "@/lib/utils";
import type { ShowRef } from "@/lib/episode-progress";
import type { Season, SeasonDetails, Episode } from "@/types/tmdb";

interface TVSeasonsProps {
  seasons: Season[];
  tvId: number;
  showName: string;
  posterPath: string | null;
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Today in UTC, matching the plain `YYYY-MM-DD` TMDB air dates.
 *
 * UTC on purpose: this component also renders on the server, and a local-time
 * comparison would let the two disagree about whether today's episode has aired.
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasAired(episode: Pick<Episode, "air_date">, today: string): boolean {
  return Boolean(episode.air_date) && episode.air_date <= today;
}

function EpisodeRow({
  episode,
  show,
  today,
}: {
  episode: Episode;
  show: ShowRef;
  today: string;
}) {
  const { isEpisodeWatched, toggleEpisode } = useEpisodeProgress();
  const hasOverview = Boolean(episode.overview);
  const aired = hasAired(episode, today);
  const watched = isEpisodeWatched(
    show.tvId,
    episode.season_number,
    episode.episode_number,
  );

  const label = `S${String(episode.season_number).padStart(2, "0")}E${String(
    episode.episode_number,
  ).padStart(2, "0")}`;

  return (
    <div
      className={cn(
        "flex gap-3 py-3 border-b border-gray-700/50 last:border-0",
        // Ticked rows recede: the point of the list becomes what is left to watch.
        watched && "opacity-60",
      )}
    >
      {/* Still image */}
      <div className="relative w-28 sm:w-36 shrink-0 rounded overflow-hidden bg-gray-700 aspect-video self-start">
        {episode.still_path ? (
          <Image
            src={getImageUrl(episode.still_path, "w500")}
            alt={episode.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-500 text-xs">No image</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-gray-500 text-xs font-mono shrink-0 mt-0.5">
            E{String(episode.episode_number).padStart(2, "0")}
          </span>
          <p className="font-medium text-white text-sm leading-tight flex-1">
            {episode.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
          {episode.air_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {aired ? formatDate(episode.air_date) : `Airs ${formatDate(episode.air_date)}`}
            </span>
          )}
          {episode.runtime && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {episode.runtime}m
            </span>
          )}
          {episode.vote_average > 0 && (
            <span className="flex items-center gap-1 text-yellow-400">
              <Star className="w-3 h-3 fill-current" />
              {episode.vote_average.toFixed(1)}
            </span>
          )}
        </div>

        {hasOverview && (
          <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
            {episode.overview}
          </p>
        )}
      </div>

      {/* Watched toggle – withheld for episodes that have not aired, where the
          only thing it could record is a mistake. */}
      {aired && (
        <button
          onClick={() =>
            toggleEpisode(show, episode.season_number, episode.episode_number)
          }
          aria-pressed={watched}
          aria-label={
            watched
              ? `Mark ${label} as not watched`
              : `Mark ${label} as watched`
          }
          title={watched ? "Watched" : "Mark as watched"}
          className={cn(
            "shrink-0 self-center p-2 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            watched
              ? "text-green-400 hover:text-green-300"
              : "text-gray-500 hover:text-white hover:bg-white/10",
          )}
        >
          {watched ? (
            <CircleCheck className="w-6 h-6" aria-hidden="true" />
          ) : (
            <Circle className="w-6 h-6" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

function SeasonRow({
  season,
  show,
  today,
}: {
  season: Season;
  show: ShowRef;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<SeasonDetails | null>(null);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { watchedInSeason, setSeasonWatched } = useEpisodeProgress();

  const watched = watchedInSeason(show.tvId, season.season_number);
  // Capped because a season renumbered on TMDB would otherwise read "11 / 10".
  const watchedCount = Math.min(watched.length, season.episode_count);
  const progressPercent =
    season.episode_count > 0 ? (watchedCount / season.episode_count) * 100 : 0;

  // Only episodes that exist and have aired can be bulk-ticked, so this needs
  // the loaded season rather than just the count in the header.
  const airedEpisodeNumbers = useMemo(
    () =>
      (details?.episodes ?? [])
        .filter((episode) => hasAired(episode, today))
        .map((episode) => episode.episode_number),
    [details, today],
  );
  const allAiredWatched =
    airedEpisodeNumbers.length > 0 &&
    airedEpisodeNumbers.every((episode) => watched.includes(episode));

  function toggle() {
    if (!open && !details) {
      startTransition(async () => {
        const data = await fetchSeasonDetails(show.tvId, season.season_number);
        if (data) {
          setDetails(data);
        } else {
          setError(true);
        }
      });
    }
    setOpen((v) => !v);
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Season header — always visible */}
      <button
        onClick={toggle}
        className="w-full flex gap-4 p-3 hover:bg-gray-750 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="relative w-14 h-20 shrink-0 rounded overflow-hidden">
          {season.poster_path ? (
            <Image
              src={getImageUrl(season.poster_path, "w500")}
              alt={season.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <span className="text-gray-500 text-xs text-center px-1">
                No image
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white">{season.name}</h3>
            {season.vote_average > 0 && (
              <span className="text-yellow-400 text-sm flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-current" />
                {season.vote_average.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mt-0.5">
            {season.episode_count} episode
            {season.episode_count !== 1 ? "s" : ""}
            {season.air_date && (
              <> · {new Date(season.air_date).getFullYear()}</>
            )}
          </p>

          {/* Progress – only once there is progress to report, so an untouched
              show is not covered in empty bars. */}
          {watchedCount > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="h-1.5 flex-1 max-w-40 rounded-full bg-gray-700 overflow-hidden"
                role="progressbar"
                aria-valuenow={watchedCount}
                aria-valuemin={0}
                aria-valuemax={season.episode_count}
                aria-label={`${season.name} progress`}
              >
                <div
                  className="h-full rounded-full bg-green-500 transition-[width] duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {watchedCount === season.episode_count ? (
                  <span className="text-green-400">Completed</span>
                ) : (
                  <>
                    {watchedCount} / {season.episode_count}
                  </>
                )}
              </span>
            </div>
          )}

          {season.overview && (
            <p className="text-gray-300 text-sm mt-1 line-clamp-2">
              {season.overview}
            </p>
          )}
        </div>
        <div className="shrink-0 self-center text-gray-400 pl-2">
          {isPending ? (
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : open ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      {/* Episodes list */}
      {open && (
        <div className="border-t border-gray-700 px-3">
          {error && (
            <p className="text-gray-400 text-sm py-4 text-center">
              Failed to load episodes.
            </p>
          )}
          {!error && !details && isPending && (
            <p className="text-gray-400 text-sm py-4 text-center">
              Loading episodes…
            </p>
          )}
          {details && details.episodes.length === 0 && (
            <p className="text-gray-400 text-sm py-4 text-center">
              No episodes available yet.
            </p>
          )}

          {/* Bulk toggle lives here rather than in the header, which is itself a
              button and cannot nest one. */}
          {airedEpisodeNumbers.length > 0 && (
            <div className="flex justify-end pt-3">
              <button
                onClick={() =>
                  setSeasonWatched(
                    show,
                    season.season_number,
                    airedEpisodeNumbers,
                    !allAiredWatched,
                  )
                }
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-gray-200 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                {allAiredWatched
                  ? "Unmark all"
                  : `Mark ${airedEpisodeNumbers.length} aired as watched`}
              </button>
            </div>
          )}

          {details &&
            details.episodes.map((ep) => (
              <EpisodeRow
                key={ep.id}
                episode={ep}
                show={show}
                today={today}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function TVSeasons({
  seasons,
  tvId,
  showName,
  posterPath,
}: TVSeasonsProps) {
  const { watchedCount } = useEpisodeProgress();

  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const specials = seasons.filter((s) => s.season_number === 0);
  const sorted = [...regularSeasons, ...specials];

  // Rebuilt only when the show changes: it is handed to every episode row, and a
  // fresh object each render would churn their callbacks for nothing.
  const show = useMemo<ShowRef>(
    () => ({ tvId, name: showName, posterPath }),
    [tvId, showName, posterPath],
  );
  const today = todayUtc();
  const totalWatched = watchedCount(tvId);

  if (sorted.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold text-white">Seasons</h2>
        {totalWatched > 0 && (
          <p className="text-sm text-gray-400">
            {totalWatched} episode{totalWatched !== 1 ? "s" : ""} watched
          </p>
        )}
      </div>
      <div className="space-y-3">
        {sorted.map((season) => (
          <SeasonRow
            key={season.id}
            season={season}
            show={show}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}
