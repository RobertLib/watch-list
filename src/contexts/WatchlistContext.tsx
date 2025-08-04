"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  WatchlistItem,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  isInWatchlist,
} from "@/lib/watchlist";
import { MediaItem } from "@/types/tmdb";

interface WatchlistContextType {
  watchlist: WatchlistItem[];
  isLoading: boolean;
  addItem: (item: MediaItem) => boolean;
  removeItem: (id: number, mediaType: "movie" | "tv") => boolean;
  isInWatchlist: (id: number, mediaType: "movie" | "tv") => boolean;
  refreshWatchlist: () => void;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(
  undefined
);

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (context === undefined) {
    throw new Error("useWatchlist must be used within a WatchlistProvider");
  }
  return context;
}

interface WatchlistProviderProps {
  children: React.ReactNode;
}

export function WatchlistProvider({ children }: WatchlistProviderProps) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshWatchlist = () => {
    setWatchlist(getWatchlist());
  };

  useEffect(() => {
    // Load watchlist from cookies on mount
    const loadWatchlist = () => {
      setWatchlist(getWatchlist());
      setIsLoading(false);
    };
    loadWatchlist();
  }, []);

  const addItem = (item: MediaItem): boolean => {
    const watchlistItem = {
      id: item.id,
      title: item.title,
      mediaType: item.media_type as "movie" | "tv",
      posterPath: item.poster_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date,
    };

    const success = addToWatchlist(watchlistItem);
    if (success) {
      refreshWatchlist();
    }
    return success;
  };

  const removeItem = (id: number, mediaType: "movie" | "tv"): boolean => {
    const success = removeFromWatchlist(id, mediaType);
    if (success) {
      refreshWatchlist();
    }
    return success;
  };

  const checkIsInWatchlist = (
    id: number,
    mediaType: "movie" | "tv"
  ): boolean => {
    return isInWatchlist(id, mediaType);
  };

  const value: WatchlistContextType = {
    watchlist,
    isLoading,
    addItem,
    removeItem,
    isInWatchlist: checkIsInWatchlist,
    refreshWatchlist,
  };

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}
