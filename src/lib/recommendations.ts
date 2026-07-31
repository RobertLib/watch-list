import { tmdbApi } from "./tmdb";
import { tmdbServerApi } from "./tmdb-server";
import {
  getCachedMovieWatchProviders,
  getCachedTVWatchProviders,
} from "./tmdb-cache";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "./media-converters";
import { getRegion } from "./region-server";
import { getRegionCode } from "./region";
import {
  getWatchProviderFilter,
  getSelectedProviderIds,
} from "./watch-provider-server";
import type { MediaItem, MediaType, Movie, TVShow } from "@/types/tmdb";

/** A watchlist entry reduced to what the recommender needs. */
export interface RecommendationSeed {
  id: number;
  mediaType: MediaType;
  title: string;
}

export interface RecommendationsResult {
  items: MediaItem[];
  /** Titles the picks were actually derived from, for the "Based on ..." line */
  basedOn: string[];
}

const EMPTY_RESULT: RecommendationsResult = { items: [], basedOn: [] };

// Only the most recent entries drive the query – further seeds cost another
// TMDB round trip while barely moving the ranking.
const MAX_SEEDS = 6;
// Upper bound on the payload a client may send; the rest of the watchlist is
// still needed so saved titles can be excluded from the results.
const MAX_WATCHLIST_ITEMS = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_RESULTS = 20;
// Recommendations of niche titles are often near-empty database entries; a vote
// floor keeps them out. Dropped when it would leave too little to show.
const MIN_VOTE_COUNT = 50;
const MIN_RESULTS_BEFORE_RELAXING = 8;
// Availability has to be checked one title at a time, so cap the shortlist.
const MAX_PROVIDER_CHECKS = 30;
// Below this the carousel looks broken, so it gets topped up by genre.
const MIN_RESULTS_BEFORE_TOPPING_UP = 10;
// Two genres combined ("sci-fi thriller") still describe a taste; a single one
// degenerates into whatever is popular in it right now.
const MAX_TOP_UP_GENRES = 2;

/**
 * Server actions are reachable directly, so the watchlist payload is never
 * trusted: only well-formed, de-duplicated entries survive.
 */
