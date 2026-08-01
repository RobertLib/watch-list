"use client";

/** A show identified well enough to render a card without another TMDB call. */
export interface ShowRef {
  tvId: number;
  name: string;
  posterPath: string | null;
}

export interface ShowProgress extends ShowRef {
  /**
   * Watched episode numbers, keyed by season number. Sparse on purpose: someone
   * who skips an episode leaves a gap, and the gap is exactly what "up next"
   * has to find.
   */
  seasons: Record<string, number[]>;
  updatedAt: string;
}

/** Keyed by TV id. String keys because a JSON object has no other kind. */
export type EpisodeProgress = Record<string, ShowProgress>;

// localStorage rather than a cookie, for the same reason as the watchlist: one
// ticked season already outgrows the ~4KB a cookie allows, and an oversized
// cookie is rejected in full – every later save would look like it worked while
// nothing was stored. Nothing on the server reads this either; the client hands
// it over when it wants the "Continue Watching" row filled in.
export const EPISODE_PROGRESS_STORAGE_KEY = "episode-progress";

function isEpisodeNumber(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

function sortedUnique(episodes: number[]): number[] {
  return [...new Set(episodes)].sort((a, b) => a - b);
}

/**
 * Rebuild a stored map from the fields we understand rather than trusting it.
 *
 * Storage outlives releases and the user can edit it by hand, so a single
 * malformed show would otherwise throw in every render that walks the map.
 * Shows left with no ticked episode are dropped, which is also what makes
 * un-ticking the last episode clean up after itself.
 */
export function sanitizeProgress(input: unknown): EpisodeProgress {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const result: EpisodeProgress = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const tvId = Number(key);
    if (!Number.isInteger(tvId) || tvId <= 0) continue;
    if (!value || typeof value !== "object") continue;

    const { name, posterPath, seasons, updatedAt } = value as Record<
      string,
      unknown
    >;
    if (!seasons || typeof seasons !== "object" || Array.isArray(seasons)) {
      continue;
    }

    const cleanSeasons: Record<string, number[]> = {};

    for (const [seasonKey, episodes] of Object.entries(
      seasons as Record<string, unknown>,
    )) {
      const seasonNumber = Number(seasonKey);
      // Season 0 is where TMDB keeps the specials, so it has to stay allowed.
      if (!Number.isInteger(seasonNumber) || seasonNumber < 0) continue;
      if (!Array.isArray(episodes)) continue;

      const cleaned = sortedUnique(
        episodes.filter(isEpisodeNumber) as number[],
      );
      if (cleaned.length > 0) cleanSeasons[String(seasonNumber)] = cleaned;
    }

    if (Object.keys(cleanSeasons).length === 0) continue;

    result[String(tvId)] = {
      tvId,
      name: typeof name === "string" ? name : "",
      posterPath: typeof posterPath === "string" ? posterPath : null,
      seasons: cleanSeasons,
      // An entry without a timestamp sorts last rather than being thrown away –
      // the ticks themselves are still worth keeping.
      updatedAt: typeof updatedAt === "string" ? updatedAt : "",
    };
  }

  return result;
}

export function getEpisodeProgress(): EpisodeProgress {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY);
    if (!stored) return {};

    return sanitizeProgress(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing episode progress from storage:", error);
    return {};
  }
}

export function saveEpisodeProgress(progress: EpisodeProgress): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      EPISODE_PROGRESS_STORAGE_KEY,
      JSON.stringify(progress),
    );
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving episode progress to storage:", error);
  }
}

export function watchedInSeason(
  progress: EpisodeProgress,
  tvId: number,
  seasonNumber: number,
): number[] {
  return progress[String(tvId)]?.seasons[String(seasonNumber)] ?? [];
}

export function isEpisodeWatched(
  progress: EpisodeProgress,
  tvId: number,
  seasonNumber: number,
  episodeNumber: number,
): boolean {
  return watchedInSeason(progress, tvId, seasonNumber).includes(episodeNumber);
}

export function showWatchedCount(
  progress: EpisodeProgress,
  tvId: number,
): number {
  const show = progress[String(tvId)];
  if (!show) return 0;

  return Object.values(show.seasons).reduce(
    (total, episodes) => total + episodes.length,
    0,
  );
}

// The transforms below return a new map rather than mutating: the context keeps
// the map in React state, where an in-place edit would not re-render anything.

function withSeasons(
  progress: EpisodeProgress,
  show: ShowRef,
  seasons: Record<string, number[]>,
  now: string,
): EpisodeProgress {
  const key = String(show.tvId);
  const next = { ...progress };

  // Every season empty means nothing is ticked, and an empty show would only
  // clutter the "Continue Watching" payload.
  if (Object.keys(seasons).length === 0) {
    delete next[key];
    return next;
  }

  next[key] = {
    tvId: show.tvId,
    // Refreshed on every write, so a show renamed on TMDB stops showing its old
    // title on the card.
    name: show.name,
    posterPath: show.posterPath,
    seasons,
    updatedAt: now,
  };

  return next;
}

/** Drop seasons that no longer hold anything, so the map stays self-cleaning. */
function pruneSeasons(seasons: Record<string, number[]>) {
  return Object.fromEntries(
    Object.entries(seasons).filter(([, episodes]) => episodes.length > 0),
  );
}

export function toggleEpisode(
  progress: EpisodeProgress,
  show: ShowRef,
  seasonNumber: number,
  episodeNumber: number,
  now: string = new Date().toISOString(),
): EpisodeProgress {
  const seasonKey = String(seasonNumber);
  const current = watchedInSeason(progress, show.tvId, seasonNumber);
  const isOn = current.includes(episodeNumber);

  const seasons = pruneSeasons({
    ...progress[String(show.tvId)]?.seasons,
    [seasonKey]: isOn
      ? current.filter((episode) => episode !== episodeNumber)
      : sortedUnique([...current, episodeNumber]),
  });

  return withSeasons(progress, show, seasons, now);
}

/**
 * Tick or untick a whole season at once. `episodeNumbers` is passed in rather
 * than derived from a count because only the caller knows which episodes have
 * actually aired – marking a season "watched" must not tick next week's episode.
 */
export function setSeasonWatched(
  progress: EpisodeProgress,
  show: ShowRef,
  seasonNumber: number,
  episodeNumbers: number[],
  watched: boolean,
  now: string = new Date().toISOString(),
): EpisodeProgress {
  const seasonKey = String(seasonNumber);
  const existing = progress[String(show.tvId)]?.seasons ?? {};

  const seasons = pruneSeasons({
    ...existing,
    [seasonKey]: watched
      ? sortedUnique([
          ...(existing[seasonKey] ?? []),
          ...episodeNumbers.filter(isEpisodeNumber),
        ])
      : (existing[seasonKey] ?? []).filter(
          (episode) => !episodeNumbers.includes(episode),
        ),
  });

  return withSeasons(progress, show, seasons, now);
}

export function removeShowProgress(
  progress: EpisodeProgress,
  tvId: number,
): EpisodeProgress {
  const next = { ...progress };
  delete next[String(tvId)];
  return next;
}

export function clearEpisodeProgress(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(EPISODE_PROGRESS_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing episode progress:", error);
  }
}
