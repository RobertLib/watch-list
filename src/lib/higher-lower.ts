"use client";

import { getProfileStorageOwner, readProfileStore, writeProfileStore } from "./profile-storage";

/**
 * The player's side of "higher or lower": the best run they have managed.
 *
 * A run is over the moment it is wrong, so the only thing worth keeping between
 * sessions is the number to beat. That is also the whole reason to come back –
 * unlike the daily puzzle, this one is always available, and what makes it stick
 * is having a record standing.
 */

export const HIGHER_LOWER_STORAGE_KEY = "higher-lower";

export interface HigherLowerRecord {
  best: number;
  /** Rounds answered across every run, so a first-time player sees it move. */
  totalRounds: number;
}

export const EMPTY_RECORD: HigherLowerRecord = { best: 0, totalRounds: 0 };

function sanitizeCount(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

export function sanitizeRecord(input: unknown): HigherLowerRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return EMPTY_RECORD;
  }

  const record = input as Record<string, unknown>;

  return {
    best: sanitizeCount(record.best),
    totalRounds: sanitizeCount(record.totalRounds),
  };
}

export function getRecord(options: { strict?: boolean } = {}): HigherLowerRecord {
  if (typeof window === "undefined") return EMPTY_RECORD;

  try {
    const stored = readProfileStore(HIGHER_LOWER_STORAGE_KEY, getProfileStorageOwner(), options.strict);
    if (stored === null) return EMPTY_RECORD;

    return sanitizeRecord(JSON.parse(stored));
  } catch (error) {
    if (options.strict) throw error;
    console.error("Error parsing the higher-or-lower record:", error);
    return EMPTY_RECORD;
  }
}

/** False when the browser refused the write – out of quota, or storing nothing. */
export function saveRecord(record: HigherLowerRecord): boolean {
  if (typeof window === "undefined") return false;

  try {
    writeProfileStore(
      HIGHER_LOWER_STORAGE_KEY,
      JSON.stringify(record),
    );
    return true;
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving the higher-or-lower record:", error);
    return false;
  }
}

/** Fold a finished round into the record. Returns a new object. */
export function recordRound(
  record: HigherLowerRecord,
  streak: number,
): HigherLowerRecord {
  return {
    best: Math.max(record.best, streak),
    totalRounds: record.totalRounds + 1,
  };
}

/**
 * A finished run, as text to post. The number and nothing else: the films that
 * made up the run are different for every player, so there is no board to show
 * and nothing to spoil.
 */
export function buildHigherLowerShareText(
  streak: number,
  beatBest: boolean,
  url: string,
): string {
  const run = `${streak} in a row${beatBest ? " – a new best" : ""}`;
  return `🎬 WatchList Higher or Lower\n🔥 ${run}\n${url}`;
}
