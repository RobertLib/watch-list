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
    <time
      // A live region would announce every tick, which is noise. The label is
      // read once, and the value is decoration on top of it.
      aria-hidden="true"
      className="font-mono tabular-nums text-gray-400"
    >
      {formatRemaining(remaining)}
    </time>
  );
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
