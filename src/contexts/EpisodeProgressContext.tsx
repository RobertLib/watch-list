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
  toggleEpisode: (
    show: ShowRef,
    seasonNumber: number,
    episodeNumber: number,
  ) => void;
  setSeasonWatched: (
    show: ShowRef,
    seasonNumber: number,
    episodeNumbers: number[],
    watched: boolean,
  ) => void;
  removeShow: (tvId: number) => void;
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

  const refreshProgress = useCallback(() => {
    setProgress(getEpisodeProgress());
  }, []);

  // Read in an effect rather than in a lazy initialiser: storage does not exist
  // while the server renders, so reading it during render would make the server
  // HTML and the first client render disagree. `isLoading` is what lets the UI
  // tell "not read yet" apart from "nothing ticked".
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating from a browser-only store, see above */
    setProgress(getEpisodeProgress());
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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

  // Storage is written from the updater so the two never drift: React may batch
  // or replay the state update, and a write placed outside would then persist a
  // map that state never adopted.
  const update = useCallback(
    (transform: (current: EpisodeProgress) => EpisodeProgress) => {
      setProgress((current) => {
        const next = transform(current);
        saveEpisodeProgress(next);
        return next;
      });
    },
    [],
  );

  const handleToggleEpisode = useCallback(
    (show: ShowRef, seasonNumber: number, episodeNumber: number) => {
      update((current) =>
        toggleEpisode(current, show, seasonNumber, episodeNumber),
      );
    },
    [update],
  );

  const handleSetSeasonWatched = useCallback(
    (
      show: ShowRef,
      seasonNumber: number,
      episodeNumbers: number[],
      watched: boolean,
    ) => {
      update((current) =>
        setSeasonWatched(
          current,
          show,
          seasonNumber,
          episodeNumbers,
          watched,
        ),
      );
    },
    [update],
  );

  const removeShow = useCallback(
    (tvId: number) => {
      update((current) => removeShowProgress(current, tvId));
    },
    [update],
  );

  const clearAll = useCallback(() => {
    clearEpisodeProgress();
    setProgress({});
  }, []);

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
