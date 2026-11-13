/**
 * What an import is made of, between reading a file and writing to storage.
 *
 * Four services, a dozen file shapes, and none of them identifies a title the
 * way this app does. So a file is first read into entries that say only what
 * the file said – "this title, by this id or this name, was on a watchlist" –
 * and are then matched to TMDB titles (`resolve.ts`) and written
 * (`apply.ts`). Nothing in here knows about storage.
 */

import type { MediaType } from "@/types/tmdb";

export type ImportSource = "letterboxd" | "imdb" | "trakt" | "tvtime";

export const IMPORT_SOURCE_NAMES: Record<ImportSource, string> = {
  letterboxd: "Letterboxd",
  imdb: "IMDb",
  trakt: "Trakt",
  tvtime: "TV Time",
};

/** How an export names a title. Whatever it gives; matching uses the best there is. */
export interface TitleRef {
  /**
   * Absent where the file does not usably say: an IMDb row's type is written
   * in the account's language, so TMDB's answer for the id decides instead.
   */
  mediaType?: MediaType;
  tmdbId?: number;
  /** `tt…` */
  imdbId?: string;
  /** TheTVDB's id – what TV Time knows a series by. */
  tvdbId?: number;
  title?: string;
  year?: number;
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

/** One title, and everything the files said about it. */
export interface ImportEntry {
  ref: TitleRef;
  /** On the service's "to watch" list. */
  watchlist?: boolean;
  watchlistAt?: string;
  watched?: boolean;
  watchedAt?: string;
  /** Out of ten, as this app scores. */
  rating?: number;
  ratedAt?: string;
  /**
   * In the library there without it saying whether anything was watched: TV
   * Time's "followed". Becomes a watchlist entry unless a watch or a ticked
   * episode says the title is past that.
   */
  followed?: boolean;
  /** A series' watched episodes. */
  episodes?: EpisodeRef[];
}

/** A file to read: one the visitor chose, or one inside an archive they chose. */
export interface ImportFile {
  /** Its path – `gdpr-data/seen_episode.csv` inside an archive. */
  name: string;
  text: () => Promise<string>;
}

export interface ParsedExport {
  /** The services the files came from, in the order found. */
  sources: ImportSource[];
  /** One per title, merged across every file. */
  entries: ImportEntry[];
  /** The files that were read, and how many rows each contributed. */
  files: { name: string; source: ImportSource; rows: number }[];
  /** Files nothing here knows how to read. */
  unrecognised: string[];
  /**
   * Rows that were understood and left out on purpose – an episode rated on
   * IMDb, a special, a video game – because this app has nowhere to put them.
   */
  skippedRows: number;
}
