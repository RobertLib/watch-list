"use client";

import { useEffect, useState } from "react";
import { msUntilNextPuzzle } from "@/lib/daily-puzzle";

/**
 * Time until the next puzzle.
 *
 * Rendered only on a finished board, where "come back tomorrow" is the honest
 * next step and a number says it better than the word does. Starts empty and
 * fills in after mount: the server has no clock the visitor shares, and rendering
 * a duration there would hydrate into a mismatch.
 */
export function NextPuzzleCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextPuzzle());
    tick();

    // Once a second, not once a minute: the last minute of the day is when
    // somebody is actually watching this.
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  if (remaining === null) return null;

  return (
    <>
      <time
        // A live region would announce every tick, which is noise – so the
        // ticking clock is for the eye only.
        aria-hidden="true"
        className="font-mono tabular-nums text-gray-400"
      >
        {formatRemaining(remaining)}
      </time>
      {/* What a screen reader reads instead. Hiding the clock used to leave
          just "Next puzzle in", with no time at all. Not a live region, so
          nothing is announced as it changes, and to the minute rather than
          the second, so the text only moves when the answer does. */}
      <span className="sr-only">{describeRemaining(remaining)}</span>
    </>
  );
}

/** The wait in words, to the minute: "3 hours 12 minutes". */
export function describeRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const unit = (value: number, word: string) =>
    `${value} ${word}${value === 1 ? "" : "s"}`;

  if (hours === 0) return unit(minutes, "minute");
  if (minutes === 0) return unit(hours, "hour");
  return `${unit(hours, "hour")} ${unit(minutes, "minute")}`;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
