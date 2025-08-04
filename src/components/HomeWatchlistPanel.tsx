"use client";

import Link from "next/link";
import Image from "next/image";
import { Film, Tv, ArrowRight } from "lucide-react";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { tmdbApi } from "@/lib/tmdb";

export function HomeWatchlistPanel() {
  const { watchlist, isLoading } = useWatchlist();

  if (isLoading) return null;
  if (watchlist.length === 0) return null;

  const movies = watchlist.filter((item) => item.mediaType === "movie");
  const tvShows = watchlist.filter((item) => item.mediaType === "tv");

  // Show last 5 added items as poster thumbnails
  const recentItems = [...watchlist]
    .sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
    )
    .slice(0, 5);

  return (
    <section
      aria-labelledby="watchlist-summary-heading"
      className="bg-linear-to-r from-blue-950/40 to-indigo-950/30 border border-blue-900/30 rounded-xl p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2
            id="watchlist-summary-heading"
            className="text-lg font-semibold text-white leading-tight"
          >
            Your Watchlist
          </h2>
          <p className="text-sm text-gray-400">
            {watchlist.length} title{watchlist.length !== 1 ? "s" : ""} saved
          </p>
        </div>

        <Link
          href="/watchlist"
          className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors shrink-0 mt-0.5"
        >
          View all
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {/* Poster strip */}
        <div className="flex -space-x-3" aria-hidden="true">
          {recentItems.map((item) => {
            const posterUrl = item.posterPath
              ? tmdbApi.getImageUrl(item.posterPath, "w500")
              : null;
            return (
              <div
                key={`${item.mediaType}-${item.id}`}
                className="w-10 h-14 rounded-md border-2 border-gray-900 overflow-hidden bg-gray-800 shrink-0"
              >
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={item.title}
                    width={40}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                    ?
                  </div>
                )}
              </div>
            );
          })}
          {watchlist.length > 5 && (
            <div className="w-10 h-14 rounded-md border-2 border-gray-900 bg-gray-800 flex items-center justify-center shrink-0">
              <span className="text-xs text-gray-400 font-medium">
                +{watchlist.length - 5}
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm">
          {movies.length > 0 && (
            <Link
              href="/watchlist"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <Film className="h-4 w-4 text-blue-500" aria-hidden="true" />
              <span>
                <span className="font-semibold text-white">
                  {movies.length}
                </span>{" "}
                movie{movies.length !== 1 ? "s" : ""}
              </span>
            </Link>
          )}
          {tvShows.length > 0 && (
            <Link
              href="/watchlist"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <Tv className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              <span>
                <span className="font-semibold text-white">
                  {tvShows.length}
                </span>{" "}
                TV show{tvShows.length !== 1 ? "s" : ""}
              </span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
