"use client";

import Link from "next/link";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { MediaCard } from "@/components/MediaCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Trash2, Star } from "lucide-react";
import { MediaItem } from "@/types/tmdb";

export default function WatchlistPage() {
  const { watchlist, removeItem, isLoading } = useWatchlist();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <Star className="w-12 h-12 text-gray-600" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Your Watchlist is Empty</h1>
            <p className="text-gray-400 text-lg max-w-md mx-auto">
              Start adding movies and TV shows you want to watch by clicking the
              heart icon on any media card.
            </p>
          </div>
          <Link
            href="/"
            prefetch={false}
            className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
          >
            Discover Content
          </Link>
        </div>
      </div>
    );
  }

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear your entire watchlist?")) {
      watchlist.forEach((item) => {
        removeItem(item.id, item.mediaType);
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">My Watchlist</h1>
          <p className="text-gray-400">
            {watchlist.length} {watchlist.length === 1 ? "item" : "items"} to
            watch
          </p>
        </div>

        {watchlist.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
        {watchlist.map((item) => {
          // Convert WatchlistItem to MediaItem format for MediaCard
          const mediaItem: MediaItem = {
            id: item.id,
            title: item.title,
            poster_path: item.posterPath,
            backdrop_path: null,
            overview: "",
            release_date: item.releaseDate,
            vote_average: item.voteAverage,
            vote_count: 0,
            genre_ids: [],
            media_type: item.mediaType,
          };

          return (
            <div
              key={`${item.id}-${item.mediaType}`}
              className="relative group"
            >
              <MediaCard
                item={mediaItem}
                size="medium"
                showOverlay={true}
                forceShowOverlay={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
