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
/**
 * Where the stamp this session replaced is kept, for the second and every later
 * call. Empty when there was none – a first visit stays a first visit for the
 * whole session, not just for its first page.
 */
export const PREVIOUS_VISIT_SESSION_KEY = "visit-previous";

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
 * Stamp this visit, and hand back the previous one.
 *
 * The previous value is returned rather than left to a second read: the write
 * destroys it, and every caller wants the old one.
 */
export function recordVisit(now: Date = new Date()): string | null {
  if (typeof window === "undefined") return null;

  try {
    // `sessionStorage` scopes the marker to this tab's session, so opening five
    // pages in a row does not keep moving the timestamp forward.
    //
    // A later call in the same session answers from the stash rather than from
    // `localStorage`, because the first call overwrote `localStorage` with this
    // session's own stamp. Reading it back used to return that – a gap of
    // seconds, which `isGapWorthShowing` rightly dismissed – so the "since you
    // were last here" strip vanished on the first navigation away from the
    // home page and back.
    if (window.sessionStorage.getItem(SESSION_MARKER_KEY)) {
      return readStashedVisit();
    }
  } catch {
    // Storage refused even the read; fall through and try to record anyway.
  }

  const previous = getLastVisit();

  try {
    // The stash goes in before the marker: a marker with nothing behind it
    // would read as "first visit" for the rest of the session.
    window.sessionStorage.setItem(PREVIOUS_VISIT_SESSION_KEY, previous ?? "");
    window.sessionStorage.setItem(SESSION_MARKER_KEY, "1");
    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, now.toISOString());
  } catch {
    // Private browsing modes can refuse writes entirely.
    return previous;
  }

  return previous;
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
