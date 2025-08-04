// Draws its pairs from the pool in `daily-puzzle-pool.ts`, and so ships it to
// the browser: there is no server build to keep the 398 films out of the bundle
// any more, and this runs in the page like everything else. See the header of
// `daily-puzzle.ts` for what the split between schedule and catalogue still
// buys, and that of `daily-puzzle-data.ts` for what the game keeps once the
// pool is readable in devtools.

import { getCachedMovieDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import { PUZZLE_POOL } from "./daily-puzzle-pool";

/**
 * "Higher or lower": which of these two films did TMDB's voters score better?
 *
 * The daily puzzle is over in two minutes and then there is nothing to do until
 * tomorrow. This is the other half of that – no schedule, no limit, one more
 * round always available – and it costs nothing to run because it draws on the
 * pool the puzzle already ships with.
 *
 * The UI reveals the challenger's score only after the guess. The catalogue and
 * these reads run in the browser, so the game relies on the player's honour.
 */

export interface DuelFilm {
  id: number;
  title: string;
  slug: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface RatedFilm extends DuelFilm {
  rating: number;
}

export interface RatingDuel {
  /** Absent once a run is under way: the previous challenger becomes the champion. */
  champion: RatedFilm | null;
  challenger: DuelFilm;
}

export interface RatingDuelResult {
  correct: boolean;
  /** The score that was being withheld, revealed now that the guess is in. */
  challengerRating: number;
}

export type DuelGuess = "higher" | "lower";

// The client says which films it has already shown so a run does not repeat one.
// Bounded because it arrives over a public endpoint and is only ever a filter.
const MAX_SEEN_IDS = 400;
// A film nobody has scored cannot be ranked, and TMDB reports those as 0.
const MIN_RATING = 0.5;
// The pool is curated, but a title can lose its votes upstream; a handful of
// attempts is enough to route around that without turning into a crawl.
const MAX_ATTEMPTS = 6;

export function sanitizeSeenIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];

  const ids: number[] = [];
  for (const value of input) {
    if (Number.isInteger(value) && (value as number) > 0) {
      ids.push(value as number);
    }
    if (ids.length >= MAX_SEEN_IDS) break;
  }

  return ids;
}

function toDuelFilm(
  id: number,
  details: Awaited<ReturnType<typeof getCachedMovieDetails>>,
): DuelFilm {
  const title = details.title || `Film ${id}`;

  return {
    id,
    title,
    slug: createSlug(title, id),
    year: details.release_date?.slice(0, 4) || null,
    posterPath: details.poster_path ?? null,
    backdropPath: details.backdrop_path ?? null,
  };
}

/**
 * A pool entry that is not in `exclude`, or null once the pool is used up.
 *
 * Random rather than a walk through the pool: unlike the daily puzzle, two people
 * playing this have no reason to see the same films, and a fixed order would make
 * a long run predictable.
 */
function randomPoolId(exclude: Set<number>): number | null {
  const candidates = PUZZLE_POOL.filter((entry) => !exclude.has(entry.id));
  if (candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

async function loadRated(id: number): Promise<RatedFilm | null> {
  const details = await getCachedMovieDetails(id);
  const rating = Number(details.vote_average);

  if (!Number.isFinite(rating) || rating < MIN_RATING) return null;

  return { ...toDuelFilm(id, details), rating };
}

/** Pick a film from the pool that clears the rating floor. */
async function pickPlayable(exclude: Set<number>): Promise<RatedFilm | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = randomPoolId(exclude);
    if (id === null) return null;

    exclude.add(id);

    try {
      const film = await loadRated(id);
      if (film) return film;
    } catch (error) {
      // A removed film can be replaced. Other failures already exhausted the
      // transport's retries or Retry-After budget; a different id must not
      // restart that budget during an outage or an API-wide rate limit.
      if (!(error instanceof Error && /^TMDB API error: 404\b/.test(error.message))) {
        throw error;
      }
    }
  }

  return null;
}

/**
 * The next round.
 *
 * `withChampion` is false for every round after the first: the film the player
 * just saw carries over, and fetching it again would cost a round trip to learn
 * what the browser already holds.
 */
export async function pickRatingDuel(
  seenIds: number[],
  withChampion: boolean,
): Promise<RatingDuel | null> {
  const exclude = new Set(seenIds);

  const champion = withChampion ? await pickPlayable(exclude) : null;
  if (withChampion && !champion) return null;

  const challenger = await pickPlayable(exclude);
  if (!challenger) return null;

  return {
    champion,
    // The score is stripped rather than simply not read: `RatedFilm` is
    // structurally a `DuelFilm`, so returning it whole would send the answer.
    challenger: {
      id: challenger.id,
      title: challenger.title,
      slug: challenger.slug,
      year: challenger.year,
      posterPath: challenger.posterPath,
      backdropPath: challenger.backdropPath,
    },
  };
}

/**
 * Settle a round.
 *
 * The champion's displayed score belongs to this round. Re-reading it after
 * cache expiry or eviction could judge a guess against a changed score the
 * player never saw. Only the challenger needs a catalogue read to reveal its
 * score; this browser-only game already relies on the player's honour.
 *
 * A tie counts as correct. The alternative is punishing someone for a distinction
 * of a hundredth of a point that the interface rounds away anyway.
 */
export async function settleRatingDuel(
  championRating: unknown,
  challengerId: unknown,
  guess: unknown,
): Promise<RatingDuelResult | null> {
  if (
    typeof championRating !== "number" ||
    !Number.isFinite(championRating) ||
    championRating < MIN_RATING || championRating > 10
  ) return null;
  if (!Number.isInteger(challengerId) || (challengerId as number) <= 0) {
    return null;
  }
  if (guess !== "higher" && guess !== "lower") return null;

  const challenger = await loadRated(challengerId as number);

  if (!challenger) return null;

  // Compare the same precision the cards display. Distinct TMDB averages that
  // both read as 8.4 are a tie to the player, so either answer should win.
  const championScore = Number(championRating.toFixed(1));
  const challengerScore = Number(challenger.rating.toFixed(1));
  const correct =
    guess === "higher"
      ? challengerScore >= championScore
      : challengerScore <= championScore;

  return { correct, challengerRating: challenger.rating };
}
