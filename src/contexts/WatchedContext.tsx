"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  WatchedItem,
  WATCHED_STORAGE_KEY,
  getWatched,
  addToWatched,
  removeFromWatched,
  clearWatched,
} from "@/lib/watched";
import type { ListWriteResult } from "@/lib/media-list";
import { MediaItem, MediaType } from "@/types/tmdb";

interface WatchedContextType {
  watched: WatchedItem[];
  isLoading: boolean;
  /** "duplicate" is already on the list; "failed" is a browser that stored nothing. */
  addItem: (item: MediaItem) => ListWriteResult;
  removeItem: (id: number, mediaType: MediaType) => ListWriteResult;
  isWatched: (id: number, mediaType: MediaType) => boolean;
  /** Empty the whole list. False when the browser refused the write. */
  clearAll: () => boolean;
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

  const refreshWatched = useCallback(() => {
    setWatched(getWatched());
  }, []);

  // Load the watched list from storage on mount. This has to happen in an effect
  // rather than in a lazy initialiser: storage does not exist while the server
  // renders, so reading it during render would make the server HTML and the
  // first client render disagree. `isLoading` is what lets the UI tell "not read
  // yet" apart from "genuinely empty".
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    setWatched(getWatched());
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // A `storage` event fires in every *other* tab that has the app open, so a
  // title marked watched in one tab no longer leaves the others showing a stale
  // history until they are reloaded.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key` is null when the whole storage was cleared, which concerns us too.
      if (event.key !== null && event.key !== WATCHED_STORAGE_KEY) return;
      refreshWatched();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshWatched]);

  const addItem = useCallback(
    (item: MediaItem): ListWriteResult => {
      const result = addToWatched({
        id: item.id,
        title: item.title,
        mediaType: item.media_type,
        posterPath: item.poster_path,
        voteAverage: item.vote_average,
        releaseDate: item.release_date,
      });

      if (result === "ok") {
        refreshWatched();
      }
      return result;
    },
    [refreshWatched],
  );

  const removeItem = useCallback(
    (id: number, mediaType: MediaType): ListWriteResult => {
      const result = removeFromWatched(id, mediaType);
      if (result === "ok") {
        refreshWatched();
      }
      return result;
    },
    [refreshWatched],
  );

  // Only empties the screen if storage actually took the write; otherwise the
  // list would come back on the next reload and the clear would look like a bug.
  const clearAll = useCallback((): boolean => {
    if (!clearWatched()) return false;

    setWatched([]);
    return true;
  }, []);

  // A grid asks this once per card, so the lookup is indexed rather than a scan
  // of a history that can hold hundreds of titles.
  const watchedKeys = useMemo(
    () => new Set(watched.map((item) => `${item.mediaType}-${item.id}`)),
    [watched],
  );

  // Answered from state rather than from storage, so a card rendered on the
  // server and the same card on hydration agree – the list is only read once
  // the mount effect has run.
  const checkIsWatched = useCallback(
    (id: number, mediaType: MediaType): boolean =>
      watchedKeys.has(`${mediaType}-${id}`),
    [watchedKeys],
  );

  // Memoised because this provider wraps the whole app: a fresh object here
  // re-renders every consumer, which on a listing page means every card.
  const value = useMemo<WatchedContextType>(
    () => ({
      watched,
      isLoading,
      addItem,
      removeItem,
      isWatched: checkIsWatched,
      clearAll,
      refreshWatched,
    }),
    [
      watched,
      isLoading,
      addItem,
      removeItem,
      checkIsWatched,
      clearAll,
      refreshWatched,
    ],
  );

  return (
    <WatchedContext.Provider value={value}>{children}</WatchedContext.Provider>
  );
}
