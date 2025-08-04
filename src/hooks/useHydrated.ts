"use client";

import { useSyncExternalStore } from "react";

// Nothing to subscribe to: the value only ever changes once, when React swaps
// from the hydration snapshot to the client one.
const subscribe = () => () => {};

/**
 * False during the prerender and the hydration pass, true afterwards.
 *
 * For the handful of places that must not render their real output until the
 * browser's own state is readable – a panel shown only to first-time visitors
 * would otherwise flash on screen for everyone before local storage says
 * otherwise.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
