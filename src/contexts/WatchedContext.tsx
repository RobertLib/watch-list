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
  WatchedItem,
  WATCHED_STORAGE_KEY,
  getWatched,
  addToWatched,
  removeFromWatched,
  clearWatched,
} from "@/lib/watched";
import type { ListWriteResult } from "@/lib/media-list";
import { MediaItem, MediaType } from "@/types/tmdb";
import { DEFAULT_PROFILE_ID, subscribeProfiles } from "@/lib/profiles";
import { getProfileStorageOwner, isProfileStorageOwnerAvailable, isProfileStoreEvent, withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

interface WatchedContextType {
  watched: WatchedItem[];
  /** Owner of the loaded history, retained until that history is refreshed. */
  profileId: string;
  isLoading: boolean;
  /** "duplicate" is already on the list; "failed" is a browser that stored nothing. */
  addItem: (item: MediaItem) => Promise<ListWriteResult>;
  removeItem: (id: number, mediaType: MediaType) => Promise<ListWriteResult>;
  isWatched: (id: number, mediaType: MediaType) => boolean;
  /** Empty the whole list. False when the browser refused the write. */
  clearAll: () => Promise<boolean>;
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
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [isLoading, setIsLoading] = useState(true);
  const loadedOwner = useRef(DEFAULT_PROFILE_ID);

  const refreshWatched = useCallback(() => {
    const owner = getProfileStorageOwner();
    loadedOwner.current = owner;
    setWatched(withProfileStorage(owner, getWatched));
    setProfileId(owner);
  }, []);

  // Load the watched list from storage on mount. This has to happen in an effect
  // rather than in a lazy initialiser: storage does not exist while the server
  // renders, so reading it during render would make the server HTML and the
  // first client render disagree. `isLoading` is what lets the UI tell "not read
  // yet" apart from "genuinely empty".
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    refreshWatched();
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refreshWatched]);

  // A `storage` event fires in every *other* tab that has the app open, so a
  // title marked watched in one tab no longer leaves the others showing a stale
  // history until they are reloaded.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key` is null when the whole storage was cleared, which concerns us too.
      // Equal histories do not emit a data-key event when profiles switch.
      if (!isProfileStoreEvent(event.key, WATCHED_STORAGE_KEY)) return;
      refreshWatched();
    };

    window.addEventListener("storage", onStorage);
    const unsubscribeProfiles = subscribeProfiles(() => {
      try {
        if (!isProfileStorageOwnerAvailable(profileId)) refreshWatched();
      } catch {
        refreshWatched();
      }
    });
    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribeProfiles();
    };
  }, [profileId, refreshWatched]);

  const addItem = useCallback(
    async (item: MediaItem): Promise<ListWriteResult> => {
      const result = await withProfileRosterLock<ListWriteResult>(() => withProfileStorage(profileId, () => {
        if (!isProfileStorageOwnerAvailable(profileId)) return "failed";
        return addToWatched({
          id: item.id,
          title: item.title,
          mediaType: item.media_type,
          posterPath: item.poster_path,
          voteAverage: item.vote_average,
          releaseDate: item.release_date,
        });
      }), "failed");
      if (result === "ok" && loadedOwner.current === profileId) {
        withProfileStorage(profileId, refreshWatched);
      }
      return result;
    },
    [profileId, refreshWatched],
  );

  const removeItem = useCallback(
    async (id: number, mediaType: MediaType): Promise<ListWriteResult> => {
      const result = await withProfileRosterLock<ListWriteResult>(() => withProfileStorage(profileId, () => {
        if (!isProfileStorageOwnerAvailable(profileId)) return "failed";
        return removeFromWatched(id, mediaType);
      }), "failed");
      if (result === "ok" && loadedOwner.current === profileId) {
        withProfileStorage(profileId, refreshWatched);
      }
      return result;
    },
    [profileId, refreshWatched],
  );

  // Only empties the screen if storage actually took the write; otherwise the
  // list would come back on the next reload and the clear would look like a bug.
  const clearAll = useCallback(async (): Promise<boolean> => {
    const saved = await withProfileRosterLock(() => withProfileStorage(profileId, () => {
      if (!isProfileStorageOwnerAvailable(profileId)) return false;
      return clearWatched();
    }), false);
    if (!saved) return false;

    if (loadedOwner.current === profileId) {
      withProfileStorage(profileId, refreshWatched);
    }
    return true;
  }, [profileId, refreshWatched]);

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
      profileId,
      isLoading,
      addItem,
      removeItem,
      isWatched: checkIsWatched,
      clearAll,
      refreshWatched,
    }),
    [
      watched,
      profileId,
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
