/**
 * Matches import entries to TMDB titles.
 *
 * Every service knows a film by something else – Trakt by TMDB's own id, IMDb
 * by its `tt…`, TV Time by TheTVDB's number, Letterboxd by a name and a year –
 * and this app stores TMDB ids with the poster and date a card needs. So each
 * entry is looked up once, by the strongest thing it carries, falling back to
 * the next where that finds nothing.
 *
 * A match by name is held to a standard: the title has to be the same, or the
 * year has to agree. A film that cannot be matched with that much confidence
 * is reported as not found rather than guessed at – a wrong film quietly added
 * to someone's history is worse than a missing one they are told about.
 */

import { TMDB_CONFIG, TTL, tmdbFetchJson, type TMDBRequestOptions } from "@/lib/tmdb-cache";
import { releaseYear } from "@/lib/dates";
import type { MediaType } from "@/types/tmdb";
import { mergeEntry } from "./formats";
import type { ImportEntry, TitleRef } from "./types";

/** A TMDB title, with what a watchlist or history entry stores of it. */
export interface ResolvedTitle {
  mediaType: MediaType;
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  voteAverage: number;
}

export interface ResolvedEntry {
  title: ResolvedTitle;
  entry: ImportEntry;
}

export interface Resolution {
  /** One per TMDB title: entries that turned out to be the same title are merged. */
  resolved: ResolvedEntry[];
  /** Looked up and not found on TMDB – or found only as something else, like an episode. */
  unmatched: ImportEntry[];
  /** Not looked up: TMDB did not answer. Importing again picks these up. */
  failed: ImportEntry[];
}

export interface ResolveOptions {
  signal?: AbortSignal;
  /** Called as each entry settles. */
  onProgress?: (done: number, total: number) => void;
}

/** Lookups in flight at once. The transport queues behind its own limit as well. */
const CONCURRENCY = 6;

/** What TMDB sends for a film or a series in a list, a search or a `find`. */
interface TmdbTitle {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
}

interface FindResponse {
  movie_results?: TmdbTitle[];
  tv_results?: TmdbTitle[];
}

function url(path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `${TMDB_CONFIG.BASE_URL}${path}${query ? `?${query}` : ""}`;
}

