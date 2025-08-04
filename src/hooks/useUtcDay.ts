"use client";

import { useSyncExternalStore } from "react";
import { msUntilNextPuzzle, todayUtc } from "@/lib/daily-puzzle";

// A little past the boundary rather than dead on it. Timers are allowed to fire
// early by a millisecond or so, and a tick that lands at 23:59:59.999 would
// re-read yesterday and then not be asked again until tomorrow.
const MIDNIGHT_SLACK_MS = 50;

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Re-armed after every tick rather than set once: the wait is "until the next
  // midnight", and after that midnight there is another one to wait for.
  const arm = () => {
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msUntilNextPuzzle() + MIDNIGHT_SLACK_MS);
  };
  arm();

  // A laptop lid closed overnight suspends timers along with everything else,
  // and the timer then fires late – or not at all, in some browsers. Coming
  // back to the tab is the moment that matters, so it is checked directly.
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    if (timer !== null) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/**
 * Today's date in UTC, as the puzzle counts days – and kept current.
 *
 * `todayUtc()` read during render is right until midnight and wrong after it: a
 * tab left open overnight kept offering yesterday's puzzle until something else
 * happened to re-render the board. This re-reads the day when UTC midnight
 * passes and whenever the tab comes back into view.
 *
 * The server snapshot is the same function. The prerender has no idea what day
 * the visitor will open it, and the components reading this already hide the
 * date behind a loading state until the browser has taken over, so the two
 * snapshots disagreeing costs one re-render and nothing visible.
 */
export function useUtcDay(): string {
  return useSyncExternalStore(subscribe, todayUtc, todayUtc);
}
