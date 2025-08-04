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

interface EpisodeProgressContextType {
  progress: EpisodeProgress;
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
  ) => boolean;
  setSeasonWatched: (
    show: ShowRef,
    seasonNumber: number,
    episodeNumbers: number[],
    watched: boolean,
  ) => boolean;
  removeShow: (tvId: number) => boolean;
  clearAll: () => void;
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
  const [isLoading, setIsLoading] = useState(true);

  // A mirror of `progress` that is current *synchronously*. The writes below
  // compute the next map from it rather than from inside a `setState` updater,
  // because an updater runs during render – twice under StrictMode – and a
  // storage write placed there is a side effect in the one place React promises
  // to replay. Two ticks in the same event handler each see the other's result
  // here, which a state read would not give them.
  const progressRef = useRef(progress);

  // The only way state changes. Keeps the ref and the state from ever
  // disagreeing about what the current map is.
  const commit = useCallback((next: EpisodeProgress) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  const refreshProgress = useCallback(() => {
    commit(getEpisodeProgress());
  }, [commit]);

  // Read in an effect rather than in a lazy initialiser: storage does not exist
  // while the server renders, so reading it during render would make the server
  // HTML and the first client render disagree. `isLoading` is what lets the UI
  // tell "not read yet" apart from "nothing ticked".
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    commit(getEpisodeProgress());
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [commit]);

  // Fires in every *other* tab that has the app open, so ticking an episode in
  // one tab no longer leaves the others showing stale progress.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key` is null when the whole storage was cleared, which concerns us too.
      if (event.key !== null && event.key !== EPISODE_PROGRESS_STORAGE_KEY) {
        return;
      }
      refreshProgress();
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshProgress]);

  // Storage first, state second – and state only if storage took it. The write
  // used to sit inside the `setProgress` updater and its result was thrown
  // away, so a browser that refused the write still had the tick adopted on
  // screen, to vanish on the next reload. Now a refused write changes nothing
  // and says so, and the caller can tell the visitor.
  const update = useCallback(
    (transform: (current: EpisodeProgress) => EpisodeProgress): boolean => {
      const next = transform(progressRef.current);
      if (!saveEpisodeProgress(next)) return false;

      commit(next);
      return true;
    },
    [commit],
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
    ) =>
      update((current) =>
        setSeasonWatched(
          current,
          show,
          seasonNumber,
          episodeNumbers,
          watched,
        ),
      ),
    [update],
  );

  const removeShow = useCallback(
    (tvId: number) => update((current) => removeShowProgress(current, tvId)),
    [update],
  );

  const clearAll = useCallback(() => {
    clearEpisodeProgress();
    commit({});
  }, [commit]);

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
