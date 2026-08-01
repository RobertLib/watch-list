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
  WatchlistItem,
  WATCHLIST_STORAGE_KEY,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
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
  undefined,
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

  const refreshWatchlist = useCallback(() => {
    setWatchlist(getWatchlist());
  }, []);

  // Load the watchlist from storage on mount. This has to happen in an effect
  // rather than in a lazy initialiser: storage does not exist while the server
  // renders, so reading it during render would make the server HTML and the
  // first client render disagree. `isLoading` is what lets the UI tell "not read
  // yet" apart from "genuinely empty".
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    setWatchlist(getWatchlist());
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // A `storage` event fires in every *other* tab that has the app open, so a
  // title saved in one tab no longer leaves the others showing a stale list
  // until they are reloaded.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key` is null when the whole storage was cleared, which concerns us too.
      if (event.key !== null && event.key !== WATCHLIST_STORAGE_KEY) return;
      refreshWatchlist();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshWatchlist]);

  const addItem = useCallback(
    (item: MediaItem): boolean => {
      const success = addToWatchlist({
        id: item.id,
        title: item.title,
        mediaType: item.media_type as "movie" | "tv",
        posterPath: item.poster_path,
        voteAverage: item.vote_average,
        releaseDate: item.release_date,
      });

      if (success) {
        refreshWatchlist();
      }
      return success;
    },
    [refreshWatchlist],
  );

  const removeItem = useCallback(
    (id: number, mediaType: "movie" | "tv"): boolean => {
      const success = removeFromWatchlist(id, mediaType);
      if (success) {
        refreshWatchlist();
      }
      return success;
    },
    [refreshWatchlist],
  );

  // A grid asks this once per card, so the lookup is indexed rather than a fresh
  // read and parse of the whole stored list for every card on every render.
  const watchlistKeys = useMemo(
    () => new Set(watchlist.map((item) => `${item.mediaType}-${item.id}`)),
    [watchlist],
  );

  // Answered from state rather than from storage, so a card rendered on the
  // server and the same card on hydration agree – the list is only read once
  // the mount effect has run.
  const checkIsInWatchlist = useCallback(
    (id: number, mediaType: "movie" | "tv"): boolean =>
      watchlistKeys.has(`${mediaType}-${id}`),
    [watchlistKeys],
  );

  // Memoised because this provider wraps the whole app: a fresh object here
  // re-renders every consumer, which on a listing page means every card.
  const value = useMemo<WatchlistContextType>(
    () => ({
      watchlist,
      isLoading,
      addItem,
      removeItem,
      isInWatchlist: checkIsInWatchlist,
      refreshWatchlist,
    }),
    [
      watchlist,
      isLoading,
      addItem,
      removeItem,
      checkIsInWatchlist,
      refreshWatchlist,
    ],
  );

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  );
}
