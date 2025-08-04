"use client";

/**
 * A target for the year, and how far along it is.
 *
 * "52 films this year" turns watching into something with a shape – a number
 * that is behind or ahead, and either way is a reason to check. It is the one
 * piece of state here the visitor sets deliberately rather than accumulating,
 * which is also why it is opt-in and easy to clear.
 */

export const GOAL_STORAGE_KEY = "yearly-goal";

export const MIN_GOAL = 1;
export const MAX_GOAL = 1000;

export interface YearlyGoal {
  /** Calendar year the target belongs to, as `YYYY`. */
  year: string;
  target: number;
}

export function sanitizeGoal(input: unknown): YearlyGoal | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const { year, target } = input as Record<string, unknown>;
  const parsedTarget = Number(target);

  if (typeof year !== "string" || !/^\d{4}$/.test(year)) return null;
  if (!Number.isInteger(parsedTarget)) return null;
  if (parsedTarget < MIN_GOAL || parsedTarget > MAX_GOAL) return null;

  return { year, target: parsedTarget };
}

export function getGoal(): YearlyGoal | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(GOAL_STORAGE_KEY);
    if (!stored) return null;

    return sanitizeGoal(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing the yearly goal:", error);
    return null;
  }
}

export function saveGoal(goal: YearlyGoal | null): void {
  if (typeof window === "undefined") return;

  try {
    if (goal === null) window.localStorage.removeItem(GOAL_STORAGE_KEY);
    else window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving the yearly goal:", error);
  }
}

export interface GoalProgress {
  target: number;
  watched: number;
  /** 0–1, clamped: passing the target is a success, not a bar over 100%. */
  fraction: number;
  remaining: number;
  /**
   * How many should be done by now to be on track, for the line that says
   * whether someone is ahead or behind. Null outside the goal's own year.
   */
  expectedByNow: number | null;
}

/**
 * Where the year stands.
 *
 * `dayOfYear` and `daysInYear` are passed in rather than read from the clock so
 * this stays pure – and so a test can sit on the 200th of a leap year.
 */
export function goalProgress(
  goal: YearlyGoal,
  watchedThisYear: number,
  { dayOfYear, daysInYear }: { dayOfYear: number | null; daysInYear: number },
): GoalProgress {
  const fraction =
    goal.target > 0 ? Math.min(1, watchedThisYear / goal.target) : 1;

  return {
    target: goal.target,
    watched: watchedThisYear,
    fraction,
    remaining: Math.max(0, goal.target - watchedThisYear),
    expectedByNow:
      dayOfYear === null
        ? null
        : Math.round((goal.target * dayOfYear) / daysInYear),
  };
}

/** 1 on 1 January. Split out because the arithmetic is easy to get wrong. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );

  return Math.floor((today - start) / 86_400_000) + 1;
}

export function daysInYear(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}
