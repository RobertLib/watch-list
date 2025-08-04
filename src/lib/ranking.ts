"use client";

import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";

/**
 * A personal ranking of the watchlist, built one pair at a time.
 *
 * Asking someone to rate eighty films out of ten produces eighty sevens. Asking
 * which of *these two* they would rather watch produces an answer every time, and
 * enough of those answers is an order. It is also the rare thing on a watchlist
 * that is never finished – there is always another pair – which is exactly what
 * brings someone back to it.
 *
 * Elo rather than a sort: the comparisons are inconsistent (A beats B, B beats C,
 * C beats A) and a comparison sort would either loop or produce nonsense. Elo
 * absorbs that and converges on an order anyway.
 */

export const RANKING_STORAGE_KEY = "ranking";

/** Where everything starts, and the midpoint the numbers are read against. */
export const BASE_RATING = 1500;

// How far one result can move a rating. High for a game with few rounds: this is
// not chess, and someone who plays twenty pairs should see an order emerge from
// them rather than a list still hovering around 1500.
const K_FACTOR = 32;

/**
 * The range a rating may occupy.
 *
 * Elo itself has no bound, but a stored number has to have one: a hand-edited
 * record should not be able to park a title at infinity and pin it to the top
 * forever. Applied on the way in *and* to every result below, because clamping
 * only on read meant a long session could run past a ceiling the next reload
 * would silently pull it back to – the order on screen and the order stored
 * were then two different orders.
 */
const MIN_RATING = 0;
const MAX_RATING = 4000;

function clampRating(rating: number): number {
  return Math.max(MIN_RATING, Math.min(rating, MAX_RATING));
}

export interface RankingEntry {
  rating: number;
  /** Rounds this title has been in, so the picker can even them out. */
  matches: number;
}

/** Keyed by `${mediaType}-${id}`. */
export type Ranking = Record<string, RankingEntry>;

const EMPTY: Ranking = {};

export function sanitizeRanking(input: unknown): Ranking {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const result: Ranking = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // The key carries the media type as well as the id: TMDB numbers films and
    // shows separately, so an id alone is ambiguous.
    if (!/^(movie|tv)-\d+$/.test(key)) continue;
    if (!value || typeof value !== "object") continue;

    const { rating, matches } = value as Record<string, unknown>;
    const parsedRating = Number(rating);
    const parsedMatches = Number(matches);

    if (!Number.isFinite(parsedRating)) continue;

    result[key] = {
      rating: clampRating(parsedRating),
      matches:
        Number.isInteger(parsedMatches) && parsedMatches >= 0
          ? parsedMatches
          : 0,
    };
  }

  return result;
}

export function getRanking(): Ranking {
  if (typeof window === "undefined") return EMPTY;

  try {
    const stored = window.localStorage.getItem(RANKING_STORAGE_KEY);
    if (!stored) return EMPTY;

    return sanitizeRanking(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing the ranking from storage:", error);
    return EMPTY;
  }
}

/** False when the browser refused the write – out of quota, or storing nothing. */
export function saveRanking(ranking: Ranking): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(ranking));
    return true;
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving the ranking to storage:", error);
    return false;
  }
}

export function entryFor(ranking: Ranking, key: string): RankingEntry {
  return ranking[key] ?? { rating: BASE_RATING, matches: 0 };
}

/** The standard Elo expectation: how likely `a` was to win, from the ratings. */
function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * Record one choice. Returns a new map – the caller's copy is React state.
 *
 * Beating a title rated far above you moves both a long way; beating one far
 * below barely registers. That is the property that makes twenty rounds enough
 * to sort a list that would otherwise need hundreds.
 */
export function recordChoice(
  ranking: Ranking,
  winnerKey: string,
  loserKey: string,
): Ranking {
  if (winnerKey === loserKey) return ranking;

  const winner = entryFor(ranking, winnerKey);
  const loser = entryFor(ranking, loserKey);

  const expected = expectedScore(winner.rating, loser.rating);

  return {
    ...ranking,
    [winnerKey]: {
      rating: clampRating(winner.rating + K_FACTOR * (1 - expected)),
      matches: winner.matches + 1,
    },
    [loserKey]: {
      // The loser's expectation is the complement, so one subtraction covers it.
      rating: clampRating(loser.rating - K_FACTOR * (1 - expected)),
      matches: loser.matches + 1,
    },
  };
}

/**
 * Choose the next pair.
 *
 * Least-compared first, then closest in rating. Both halves matter: picking at
 * random leaves half the list untouched after twenty rounds, and pairing titles
 * that are already far apart asks a question whose answer is already known and
 * teaches the ranking nothing.
 */
