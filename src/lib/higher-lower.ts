"use client";

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

export function getRecord(): HigherLowerRecord {
  if (typeof window === "undefined") return EMPTY_RECORD;

  try {
    const stored = window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY);
    if (!stored) return EMPTY_RECORD;

    return sanitizeRecord(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing the higher-or-lower record:", error);
    return EMPTY_RECORD;
  }
}

export function saveRecord(record: HigherLowerRecord): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      HIGHER_LOWER_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving the higher-or-lower record:", error);
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