function toResolved(mediaType: MediaType, title: TmdbTitle): ResolvedTitle {
  return {
    mediaType,
    id: title.id,
    title: (mediaType === "movie" ? title.title : title.name) ?? title.title ?? title.name ?? "",
    posterPath: title.poster_path ?? null,
    releaseDate: (mediaType === "movie" ? title.release_date : title.first_air_date) ?? "",
    voteAverage: typeof title.vote_average === "number" ? title.vote_average : 0,
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /TMDB API error: 404\b/.test(error.message);
}

function normalise(title: string | undefined): string {
  return (title ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The search result that is this title, or none.
 *
 * Same name and a year within one of the export's (a festival premiere and a
 * release are often a year apart): that is the film. Same name and no year to
 * check: the best-known film of that name. A different name – TMDB matched a
 * translation or an alternative title – only with the year agreeing, or where
 * the search found exactly one thing. Anything else is a guess.
 */
export function pickMatch(
  mediaType: MediaType,
  results: TmdbTitle[],
  ref: TitleRef,
): TmdbTitle | null {
  if (results.length === 0) return null;

  const wanted = normalise(ref.title);
  const yearOf = (title: TmdbTitle) =>
    releaseYear(mediaType === "movie" ? title.release_date : title.first_air_date);
  const sameName = (title: TmdbTitle) =>
    [title.title, title.name, title.original_title, title.original_name].some(
      (name) => name !== undefined && normalise(name) === wanted,
    );
  const yearAgrees = (title: TmdbTitle) => {
    const year = yearOf(title);
    return ref.year !== undefined && year !== null && Math.abs(year - ref.year) <= 1;
  };

  const named = results.filter(sameName);
  if (ref.year !== undefined) {
    return named.find(yearAgrees) ?? results.find(yearAgrees) ?? null;
  }
  return named[0] ?? (results.length === 1 ? results[0] : null);
}

async function byTmdbId(
  mediaType: MediaType,
  id: number,
  options: TMDBRequestOptions,
): Promise<ResolvedTitle | null> {
  try {
    const title = await tmdbFetchJson<TmdbTitle>(url(`/${mediaType}/${id}`), TTL.LONG, options);
    return toResolved(mediaType, title);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function byExternalId(
  externalId: string | number,
  source: "imdb_id" | "tvdb_id",
  preferred: MediaType | undefined,
  options: TMDBRequestOptions,
): Promise<ResolvedTitle | null> {
  const found = await tmdbFetchJson<FindResponse>(
    url(`/find/${encodeURIComponent(String(externalId))}`, { external_source: source }),
    TTL.LONG,
    options,
  );
  const movie = found.movie_results?.[0];
  const show = found.tv_results?.[0];
  // What the export called it first; what TMDB has it as otherwise. An IMDb
  // "TV Movie" can be a film here, and its type may not have been readable at
  // all. An id that is only an episode on TMDB is neither, and is not matched.
  if (preferred === "tv") return show ? toResolved("tv", show) : movie ? toResolved("movie", movie) : null;
  return movie ? toResolved("movie", movie) : show ? toResolved("tv", show) : null;
}

async function byName(ref: TitleRef, options: TMDBRequestOptions): Promise<ResolvedTitle | null> {
  if (!ref.title) return null;
  const mediaType = ref.mediaType ?? "movie";
  const yearParam = mediaType === "movie" ? "year" : "first_air_date_year";

  const search = async (withYear: boolean) => {
    const params: Record<string, string> = { query: ref.title!, include_adult: "false" };
    if (withYear && ref.year !== undefined) params[yearParam] = String(ref.year);
    const page = await tmdbFetchJson<{ results?: TmdbTitle[] }>(
      url(`/search/${mediaType}`, params),
      TTL.LONG,
      options,
    );
    return pickMatch(mediaType, page.results ?? [], ref);
  };

  // With the year first, which sorts a remake from its original; then without,
  // for the title whose year the two services disagree on by one.
  const match = (ref.year !== undefined ? await search(true) : null) ?? (await search(false));
  return match ? toResolved(mediaType, match) : null;
}

/** One entry's title: by the strongest id it has, then the next. */
export async function resolveRef(
  ref: TitleRef,
  options: TMDBRequestOptions = {},
): Promise<ResolvedTitle | null> {
  if (ref.tmdbId && ref.mediaType) {
    const title = await byTmdbId(ref.mediaType, ref.tmdbId, options);
    if (title) return title;
  }
  if (ref.imdbId) {
    const title = await byExternalId(ref.imdbId, "imdb_id", ref.mediaType, options);
    if (title) return title;
  }
  // TheTVDB's series ids. Its film ids are a different numbering TMDB cannot
  // look up, so a film goes on to its name.
  if (ref.tvdbId && ref.mediaType === "tv") {
    const title = await byExternalId(ref.tvdbId, "tvdb_id", "tv", options);
    if (title) return title;
  }
  return byName(ref, options);
}

function isAbort(error: unknown): boolean {
  return (
    error !== null && typeof error === "object" &&
    "name" in error && error.name === "AbortError"
  );
}

/**
 * Look every entry up, a few at a time.
 *
 * One entry failing – TMDB not answering for it – does not stop the rest: it is
 * set aside in `failed`, and since an import only ever adds, running it again
 * picks those up. Cancelling (`signal`) rejects with the abort.
 */
export async function resolveEntries(
  entries: ImportEntry[],
  { signal, onProgress }: ResolveOptions = {},
): Promise<Resolution> {
  const titles = new Array<ResolvedTitle | null | undefined>(entries.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < entries.length) {
      const index = next++;
      signal?.throwIfAborted();
      try {
        titles[index] = await resolveRef(entries[index].ref, { signal, priority: "background" });
      } catch (error) {
        if (isAbort(error) || signal?.aborted) throw error;
        // Left undefined: not looked up, as opposed to looked up and not there.
        console.error("Could not look a title up on TMDB:", error);
      }
      done++;
      onProgress?.(done, entries.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
  );

  // Two rows that named one title two ways – by id in one file and by name in
  // another – meet here.
  const byTitle = new Map<string, ResolvedEntry>();
  const unmatched: ImportEntry[] = [];
  const failed: ImportEntry[] = [];

  entries.forEach((entry, index) => {
    const title = titles[index];
    if (title === undefined) {
      failed.push(entry);
      return;
    }
    if (title === null) {
      unmatched.push(entry);
      return;
    }
    const key = `${title.mediaType}-${title.id}`;
    const existing = byTitle.get(key);
    byTitle.set(
      key,
      existing ? { title, entry: mergeEntry(existing.entry, entry) } : { title, entry },
    );
  });

  return { resolved: [...byTitle.values()], unmatched, failed };
}