export function nextPair<T extends { id: number; mediaType: MediaType }>(
  items: T[],
  ranking: Ranking,
  random: () => number = Math.random,
): [T, T] | null {
  if (items.length < 2) return null;

  const withEntries = items.map((item) => ({
    item,
    entry: entryFor(ranking, mediaItemKey(item.id, item.mediaType)),
  }));

  const fewest = Math.min(...withEntries.map((entry) => entry.entry.matches));
  const leastSeen = withEntries.filter(
    (entry) => entry.entry.matches === fewest,
  );

  const first = leastSeen[Math.floor(random() * leastSeen.length)];

  // Everything else, nearest in rating first. A little randomness among the
  // closest few keeps the same pair from coming up every time the page opens.
  const others = withEntries
    .filter((entry) => entry.item !== first.item)
    .sort(
      (a, b) =>
        Math.abs(a.entry.rating - first.entry.rating) -
        Math.abs(b.entry.rating - first.entry.rating),
    );

  if (others.length === 0) return null;

  const shortlist = others.slice(0, Math.min(5, others.length));
  const second = shortlist[Math.floor(random() * shortlist.length)];

  return [first.item, second.item];
}

/** The list in order, highest first. Titles never compared sit at the base. */
export function rankedItems<T extends { id: number; mediaType: MediaType }>(
  items: T[],
  ranking: Ranking,
): Array<{ item: T; entry: RankingEntry }> {
  return items
    .map((item) => ({
      item,
      entry: entryFor(ranking, mediaItemKey(item.id, item.mediaType)),
    }))
    .sort((a, b) => b.entry.rating - a.entry.rating);
}

/** How many rounds have been played, from the record itself. */
export function totalRounds(ranking: Ranking): number {
  const matches = Object.values(ranking).reduce(
    (total, entry) => total + entry.matches,
    0,
  );

  // Every round adds a match to two titles.
  return Math.round(matches / 2);
}

/**
 * The record narrowed to the titles currently on the list.
 *
 * Nothing prunes the stored ranking when a title leaves the watchlist, and that
 * is deliberate – putting one back should not cost it the rating it earned. But
 * it means the raw record describes a list that no longer exists, and measuring
 * progress against it read straight through: rank twenty titles, clear them,
 * save five new ones, and the bar opened at 100% with "every title has been
 * compared enough" under it, for five titles never once compared.
 *
 * Non-destructive on purpose. This is a view for measuring, not a rewrite.
 */
export function rankingFor<T extends { id: number; mediaType: MediaType }>(
  ranking: Ranking,
  items: T[],
): Ranking {
  const live: Ranking = {};

  for (const item of items) {
    const key = mediaItemKey(item.id, item.mediaType);
    const entry = ranking[key];
    if (entry) live[key] = entry;
  }

  return live;
}

/**
 * How settled the order is, as a fraction.
 *
 * Reported rather than a spinner because "keep going" needs a sense of how far
 * along it is. Each title wants a handful of comparisons before its position
 * means anything; that is the bar being measured against.
 *
 * Takes the items rather than a count of them, because the count alone cannot
 * say which rounds belong to the list being measured – see `rankingFor`.
 */
export const COMPARISONS_PER_TITLE = 4;

export function progressFor<T extends { id: number; mediaType: MediaType }>(
  items: T[],
  ranking: Ranking,
): number {
  if (items.length < 2) return 1;

  return Math.min(
    1,
    totalRounds(rankingFor(ranking, items)) / roundsNeeded(items.length),
  );
}

/** How many rounds a list of this size needs before its order means anything. */
function roundsNeeded(itemCount: number): number {
  return Math.max(1, Math.ceil((itemCount * COMPARISONS_PER_TITLE) / 2));
}

/** How many are left, so the page can say a number instead of a percentage. */
export function roundsRemaining<T extends { id: number; mediaType: MediaType }>(
  items: T[],
  ranking: Ranking,
): number {
  return Math.max(
    0,
    roundsNeeded(items.length) - totalRounds(rankingFor(ranking, items)),
  );
}

/**
 * Where a title sits in the order, counting from 1.
 *
 * Used to tell someone what their last choice actually did – without it, picking
 * a poster looks like it goes nowhere, which is the difference between a tool
 * and a pointless clicking exercise.
 */
export function positionOf<T extends { id: number; mediaType: MediaType }>(
  items: T[],
  ranking: Ranking,
  key: string,
): number | null {
  const index = rankedItems(items, ranking).findIndex(
    (entry) => mediaItemKey(entry.item.id, entry.item.mediaType) === key,
  );

  return index === -1 ? null : index + 1;
}
