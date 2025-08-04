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
  EPISODE_PROGRESS_STORAGE_KEY,
  clearEpisodeProgress,
  getEpisodeProgress,
  isEpisodeWatched,
  removeShowProgress,
  saveEpisodeProgress,
  setSeasonWatched,
  showWatchedCount,
  toggleEpisode,
  watchedInSeason,
  type EpisodeProgress,
  type ShowProgress,
  type ShowRef,
} from "@/lib/episode-progress";
import { DEFAULT_PROFILE_ID, subscribeProfiles } from "@/lib/profiles";
import { getProfileStorageOwner, isProfileStorageOwnerAvailable, isProfileStoreEvent, withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

interface EpisodeProgressContextType {
  progress: EpisodeProgress;
  /** Owner of the loaded progress, retained until the map is refreshed. */
  profileId: string;
  isLoading: boolean;
  /** Shows with ticked episodes, most recent activity first. */
  shows: ShowProgress[];
  isEpisodeWatched: (
    tvId: number,
    seasonNumber: number,
    episodeNumber: number,
  ) => boolean;
  watchedInSeason: (tvId: number, seasonNumber: number) => number[];
  watchedCount: (tvId: number) => number;
  /**
   * Every write answers whether the browser took it – the same contract the
   * watchlist and watched contexts keep, minus their "duplicate", which a tick
   * cannot produce. False means storage refused (a full quota, or a private
   * window that stores nothing) and state was left exactly as it was: the
   * caller says so, the way `WatchlistButton` toasts `STORAGE_REFUSED_MESSAGE`.
   */
  toggleEpisode: (
    show: ShowRef,
    seasonNumber: number,
    episodeNumber: number,
  ) => Promise<boolean>;
  setSeasonWatched: (
    show: ShowRef,
    seasonNumber: number,
    episodeNumbers: number[],
    watched: boolean,
    options?: { requireTracked?: boolean },
  ) => Promise<boolean>;
  removeShow: (tvId: number) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  /** Re-read storage – for a restore that writes it from outside this context. */
  refreshProgress: () => void;
}

const EpisodeProgressContext = createContext<
  EpisodeProgressContextType | undefined
>(undefined);

export function useEpisodeProgress() {
  const context = useContext(EpisodeProgressContext);
  if (context === undefined) {
    throw new Error(
      "useEpisodeProgress must be used within an EpisodeProgressProvider",
    );
  }
  return context;
}

export function EpisodeProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState<EpisodeProgress>({});
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [isLoading, setIsLoading] = useState(true);
  const loadedOwner = useRef(DEFAULT_PROFILE_ID);

  // State adopts a new map only after storage has accepted it.
  const commit = useCallback((next: EpisodeProgress, owner: string) => {
    loadedOwner.current = owner;
    setProgress(next);
    setProfileId(owner);
  }, []);

  const refreshProgress = useCallback(() => {
    const owner = getProfileStorageOwner();
    commit(withProfileStorage(owner, getEpisodeProgress), owner);
  }, [commit]);

  // Read in an effect rather than in a lazy initialiser: storage does not exist
  // while the server renders, so reading it during render would make the server
  // HTML and the first client render disagree. `isLoading` is what lets the UI
  // tell "not read yet" apart from "nothing ticked".
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    refreshProgress();
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refreshProgress]);

  // Fires in every *other* tab that has the app open, so ticking an episode in
  // one tab no longer leaves the others showing stale progress.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key` is null when the whole storage was cleared, which concerns us too.
      // Empty or identical progress does not change during a profile switch,
      // but the loaded map still needs to adopt its new owner.
      if (!isProfileStoreEvent(event.key, EPISODE_PROGRESS_STORAGE_KEY)) return;
      refreshProgress();
    };

    window.addEventListener("storage", onStorage);
    const unsubscribeProfiles = subscribeProfiles(() => {
      try {
        if (!isProfileStorageOwnerAvailable(profileId)) refreshProgress();
      } catch {
        refreshProgress();
      }
    });
    return () => {
      window.removeEventListener("storage", onStorage);
      unsubscribeProfiles();
    };
  }, [profileId, refreshProgress]);

  // Storage first, state second – and state only if storage took it. The write
  // used to sit inside the `setProgress` updater and its result was thrown
  // away, so a browser that refused the write still had the tick adopted on
  // screen, to vanish on the next reload. Now a refused write changes nothing
  // and says so, and the caller can tell the visitor.
  const update = useCallback(
    (transform: (current: EpisodeProgress) => EpisodeProgress): Promise<boolean> =>
      withProfileRosterLock(() => withProfileStorage(profileId, () => {
        if (!isProfileStorageOwnerAvailable(profileId)) return false;
        // Read only after acquiring the same lock used by edits and restores.
        const current = getEpisodeProgress({ strict: true });
        const next = transform(current);
        if (next !== current && !saveEpisodeProgress(next)) return false;

        if (loadedOwner.current === profileId) commit(next, profileId);
        return true;
      }), false),
    [commit, profileId],
  );

  const handleToggleEpisode = useCallback(
    (show: ShowRef, seasonNumber: number, episodeNumber: number) =>
      update((current) =>
        toggleEpisode(current, show, seasonNumber, episodeNumber),
      ),
    [update],
  );

  const handleSetSeasonWatched = useCallback(
    (
      show: ShowRef,
      seasonNumber: number,
      episodeNumbers: number[],
      watched: boolean,
      options?: { requireTracked?: boolean },
    ) =>
      update((current) => {
        if (options?.requireTracked && !current[String(show.tvId)]) return current;
        return setSeasonWatched(
          current,
          show,
          seasonNumber,
          episodeNumbers,
          watched,
        );
      }),
    [update],
  );

  const removeShow = useCallback(
    (tvId: number) => update((current) => removeShowProgress(current, tvId)),
    [update],
  );

  const clearAll = useCallback((): Promise<boolean> => withProfileRosterLock(() => {
    if (!withProfileStorage(profileId, clearEpisodeProgress)) return false;
    if (loadedOwner.current === profileId) commit({}, profileId);
    return true;
  }, false), [commit, profileId]);

  // Sorted here rather than at each call site: the "Continue Watching" row wants
  // the show someone last ticked at the front, which is the show they are most
  // likely still working through.
  const shows = useMemo(
    () =>
      Object.values(progress).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [progress],
  );

  const checkIsEpisodeWatched = useCallback(
    (tvId: number, seasonNumber: number, episodeNumber: number) =>
      isEpisodeWatched(progress, tvId, seasonNumber, episodeNumber),
    [progress],
  );

  const getWatchedInSeason = useCallback(
    (tvId: number, seasonNumber: number) =>
      watchedInSeason(progress, tvId, seasonNumber),
    [progress],
  );

  const getWatchedCount = useCallback(
    (tvId: number) => showWatchedCount(progress, tvId),
    [progress],
  );

  // Memoised because this provider wraps the whole app: a fresh object here
  // re-renders every consumer.
  const value = useMemo<EpisodeProgressContextType>(
    () => ({
      progress,
      profileId,
      isLoading,
      shows,
      isEpisodeWatched: checkIsEpisodeWatched,
      watchedInSeason: getWatchedInSeason,
      watchedCount: getWatchedCount,
      toggleEpisode: handleToggleEpisode,
      setSeasonWatched: handleSetSeasonWatched,
      removeShow,
      clearAll,
      refreshProgress,
    }),
    [
      progress,
      profileId,
      isLoading,
      shows,
      checkIsEpisodeWatched,
      getWatchedInSeason,
      getWatchedCount,
      handleToggleEpisode,
      handleSetSeasonWatched,
      removeShow,
      clearAll,
      refreshProgress,
    ],
  );

  return (
    <EpisodeProgressContext.Provider value={value}>
      {children}
    </EpisodeProgressContext.Provider>
  );
}
