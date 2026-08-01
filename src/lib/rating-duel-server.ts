// Holds the pool, like every other module that does – importing it from a Client
// Component is a build error rather than a bundle that ships all 398 films.
import "server-only";

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
 * The challenger's score is withheld until the guess is in. It is the answer, and
 * an answer that rides along in the same response is one anyone can read out of
 * the network tab.
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
      console.error(`Error loading duel film ${id}:`, error);
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
 * Both scores are re-read here rather than taken from the payload. The champion's
 * was handed to the client a moment ago, so trusting it back would only let a
 * player cheat themselves – but re-reading it is a cached lookup, and it means
 * the comparison is made from one source rather than two.
 *
 * A tie counts as correct. The alternative is punishing someone for a distinction
 * of a hundredth of a point that the interface rounds away anyway.
 */
export async function settleRatingDuel(
  championId: unknown,
  challengerId: unknown,
  guess: unknown,
): Promise<RatingDuelResult | null> {
  if (!Number.isInteger(championId) || (championId as number) <= 0) return null;
  if (!Number.isInteger(challengerId) || (challengerId as number) <= 0) {
    return null;
  }
  if (guess !== "higher" && guess !== "lower") return null;

  const [champion, challenger] = await Promise.all([
    loadRated(championId as number),
    loadRated(challengerId as number),
  ]);

  if (!champion || !challenger) return null;

  const correct =
    guess === "higher"
      ? challenger.rating >= champion.rating
      : challenger.rating <= champion.rating;

  return { correct, challengerRating: challenger.rating };
}
