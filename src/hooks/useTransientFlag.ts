"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A boolean that turns itself back off after a while.
 *
 * The shape behind every "Copied!", "Downloaded" and heart-pulse in the app: an
 * event handler raises a flag, and something has to lower it again. Written out
 * by hand that is `setState(true)` followed by a bare `setTimeout` – which is
 * what eight components did, and all eight shared the same two faults.
 *
 * The timer was never cleared on unmount, so a visitor who copied a link and
 * navigated away left a `setState` pointed at a component that no longer exists.
 * React 19 drops that write silently rather than warning, so it cost nothing
 * visible – but it is a live timer holding a closure over dead state, and the
 * only reason it was harmless is a detail of the runtime rather than anything
 * the code arranged.
 *
 * The second is visible. Clicking twice inside the window started a second timer
 * without cancelling the first, so the earlier one fired on schedule and lowered
 * the flag while the later click was still meant to be showing it – "Copied!"
 * blinking out a second after the second copy rather than two seconds after.
 *
 * Both go away by holding the handle and clearing it in the two places that
 * matter: before starting a new one, and on unmount.
 */
export function useTransientFlag(
  durationMs: number,
): [boolean, () => void] {
  const [flag, setFlag] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const raise = useCallback(() => {
    clear();
    setFlag(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFlag(false);
    }, durationMs);
  }, [clear, durationMs]);

  // Unmount only. `raise` clears the previous timer itself, so there is nothing
  // for a dependency here to react to – and listing `durationMs` would cancel a
  // flag mid-show if a caller ever passed a computed one.
  useEffect(() => clear, [clear]);

  return [flag, raise];
}