export function sanitizeSeeds(input: unknown): RecommendationSeed[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const seeds: RecommendationSeed[] = [];

  for (const entry of input.slice(0, MAX_WATCHLIST_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;

    const { id, mediaType, title } = entry as Record<string, unknown>;
    if (!Number.isInteger(id) || (id as number) <= 0) continue;
    if (mediaType !== "movie" && mediaType !== "tv") continue;

    const key = itemKey(id as number, mediaType);
    if (seen.has(key)) continue;
    seen.add(key);

    seeds.push({
      id: id as number,
      mediaType,
      title: typeof title === "string" ? title.slice(0, MAX_TITLE_LENGTH) : "",
    });
  }

  return seeds;
}

/**
 * Build a "Recommended for You" list from the user's watchlist.
 *
 * `watchlist` is expected newest-first: the most recently saved titles say the
 * most about what someone wants to watch right now.
 */
export async function getRecommendationsFromWatchlist(
  watchlist: RecommendationSeed[],
): Promise<RecommendationsResult> {
  if (watchlist.length === 0) return EMPTY_RESULT;

  const seeds = watchlist.slice(0, MAX_SEEDS);
  // Everything already saved is excluded, not just the titles used as seeds.
  const alreadySaved = new Set(
    watchlist.map((entry) => itemKey(entry.id, entry.mediaType)),
  );

  const responses = await Promise.allSettled(
    seeds.map((seed) =>
      seed.mediaType === "movie"
        ? tmdbApi.getMovieRecommendations(seed.id)
        : tmdbApi.getTVShowRecommendations(seed.id),
    ),
  );

  const candidates = new Map<string, Candidate>();
  const basedOn: string[] = [];

  responses.forEach((response, seedIndex) => {
    if (response.status !== "fulfilled") return;

    // A TMDB error payload has no `results`, and unknown titles return none.
    const results = Array.isArray(response.value?.results)
      ? response.value.results
      : [];
    if (results.length === 0) return;

    const seed = seeds[seedIndex];
    if (seed.title) basedOn.push(seed.title);

    results.forEach((result, rank) => {
      if (result.adult) return;
      if (!result.poster_path) return;

      const key = itemKey(result.id, seed.mediaType);
      if (alreadySaved.has(key)) return;

      const contribution =
        seedWeight(seedIndex) * rankWeight(rank, results.length);
      const existing = candidates.get(key);

      if (existing) {
        existing.score += contribution;
        existing.seedCount += 1;
        return;
      }

      candidates.set(key, {
        item:
          seed.mediaType === "movie"
            ? convertMovieToMediaItem(result as Movie)
            : convertTVShowToMediaItem(result as TVShow),
        score: contribution,
        seedCount: 1,
      });
    });
  });

  if (candidates.size === 0) return EMPTY_RESULT;

  const ranked = [...candidates.values()].sort(
    (a, b) => finalScore(b) - finalScore(a),
  );

  const wellKnown = ranked.filter(
    (candidate) => candidate.item.vote_count >= MIN_VOTE_COUNT,
  );
  const pool =
    wellKnown.length >= MIN_RESULTS_BEFORE_RELAXING ? wellKnown : ranked;

  const shortlist = pool
    .slice(0, MAX_PROVIDER_CHECKS)
    .map((candidate) => candidate.item);
  const streamable = await keepOnlyStreamable(shortlist);

  const items =
    streamable.length >= MIN_RESULTS_BEFORE_TOPPING_UP
      ? streamable
      : await topUpWithGenreMatches(streamable, ranked, alreadySaved);

  return { items: items.slice(0, MAX_RESULTS), basedOn };
}

interface Candidate {
  item: MediaItem;
  score: number;
  seedCount: number;
}

function itemKey(id: number, mediaType: MediaType): string {
  return `${mediaType}-${id}`;
}

// Later seeds count for less: the watchlist arrives newest-first and a title
// saved yesterday describes the current mood better than one saved a year ago.
function seedWeight(index: number): number {
  return 1 - index * 0.1;
}

// TMDB returns recommendations best-match-first, so respect that ordering.
function rankWeight(rank: number, total: number): number {
  return (total - rank) / total;
}

function finalScore(candidate: Candidate): number {
  // A title recommended by several saved entries is a much stronger signal than
  // one top-ranked match, and the rating only breaks ties between them.
  const agreement = 1 + 0.25 * (candidate.seedCount - 1);
  const quality = 0.7 + 0.3 * (candidate.item.vote_average / 10);
  return candidate.score * agreement * quality;
}

/**
 * Honour the "Streaming only" profile setting. The recommendations endpoint
 * takes no provider parameters, so availability is verified per title through
 * the same cached endpoint the cards use – hence the capped shortlist.
 */
async function keepOnlyStreamable(items: MediaItem[]): Promise<MediaItem[]> {
  const [filter, providerIds] = await Promise.all([
    getWatchProviderFilter(),
    getSelectedProviderIds(),
  ]);

  // Matches the rest of the app: with no platforms picked there is nothing to
  // filter by, so everything is shown.
  if (filter !== "streaming-only" || providerIds.length === 0) return items;

  const regionCode = getRegionCode(await getRegion());
  const selected = new Set(providerIds);

  const availability = await Promise.allSettled(
    items.map((item) =>
      item.media_type === "movie"
        ? getCachedMovieWatchProviders(item.id, regionCode)
        : getCachedTVWatchProviders(item.id, regionCode),
    ),
  );

  return items.filter((_, index) => {
    const result = availability[index];
    if (result.status !== "fulfilled") return false;

    const flatrate = result.value.results?.[regionCode]?.flatrate ?? [];
    return flatrate.some((provider) => selected.has(provider.provider_id));
  });
}

/**
 * A short watchlist yields few recommendations, and the streaming filter can
 * cut those down to a handful more. Both cases are topped up with the genres
 * the recommendations keep pointing at, through the same discover path the rest
 * of the app uses – so region and platform settings still apply.
 */
async function topUpWithGenreMatches(
  items: MediaItem[],
  candidates: Candidate[],
  alreadySaved: Set<string>,
): Promise<MediaItem[]> {
  // Movies and TV shows have separate genre vocabularies, so each media type
  // needs its own profile and its own query.
  const movieGenres = topGenres(candidates, "movie");
  const tvGenres = topGenres(candidates, "tv");
  if (movieGenres.length === 0 && tvGenres.length === 0) return items;

  const today = new Date().toISOString().split("T")[0];

  const [movies, shows] = await Promise.all([
    movieGenres.length > 0
      ? tmdbServerApi
          .discoverMovies(1, {
            // Comma is AND for TMDB: both genres have to match, which keeps the
            // fill close to the taste instead of drifting to general hits.
            genre: movieGenres.join(","),
            sortBy: "popularity.desc",
            voteCountGte: MIN_VOTE_COUNT,
            primaryReleaseDateLte: today,
          })
          .catch(() => null)
      : null,
    tvGenres.length > 0
      ? tmdbServerApi
          .discoverTVShows(1, {
            genre: tvGenres.join(","),
            sortBy: "popularity.desc",
            voteCountGte: MIN_VOTE_COUNT,
            firstAirDateLte: today,
          })
          .catch(() => null)
      : null,
  ]);

  const movieItems = (movies?.results ?? []).map(convertMovieToMediaItem);
  const tvItems = (shows?.results ?? []).map(convertTVShowToMediaItem);

  const seen = new Set([
    ...alreadySaved,
    ...items.map((item) => itemKey(item.id, item.media_type)),
  ]);
  const toppedUp = [...items];

  // Interleaved so a watchlist spanning both keeps both in the carousel.
  for (
    let index = 0;
    index < Math.max(movieItems.length, tvItems.length);
    index++
  ) {
    for (const item of [movieItems[index], tvItems[index]]) {
      if (!item || !item.poster_path) continue;

      const key = itemKey(item.id, item.media_type);
      if (seen.has(key)) continue;

      seen.add(key);
      toppedUp.push(item);
    }
  }

  return toppedUp;
}

/** The genres the recommendations lean on, strongest first. */
function topGenres(candidates: Candidate[], mediaType: MediaType): string[] {
  const weights = new Map<number, number>();

  for (const candidate of candidates) {
    if (candidate.item.media_type !== mediaType) continue;

    for (const genreId of candidate.item.genre_ids ?? []) {
      weights.set(genreId, (weights.get(genreId) ?? 0) + finalScore(candidate));
    }
  }

  return [...weights.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_TOP_UP_GENRES)
    .map(([genreId]) => String(genreId));
}
