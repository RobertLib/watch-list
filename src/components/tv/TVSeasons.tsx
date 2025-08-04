"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, Star, Clock, Calendar } from "lucide-react";
import { tmdbApi } from "@/lib/tmdb";
import { fetchSeasonDetails } from "@/app/actions";
import type { Season, SeasonDetails, Episode } from "@/types/tmdb";

interface TVSeasonsProps {
  seasons: Season[];
  tvId: number;
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function EpisodeRow({ episode }: { episode: Episode }) {
  const hasOverview = Boolean(episode.overview);

  return (
    <div className="flex gap-3 py-3 border-b border-gray-700/50 last:border-0">
      {/* Still image */}
      <div className="relative w-28 sm:w-36 shrink-0 rounded overflow-hidden bg-gray-700 aspect-video self-start">
        {episode.still_path ? (
          <Image
            src={tmdbApi.getImageUrl(episode.still_path, "w500")}
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
              {formatDate(episode.air_date)}
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
    </div>
  );
}

function SeasonRow({ season, tvId }: { season: Season; tvId: number }) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<SeasonDetails | null>(null);
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (!open && !details) {
      startTransition(async () => {
        const data = await fetchSeasonDetails(tvId, season.season_number);
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
              src={tmdbApi.getImageUrl(season.poster_path, "w500")}
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
          {details &&
            details.episodes.map((ep) => (
              <EpisodeRow key={ep.id} episode={ep} />
            ))}
        </div>
      )}
    </div>
  );
}

export function TVSeasons({ seasons, tvId }: TVSeasonsProps) {
  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const specials = seasons.filter((s) => s.season_number === 0);
  const sorted = [...regularSeasons, ...specials];

  if (sorted.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">Seasons</h2>
      <div className="space-y-3">
        {sorted.map((season) => (
          <SeasonRow key={season.id} season={season} tvId={tvId} />
        ))}
      </div>
    </div>
  );
}
