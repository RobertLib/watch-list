/**
 * Reads the exports of Letterboxd, IMDb, Trakt and TV Time into import entries.
 *
 * Each service's files are recognised by what is in them – a header row, a
 * shape – and by name only where the contents cannot tell two files apart
 * (Letterboxd's watchlist and its watched list have the same four columns).
 * The column names below are the services' own, read off real exports; where
 * an export changed them between versions, both spellings are asked for.
 *
 * What is deliberately not read: reviews, comments, likes, custom lists and
 * profiles. A watchlist, a history, scores and ticked episodes are what this
 * app has a place for, and an account's email address is nothing it should
 * ever hold.
 */

import { field, hasColumn, parseCsv, type CsvRow } from "./csv";
import type {
  EpisodeRef,
  ImportEntry,
  ImportFile,
  ImportSource,
  ParsedExport,
  TitleRef,
} from "./types";
import type { MediaType } from "@/types/tmdb";

// ── Small readers ───────────────────────────────────────────────────────────

function basename(path: string): string {
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

function integer(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function positive(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/** A release year, or nothing: TV Time writes an unknown date as year 1. */
function year(value: unknown): number | undefined {
  const parsed = integer(typeof value === "string" ? value.slice(0, 4) : value);
  return parsed !== undefined && parsed >= 1870 && parsed <= 2100 ? parsed : undefined;
}

function imdbId(value: unknown): string | undefined {
  return typeof value === "string" && /^tt\d+$/.test(value.trim()) ? value.trim() : undefined;
}

function isTrue(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

/**
 * A date from an export as an ISO timestamp, or nothing.
 *
 * `YYYY-MM-DD` (Letterboxd, IMDb), `YYYY-MM-DD HH:MM:SS` with no zone (TV
 * Time, read as UTC), ISO 8601 (Trakt), and IMDb's oldest exports, which wrote
 * `Sun Aug 26 15:14:50 2012`. Anything else is no date rather than a wrong one.
 */
export function timestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const dayTime = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text);
  const normalised = day ? `${text}T00:00:00.000Z` : dayTime ? `${dayTime[1]}T${dayTime[2]}.000Z` : text;

  const time = Date.parse(normalised);
  // Year 1 is how TV Time writes a missing date, and a date past tomorrow is
  // not when anything was watched.
  if (
    !Number.isFinite(time) ||
    time < Date.UTC(1900, 0, 1) ||
    time > Date.now() + 86_400_000
  ) {
    return undefined;
  }
  return new Date(time).toISOString();
}

// ── Letterboxd ──────────────────────────────────────────────────────────────

/** Letterboxd scores out of five, in halves; this app out of ten. */
function letterboxdRating(value: string): number | undefined {
  const stars = Number(value);
  if (!value || !Number.isFinite(stars) || stars <= 0 || stars > 5) return undefined;
  return Math.min(10, Math.max(1, Math.round(stars * 2)));
}

function letterboxdEntries(name: string, rows: CsvRow[], headers: string[]): ImportEntry[] | null {
  const isDiary = hasColumn(headers, "Watched Date");
  const isRatings = !isDiary && hasColumn(headers, "Rating");
  const file = basename(name);
  // The watchlist and the watched list are the same four columns; only the
  // file's name says which this is.
  const isWatchlist = !isDiary && !isRatings && file.includes("watchlist");
  const isWatched = !isDiary && !isRatings && !isWatchlist && file.includes("watched");
  if (!isDiary && !isRatings && !isWatchlist && !isWatched) return null;

  const entries: ImportEntry[] = [];
  for (const row of rows) {
    const title = field(row, "Name");
    if (!title) continue;
    const ref: TitleRef = { mediaType: "movie", title, year: year(field(row, "Year")) };
    const logged = timestamp(field(row, "Date"));

    if (isWatchlist) {
      entries.push({ ref, watchlist: true, watchlistAt: logged });
      continue;
    }

    const watchedAt = timestamp(field(row, "Watched Date")) ?? logged;
    const rating = letterboxdRating(field(row, "Rating"));
    entries.push({
      ref,
      watched: true,
      watchedAt,
      ...(rating !== undefined ? { rating, ratedAt: logged ?? watchedAt } : {}),
    });
  }
  return entries;
}

// ── IMDb ────────────────────────────────────────────────────────────────────

const IMDB_MOVIE_TYPES = new Set([
  "movie", "tvmovie", "tvspecial", "tvshort", "short", "video",
  "featurefilm", "shortfilm", "documentary",
]);
const IMDB_SERIES_TYPES = new Set(["tvseries", "tvminiseries", "miniseries"]);
/** Things this app has no page for. */
const IMDB_SKIPPED_TYPES = new Set([
  "tvepisode", "videogame", "musicvideo", "podcastseries", "podcastepisode",
]);

/** `TV Mini Series`, `tvMiniSeries` and `Mini-Series` are one type. */
function imdbType(value: string): string {
  return value.toLowerCase().replace(/[\s-]+/g, "");
}

function imdbEntries(rows: CsvRow[], headers: string[]): { entries: ImportEntry[]; skipped: number } {
  // A ratings export has no position in a list; the watchlist and every custom
  // list do. Those two cannot be told apart, so a list is read as "to watch".
  const isList = hasColumn(headers, "Position", "Created");
  const entries: ImportEntry[] = [];
  let skipped = 0;

  for (const row of rows) {
    const id = imdbId(field(row, "Const"));
    if (!id) continue;

    const type = imdbType(field(row, "Title Type"));
    if (IMDB_SKIPPED_TYPES.has(type)) {
      skipped++;
      continue;
    }
    // The type is written in the account's language ("Film", "Série télé"), so
    // one that is not recognised is left for TMDB's answer to decide.
    const mediaType: MediaType | undefined = IMDB_MOVIE_TYPES.has(type)
      ? "movie"
      : IMDB_SERIES_TYPES.has(type)
        ? "tv"
        : undefined;

    const ref: TitleRef = {
      mediaType,
      imdbId: id,
      title: field(row, "Original Title", "Title") || undefined,
      year: year(field(row, "Year")),
    };
    const rating = integer(field(row, "Your Rating", "You rated"));
    const rated = rating !== undefined && rating >= 1 && rating <= 10;

    if (rated) {
      const ratedAt = timestamp(field(row, "Date Rated"));
      entries.push({ ref, rating, ratedAt, watched: true, watchedAt: ratedAt });
    } else if (isList) {
      entries.push({ ref, watchlist: true, watchlistAt: timestamp(field(row, "Created")) });
    }
  }
  return { entries, skipped };
}

// ── Trakt ───────────────────────────────────────────────────────────────────

interface TraktTitle {
  title?: unknown;
  year?: unknown;
  ids?: { tmdb?: unknown; imdb?: unknown; tvdb?: unknown };
}

interface TraktItem {
  type?: unknown;
  movie?: TraktTitle;
  show?: TraktTitle;
  episode?: { season?: unknown; number?: unknown };
  seasons?: { number?: unknown; episodes?: { number?: unknown }[] }[];
  listed_at?: unknown;
  watched_at?: unknown;
  last_watched_at?: unknown;
  rated_at?: unknown;
  rating?: unknown;
}

function traktRef(mediaType: MediaType, title: TraktTitle | undefined): TitleRef | null {
  if (!title || typeof title !== "object") return null;
  const ref: TitleRef = {
    mediaType,
    tmdbId: positive(title.ids?.tmdb),
    imdbId: imdbId(title.ids?.imdb),
    tvdbId: mediaType === "tv" ? positive(title.ids?.tvdb) : undefined,
    title: typeof title.title === "string" ? title.title : undefined,
    year: year(title.year),
  };
  return ref.tmdbId || ref.imdbId || ref.tvdbId || ref.title ? ref : null;
}

/** A regular episode: specials (season 0) are numbered differently everywhere. */
function episodeRef(season: unknown, episode: unknown): EpisodeRef | null {
  const s = positive(season);
  const e = positive(episode);
  return s !== undefined && e !== undefined ? { season: s, episode: e } : null;
}

/** What a Trakt export file is, by its name: `watched-history-2.json` is page two of the history. */
type TraktKind = "watchlist" | "watched-movies" | "watched-shows" | "history" | "ratings";

function traktKind(name: string): TraktKind | "ignored" | null {
  const base = basename(name).replace(/\.json$/, "").replace(/-\d+$/, "");
  if (base === "lists-watchlist" || base === "watchlist") return "watchlist";
  if (base === "watched-movies") return "watched-movies";
  if (base === "watched-shows") return "watched-shows";
  if (base === "watched-history" || base === "history") return "history";
  if (base === "ratings-movies" || base === "ratings-shows") return "ratings";
  // The rest of the archive: settings, likes, comments, custom lists, the
  // collection, per-episode ratings. Known, and not something to import.
  if (
    /^(user-|hidden-|network-|likes-|comments-|notes-|collection-|lists-|ratings-|watched-playback|_errors)/.test(base)
  ) {
    return "ignored";
  }
  return null;
}

function traktEntries(kind: TraktKind, items: TraktItem[]): { entries: ImportEntry[]; skipped: number } {
  const entries: ImportEntry[] = [];
  let skipped = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const movie = traktRef("movie", item.movie);
    const show = traktRef("tv", item.show);
    // A season or an episode entry also carries its show; only `type` says the
    // entry is not about the show itself.
    const type =
      typeof item.type === "string" ? item.type : item.episode ? "episode" : movie ? "movie" : "show";

    if (kind === "watchlist") {
      const ref = type === "movie" ? movie : type === "show" ? show : null;
      if (ref) entries.push({ ref, watchlist: true, watchlistAt: timestamp(item.listed_at) });
      else skipped++;
    } else if (kind === "watched-movies") {
      if (movie) entries.push({ ref: movie, watched: true, watchedAt: timestamp(item.last_watched_at) });
    } else if (kind === "history") {
      if (type === "movie" && movie) {
        entries.push({ ref: movie, watched: true, watchedAt: timestamp(item.watched_at) });
      } else if (type === "episode" && show) {
        const episode = episodeRef(item.episode?.season, item.episode?.number);
        if (episode) entries.push({ ref: show, episodes: [episode] });
        else skipped++;
      }
    } else if (kind === "watched-shows") {
      // Per-episode detail is in this file only in some exports; the history
      // has it in all of them.
      const episodes = (item.seasons ?? []).flatMap((season) =>
        (season.episodes ?? []).flatMap((episode) => episodeRef(season.number, episode.number) ?? []),
      );
      if (show && episodes.length > 0) entries.push({ ref: show, episodes });
    } else {
      const ref = type === "movie" ? movie : type === "show" ? show : null;
      const rating = integer(item.rating);
      if (ref && rating !== undefined && rating >= 1 && rating <= 10) {
        const ratedAt = timestamp(item.rated_at);
        entries.push({ ref, rating, ratedAt, watched: true, watchedAt: ratedAt });
      } else {
        skipped++;
      }
    }
  }
  return { entries, skipped };
}

// ── TV Time ─────────────────────────────────────────────────────────────────

function tvTimeShow(row: CsvRow, idColumns: string[], nameColumns: string[]): TitleRef | null {
  const ref: TitleRef = {
    mediaType: "tv",
    tvdbId: positive(field(row, ...idColumns)),
    imdbId: imdbId(field(row, "series_imdb_id", "imdb_id")),
    title: field(row, ...nameColumns) || undefined,
  };
  return ref.tvdbId || ref.imdbId || ref.title ? ref : null;
}

type TvTimeKind =
  | "new-episodes" | "new-series" | "new-movies"
  | "gdpr-v2" | "gdpr-v1" | "followed" | "seen-episodes" | "show-ratings";

function tvTimeKind(name: string, headers: string[]): TvTimeKind | null {
  // The 2026 "export my data" files, which carry real ids.
  if (hasColumn(headers, "series_tvdb_id")) return "new-episodes";
  if (hasColumn(headers, "tvdb_id") && hasColumn(headers, "status")) return "new-series";
  if (hasColumn(headers, "is_watched") && hasColumn(headers, "year")) return "new-movies";
  // The GDPR archive. Its two tracking files are told apart by one column each.
  if (hasColumn(headers, "type-uuid-n")) return "gdpr-v1";
  if (hasColumn(headers, "key") && hasColumn(headers, "s_id", "ep_id", "series_follow_count")) {
    return "gdpr-v2";
  }
  if (hasColumn(headers, "notification_offset") && hasColumn(headers, "tv_show_id")) return "followed";
  if (hasColumn(headers, "episode_season_number") && hasColumn(headers, "tv_show_name", "show_name")) {
    return "seen-episodes";
  }
  if (basename(name).startsWith("tv_show_rate") && hasColumn(headers, "rating")) return "show-ratings";
  return null;
}

function tvTimeEntries(kind: TvTimeKind, rows: CsvRow[]): { entries: ImportEntry[]; skipped: number } {
  const entries: ImportEntry[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (kind === "new-episodes") {
      if (!isTrue(field(row, "is_watched"))) continue;
      const ref = tvTimeShow(row, ["series_tvdb_id"], ["title"]);
      const episode = isTrue(field(row, "special"))
        ? null
        : episodeRef(field(row, "season"), field(row, "episode"));
      if (ref && episode) entries.push({ ref, episodes: [episode] });
      else skipped++;
    } else if (kind === "new-series") {
      const ref = tvTimeShow(row, ["tvdb_id"], ["title"]);
      if (ref) entries.push({ ref, followed: true, watchlistAt: timestamp(field(row, "created_at")) });
    } else if (kind === "new-movies") {
      const title = field(row, "title");
      const ref: TitleRef = {
        mediaType: "movie",
        imdbId: imdbId(field(row, "imdb_id")),
        title: title || undefined,
        year: year(field(row, "year")),
      };
      if (!ref.imdbId && !ref.title) continue;
      if (isTrue(field(row, "is_watched"))) {
        entries.push({ ref, watched: true, watchedAt: timestamp(field(row, "watched_at")) });
      } else {
        entries.push({ ref, watchlist: true, watchlistAt: timestamp(field(row, "created_at")) });
      }
    } else if (kind === "gdpr-v2") {
      const key = field(row, "key");
      if (/^(re)?watch-episode-/.test(key)) {
        const ref = tvTimeShow(row, ["s_id"], ["series_name"]);
        const episode = episodeRef(
          field(row, "s_no", "season_number"),
          field(row, "ep_no", "episode_number"),
        );
        if (ref && episode) entries.push({ ref, episodes: [episode] });
        else skipped++;
      } else if (key.startsWith("user-series-")) {
        const ref = tvTimeShow(row, ["s_id"], ["series_name"]);
        if (ref && (isTrue(field(row, "is_followed")) || isTrue(field(row, "is_for_later")))) {
          entries.push({ ref, followed: true, watchlistAt: timestamp(field(row, "created_at")) });
        }
      }
    } else if (kind === "gdpr-v1") {
      const entity = field(row, "entity_type");
      const type = field(row, "type");
      if (entity === "movie") {
        const title = field(row, "movie_name");
        if (!title) continue;
        // Movies carry no id anyone else knows – a name and a release date.
        const ref: TitleRef = { mediaType: "movie", title, year: year(field(row, "release_date")) };
        const at = timestamp(field(row, "created_at"));
        if (type === "watch") entries.push({ ref, watched: true, watchedAt: at });
        else if (type === "towatch") entries.push({ ref, watchlist: true, watchlistAt: at });
        else if (type === "follow") entries.push({ ref, followed: true, watchlistAt: at });
      } else if (entity === "episode" && type === "watch") {
        const ref = tvTimeShow(row, ["series_id"], ["series_name"]);
        const episode = episodeRef(field(row, "season_number"), field(row, "episode_number"));
        if (ref && episode) entries.push({ ref, episodes: [episode] });
        else skipped++;
      }
    } else if (kind === "followed") {
      const ref = tvTimeShow(row, ["tv_show_id"], ["tv_show_name"]);
      if (ref) entries.push({ ref, followed: true, watchlistAt: timestamp(field(row, "created_at")) });
    } else if (kind === "seen-episodes") {
      // The oldest file: a show is only a name here.
      const title = field(row, "tv_show_name", "show_name");
      const episode = episodeRef(field(row, "episode_season_number"), field(row, "episode_number"));
      if (title && episode) entries.push({ ref: { mediaType: "tv", title }, episodes: [episode] });
      else skipped++;
    } else {
      const ref = tvTimeShow(row, ["tv_show_id"], ["tv_show_name"]);
      const stars = integer(field(row, "rating"));
      // Out of five there; out of ten here.
      if (ref && stars !== undefined && stars >= 1 && stars <= 5) {
        entries.push({ ref, rating: stars * 2, ratedAt: timestamp(field(row, "created_at")) });
      }
    }
  }
  return { entries, skipped };
}

interface TvTimeJsonTitle {
  id?: { tvdb?: unknown; imdb?: unknown };
  title?: unknown;
  year?: unknown;
  status?: unknown;
  is_watched?: unknown;
  watched_at?: unknown;
  created_at?: unknown;
  seasons?: { number?: unknown; episodes?: { number?: unknown; is_watched?: unknown }[] }[];
}

/** The JSON form of the 2026 export: the same facts, nested per series. */
function tvTimeJsonEntries(name: string, items: TvTimeJsonTitle[]): ImportEntry[] {
  const isMovies = basename(name).startsWith("tvtime-movies");
  const entries: ImportEntry[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const title = typeof item.title === "string" ? item.title : undefined;
    const imdb = imdbId(item.id?.imdb);

    if (isMovies) {
      const ref: TitleRef = { mediaType: "movie", imdbId: imdb, title, year: year(item.year) };
      if (!ref.imdbId && !ref.title) continue;
      entries.push(
        isTrue(item.is_watched)
          ? { ref, watched: true, watchedAt: timestamp(item.watched_at) }
          : { ref, watchlist: true, watchlistAt: timestamp(item.created_at) },
      );
      continue;
    }

    const ref: TitleRef = { mediaType: "tv", tvdbId: positive(item.id?.tvdb), imdbId: imdb, title };
    if (!ref.tvdbId && !ref.imdbId && !ref.title) continue;
    const episodes = (item.seasons ?? []).flatMap((season) =>
      (season.episodes ?? []).flatMap((episode) =>
        isTrue(episode.is_watched) ? (episodeRef(season.number, episode.number) ?? []) : [],
      ),
    );
    entries.push({ ref, followed: true, ...(episodes.length > 0 ? { episodes } : {}) });
  }
  return entries;
}

// ── Merging ─────────────────────────────────────────────────────────────────

function normaliseTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * What makes two rows the same title: the strongest id each has. Rows that
 * name one title two ways – by id in one file, by name in another – stay apart
 * here and meet again once both have been matched to TMDB.
 */
export function entryKey(ref: TitleRef): string {
  if (ref.tmdbId) return `tmdb:${ref.mediaType ?? "?"}:${ref.tmdbId}`;
  if (ref.imdbId) return `imdb:${ref.imdbId}`;
  if (ref.tvdbId) return `tvdb:${ref.mediaType ?? "?"}:${ref.tvdbId}`;
  return `name:${ref.mediaType ?? "?"}:${normaliseTitle(ref.title ?? "")}:${ref.year ?? ""}`;
}

function later(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return a ?? b;
  return a > b ? a : b;
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return a ?? b;
  return a < b ? a : b;
}

/** Fold one entry into another about the same title. */
export function mergeEntry(into: ImportEntry, from: ImportEntry): ImportEntry {
  const merged: ImportEntry = {
    ...into,
    ref: {
      mediaType: into.ref.mediaType ?? from.ref.mediaType,
      tmdbId: into.ref.tmdbId ?? from.ref.tmdbId,
      imdbId: into.ref.imdbId ?? from.ref.imdbId,
      tvdbId: into.ref.tvdbId ?? from.ref.tvdbId,
      title: into.ref.title ?? from.ref.title,
      year: into.ref.year ?? from.ref.year,
    },
  };

  if (from.watchlist || into.watchlist) merged.watchlist = true;
  if (from.followed || into.followed) merged.followed = true;
  // When it went on the list: the first time either file saw it there.
  merged.watchlistAt = earlier(into.watchlistAt, from.watchlistAt);
  if (from.watched || into.watched) merged.watched = true;
  // When it was watched: the most recent viewing.
  merged.watchedAt = later(into.watchedAt, from.watchedAt);

  // The score given last is the one that stands.
  if (from.rating !== undefined && (into.rating === undefined || (from.ratedAt ?? "") > (into.ratedAt ?? ""))) {
    merged.rating = from.rating;
    merged.ratedAt = from.ratedAt;
  }

  if (from.episodes?.length || into.episodes?.length) {
    const seen = new Set<string>();
    merged.episodes = [...(into.episodes ?? []), ...(from.episodes ?? [])].filter((episode) => {
      const key = `${episode.season}:${episode.episode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return merged;
}

/** One entry per title, in the order each title first appeared. */
export function mergeEntries(entries: ImportEntry[]): ImportEntry[] {
  const byKey = new Map<string, ImportEntry>();
  for (const entry of entries) {
    const key = entryKey(entry.ref);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeEntry(existing, entry) : entry);
  }
  return [...byKey.values()];
}

// ── Reading a set of files ──────────────────────────────────────────────────

/**
 * Whether a file inside an archive is one to read. Decided by name, before
 * anything is inflated: an export also holds the account's profile, devices
 * and tokens, and this page should never have those in memory.
 */
export function wantedFromArchive(path: string): boolean {
  const lower = path.toLowerCase();
  const file = basename(path);

  // Letterboxd: the four lists at the top level. Its `deleted/` and `orphaned/`
  // folders repeat the same names for entries the member removed.
  if (/(^|\/)(deleted|orphaned|likes|lists)\//.test(lower)) return false;
  if (["watchlist.csv", "watched.csv", "ratings.csv", "diary.csv"].includes(file)) return true;

  if (file.endsWith(".json")) {
    const kind = traktKind(file);
    if (kind !== null && kind !== "ignored") return true;
    return /^tvtime-(series|movies)\.json$/.test(file);
  }

  return (
    /^tracking-prod-records(-v2)?\.csv$/.test(file) ||
    /^tvtime-(series-episodes|series|movies)\.csv$/.test(file) ||
    ["followed_tv_show.csv", "seen_episode.csv", "tv_show_rate.csv"].includes(file)
  );
}

function parseJsonArray(text: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Read every file given and fold what they say into one entry per title.
 *
 * A file that cannot be read as anything is named in `unrecognised` rather
 * than failing the rest: an export is forty files, and one odd one should not
 * cost the visitor the other thirty-nine.
 */
export async function parseExport(files: ImportFile[]): Promise<ParsedExport> {
  const all: ImportEntry[] = [];
  const read: ParsedExport["files"] = [];
  const unrecognised: string[] = [];
  const sources: ImportSource[] = [];
  let skippedRows = 0;

  // TV Time's oldest episode file lists a fraction of what the tracking file
  // does and names shows only by title; it is read only where it is all there is.
  const hasTracking = files.some((file) => basename(file.name).startsWith("tracking-prod-records-v2"));

  const add = (name: string, source: ImportSource, entries: ImportEntry[], skipped = 0) => {
    all.push(...entries);
    skippedRows += skipped;
    read.push({ name, source, rows: entries.length });
    if (!sources.includes(source)) sources.push(source);
  };

  for (const file of files) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      unrecognised.push(file.name);
      continue;
    }

    if (basename(file.name).endsWith(".json") || /^\s*[[{]/.test(text.slice(0, 64))) {
      const items = parseJsonArray(text);
      const trakt = traktKind(file.name);
      if (!items) {
        if (trakt !== "ignored") unrecognised.push(file.name);
      } else if (/^tvtime-(series|movies)/.test(basename(file.name))) {
        add(file.name, "tvtime", tvTimeJsonEntries(file.name, items as TvTimeJsonTitle[]));
      } else if (trakt && trakt !== "ignored") {
        const { entries, skipped } = traktEntries(trakt, items as TraktItem[]);
        add(file.name, "trakt", entries, skipped);
      } else if (trakt !== "ignored") {
        unrecognised.push(file.name);
      }
      continue;
    }

    const { headers, rows } = parseCsv(text);

    if (hasColumn(headers, "Letterboxd URI")) {
      const entries = letterboxdEntries(file.name, rows, headers);
      if (entries) add(file.name, "letterboxd", entries);
      else unrecognised.push(file.name);
      continue;
    }

    if (hasColumn(headers, "Const") && hasColumn(headers, "Title Type")) {
      const { entries, skipped } = imdbEntries(rows, headers);
      add(file.name, "imdb", entries, skipped);
      continue;
    }

    const tvTime = tvTimeKind(file.name, headers);
    if (tvTime === "seen-episodes" && hasTracking) continue;
    if (tvTime) {
      const { entries, skipped } = tvTimeEntries(tvTime, rows);
      add(file.name, "tvtime", entries, skipped);
      continue;
    }

    unrecognised.push(file.name);
  }

  return {
    sources,
    entries: mergeEntries(all),
    files: read,
    unrecognised,
    skippedRows,
  };
}
