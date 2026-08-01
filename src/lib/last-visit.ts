"use client";

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

/** Below this, "since your last visit" means nothing anyone cares about. */
const MIN_GAP_HOURS = 6;

export function getLastVisit(): string | null {
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
 * Stamp this visit, and hand back the previous one.
 *
 * The previous value is returned rather than left to a second read: the write
 * destroys it, and every caller wants the old one.
 */
export function recordVisit(now: Date = new Date()): string | null {
  if (typeof window === "undefined") return null;

  const previous = getLastVisit();

  try {
    // `sessionStorage` scopes the marker to this tab's session, so opening five
    // pages in a row does not keep moving the timestamp forward.
    if (window.sessionStorage.getItem(SESSION_MARKER_KEY)) return previous;

    window.sessionStorage.setItem(SESSION_MARKER_KEY, "1");
    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, now.toISOString());
  } catch {
    // Private browsing modes can refuse writes entirely.
    return previous;
  }

  return previous;
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
