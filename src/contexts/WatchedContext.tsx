"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  WatchedItem,
  getWatched,
  addToWatched,
  removeFromWatched,
  clearWatched,
} from "@/lib/watched";
import { MediaItem, MediaType } from "@/types/tmdb";

interface WatchedContextType {
  watched: WatchedItem[];
  isLoading: boolean;
  addItem: (item: MediaItem) => boolean;
  removeItem: (id: number, mediaType: MediaType) => boolean;
  isWatched: (id: number, mediaType: MediaType) => boolean;
  clearAll: () => void;
  refreshWatched: () => void;
}

const WatchedContext = createContext<WatchedContextType | undefined>(undefined);

export function useWatched() {
  const context = useContext(WatchedContext);
  if (context === undefined) {
    throw new Error("useWatched must be used within a WatchedProvider");
  }
  return context;
}

interface WatchedProviderProps {
  children: React.ReactNode;
}

export function WatchedProvider({ children }: WatchedProviderProps) {
  const [watched, setWatched] = useState<WatchedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshWatched = () => {
    setWatched(getWatched());
  };

  useEffect(() => {
    // Load watched list from storage on mount
    const loadWatched = () => {
      setWatched(getWatched());
      setIsLoading(false);
    };
    loadWatched();
  }, []);

  const addItem = (item: MediaItem): boolean => {
    const success = addToWatched({
      id: item.id,
      title: item.title,
      mediaType: item.media_type,
      posterPath: item.poster_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date,
    });

    if (success) {
      refreshWatched();
    }
    return success;
  };

  const removeItem = (id: number, mediaType: MediaType): boolean => {
    const success = removeFromWatched(id, mediaType);
    if (success) {
      refreshWatched();
    }
    return success;
  };

  const clearAll = () => {
    clearWatched();
    setWatched([]);
  };

  // A grid asks this once per card, so the lookup is indexed rather than a scan
  // of a history that can hold hundreds of titles.
  const watchedKeys = useMemo(
    () => new Set(watched.map((item) => `${item.mediaType}-${item.id}`)),
    [watched],
  );

  // Answered from state rather than from storage, so a card rendered on the
  // server and the same card on hydration agree – the list is only read once
  // the mount effect has run.
  const checkIsWatched = (id: number, mediaType: MediaType): boolean => {
    return watchedKeys.has(`${mediaType}-${id}`);
  };

  const value: WatchedContextType = {
    watched,
    isLoading,
    addItem,
    removeItem,
    isWatched: checkIsWatched,
    clearAll,
    refreshWatched,
  };

  return (
    <WatchedContext.Provider value={value}>{children}</WatchedContext.Provider>
  );
}
