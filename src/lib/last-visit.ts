"use client";

import { withProfileRosterLock } from "./profile-roster-lock";

/**
 * When this browser was last here.
 *
 * One timestamp, and it buys the most valuable line on the home page: "two of
 * your shows aired since you were last here". Without it every return visit
 * opens on the same page as the last one, and there is nothing to notice.
 *
 * Recorded once per session rather than on every navigation – the useful reading
 * is "the previous visit", not "thirty seconds ago".
 */

export const LAST_VISIT_STORAGE_KEY = "last-visit";
export const SESSION_MARKER_KEY = "visit-recorded";
/**
 * Where the stamp this session replaced is kept, for the second and every later
 * call. Empty when there was none – a first visit stays a first visit for the
 * whole session, not just for its first page.
 */
export const PREVIOUS_VISIT_SESSION_KEY = "visit-previous";
export const VISIT_STARTED_SESSION_KEY = "visit-started";

export interface Visit {
  previous: string | null;
  startedAt: string;
}

/** Below this, "since your last visit" means nothing anyone cares about. */
const MIN_GAP_HOURS = 6;

function getLastVisit(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(LAST_VISIT_STORAGE_KEY);
    if (!stored || Number.isNaN(Date.parse(stored))) return null;

    return stored;
  } catch {
    return null;
  }
}

/**
 * Capture this session's interval without acknowledging unseen releases.
 * Completion is separate so a failed lookup can be retried on the next visit.
 */
export function beginVisit(now: Date = new Date()): Visit {
  const startedAt = now.toISOString();
  if (typeof window === "undefined") return { previous: null, startedAt };

  let previous = getLastVisit();
  try {
    if (window.sessionStorage.getItem(SESSION_MARKER_KEY)) {
      previous = readStashedVisit();
      const storedStart = window.sessionStorage.getItem(VISIT_STARTED_SESSION_KEY);
      if (storedStart && !Number.isNaN(Date.parse(storedStart))) {
        return { previous, startedAt: storedStart };
      }
    }
  } catch {
    // The returned descriptor still preserves the interval for this mount.
  }

  try {
    window.sessionStorage.setItem(PREVIOUS_VISIT_SESSION_KEY, previous ?? "");
    window.sessionStorage.setItem(VISIT_STARTED_SESSION_KEY, startedAt);
    window.sessionStorage.setItem(SESSION_MARKER_KEY, "1");
  } catch {
    // A refused session write must not advance the persistent interval either.
  }

  return { previous, startedAt };
}

/** Acknowledge a successfully checked interval, once and in order across tabs. */
export function completeVisit(
  visit: Visit,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  return withProfileRosterLock(() => {
    if (!isCurrent() || Number.isNaN(Date.parse(visit.startedAt))) return false;
    const stored = window.localStorage.getItem(LAST_VISIT_STORAGE_KEY);
    if (stored && Date.parse(stored) >= Date.parse(visit.startedAt)) return true;
    // A temporarily refused read can resemble a first visit. If an older
    // baseline is now readable, it was never checked and must remain intact.
    if (visit.previous === null && stored && !Number.isNaN(Date.parse(stored))) return false;
    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, visit.startedAt);
    return true;
  }, false);
}

/** The stamp the first call of this session saw, or null when there was none. */
function readStashedVisit(): string | null {
  try {
    const stashed = window.sessionStorage.getItem(PREVIOUS_VISIT_SESSION_KEY);
    if (!stashed || Number.isNaN(Date.parse(stashed))) return null;

    return stashed;
  } catch {
    return null;
  }
}

/** Whether a gap is worth remarking on. */
export function isGapWorthShowing(
  previous: string | null,
  now: Date = new Date(),
): boolean {
  if (!previous) return false;

  const parsed = Date.parse(previous);
  if (Number.isNaN(parsed)) return false;

  return now.getTime() - parsed >= MIN_GAP_HOURS * 3_600_000;
}

/** "yesterday", "3 days ago" – the phrasing a person would use. */
export function describeGap(previous: string, now: Date = new Date()): string {
  const days = Math.floor(
    (now.getTime() - Date.parse(previous)) / 86_400_000,
  );

  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;

  return `${Math.round(days / 30)} months ago`;
}
