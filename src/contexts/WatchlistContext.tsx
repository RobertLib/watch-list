"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  WatchlistItem,
  WATCHLIST_STORAGE_KEY,
  clearWatchlist,
  getWatchlist,
  migrateWatchlist,
  addToWatchlist,
  addManyToWatchlist,
  removeFromWatchlist,
} from "@/lib/watchlist";
import type { ListWriteResult } from "@/lib/media-list";
import { MediaItem } from "@/types/tmdb";
import { DEFAULT_PROFILE_ID, subscribeProfiles } from "@/lib/profiles";
import { getProfileStorageOwner, isProfileStorageOwnerAvailable, isProfileStoreEvent, withProfileStorage } from "@/lib/profile-storage";

interface WatchlistContextType {
  watchlist: WatchlistItem[];
  /** Owner of the loaded list, retained until that list is refreshed. */
  profileId: string;
  isLoading: boolean;
  /** "duplicate" is already on the list; "failed" is a browser that stored nothing. */
  addItem: (item: MediaItem) => Promise<ListWriteResult>;
  addItems: (items: MediaItem[]) => Promise<ListWriteResult[]>;
  removeItem: (id: number, mediaType: "movie" | "tv") => Promise<ListWriteResult>;
  /** Empty the whole list. False when the browser refused the write. */
  clearAll: () => Promise<boolean>;
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
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [isLoading, setIsLoading] = useState(true);
  const loadedOwner = useRef(DEFAULT_PROFILE_ID);

  const refreshWatchlist = useCallback(() => {
    const owner = getProfileStorageOwner();
    loadedOwner.current = owner;
    setWatchlist(withProfileStorage(owner, getWatchlist));
    setProfileId(owner);
  }, []);

  // Load the watchlist from storage on mount. This has to happen in an effect
  // rather than in a lazy initialiser: storage does not exist while the server
  // renders, so reading it during render would make the server HTML and the
  // first client render disagree. `isLoading` is what lets the UI tell "not read
  // yet" apart from "genuinely empty".
  useEffect(() => {
    const owner = getProfileStorageOwner();
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    refreshWatchlist();
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Legacy cookie data renders immediately. Persist it under the same lock as
    // edits so a delayed migration cannot replace a newer save or restore.
    // It persists the already rendered fallback; edits and storage events own
    // subsequent refreshes, avoiding another fetch by every list consumer.
    void withProfileStorage(owner, migrateWatchlist);
  }, [refreshWatchlist]);

  // A `storage` event fires in every *other* tab that has the app open, so a
  // title saved in one tab no longer leaves the others showing a stale list
  // until they are reloaded.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key` is null when the whole storage was cleared, which concerns us too.
      // A profile switch may leave an empty or identical list unchanged, so
      // its owner also has to refresh when only the active profile changes.
      if (!isProfileStoreEvent(event.key, WATCHLIST_STORAGE_KEY)) return;
      refreshWatchlist();
    };

    window.addEventListener("storage", onStorage);
    const unsubscribeProfiles = subscribeProfiles(() => {
      // A normal switch retains the rendered owner until the page reloads or
      // its storage event arrives. A removed owner must immediately refresh.
      try {
        if (!isProfileStorageOwnerAvailable(profileId)) refreshWatchlist();
      } catch {
        refreshWatchlist();
      }
    });
    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribeProfiles();
    };
  }, [profileId, refreshWatchlist]);

  const addItem = useCallback(
    async (item: MediaItem): Promise<ListWriteResult> => {
      const result = await withProfileStorage(profileId, () => addToWatchlist({
        id: item.id,
        title: item.title,
        mediaType: item.media_type as "movie" | "tv",
        posterPath: item.poster_path,
        voteAverage: item.vote_average,
        releaseDate: item.release_date,
      }));

      if (result === "ok") {
        if (loadedOwner.current === profileId) {
          withProfileStorage(profileId, refreshWatchlist);
        }
      }
      return result;
    },
    [profileId, refreshWatchlist],
  );

  const removeItem = useCallback(
    async (id: number, mediaType: "movie" | "tv"): Promise<ListWriteResult> => {
      const result = await withProfileStorage(profileId, () => removeFromWatchlist(id, mediaType));
      if (result === "ok") {
        if (loadedOwner.current === profileId) {
          withProfileStorage(profileId, refreshWatchlist);
        }
      }
      return result;
    },
    [profileId, refreshWatchlist],
  );

  const addItems = useCallback(async (items: MediaItem[]): Promise<ListWriteResult[]> => {
    const results = await withProfileStorage(profileId, () => addManyToWatchlist(items.map((item) => ({
      id: item.id,
      title: item.title,
      mediaType: item.media_type,
      posterPath: item.poster_path,
      voteAverage: item.vote_average,
      releaseDate: item.release_date,
    }))));
    if (results.includes("ok") && loadedOwner.current === profileId) {
      withProfileStorage(profileId, refreshWatchlist);
    }
    return results;
  }, [profileId, refreshWatchlist]);

  // One write, not one per title. Removing them one at a time re-read, parsed,
  // sanitised, serialised and wrote the entire list for every entry, and pushed
  // a re-render of every consumer in between – quadratic work on a list that is
  // allowed to hold two thousand titles.
  const clearAll = useCallback(async (): Promise<boolean> => {
    if (!(await withProfileStorage(profileId, clearWatchlist))) return false;

    if (loadedOwner.current === profileId) {
      withProfileStorage(profileId, refreshWatchlist);
    }
    return true;
  }, [profileId, refreshWatchlist]);

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
      profileId,
      isLoading,
      addItem,
      addItems,
      removeItem,
      clearAll,
      isInWatchlist: checkIsInWatchlist,
      refreshWatchlist,
    }),
    [
      watchlist,
      profileId,
      isLoading,
      addItem,
      addItems,
      removeItem,
      clearAll,
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
