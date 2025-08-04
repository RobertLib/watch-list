"use client";

import { useSyncExternalStore } from "react";

/**
 * Below Tailwind's `md` breakpoint – the same 768px line every `md:` class in
 * the app draws, so "mobile" here and "mobile" in the stylesheet agree.
 */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * `matchMedia` is missing from jsdom and from the odd embedded browser, and a
 * hook that every poster on the page calls cannot afford to throw for that.
 * Without it the answer is "not mobile", which is also the server's answer.
 */
function getMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia(MOBILE_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const query = getMediaQuery();
  if (!query) return () => {};

  // `change` fires only when the answer flips, which is what makes this cheaper
  // than the resize listener it replaced: that one ran a throttled callback on
  // every pixel of a window drag, once per card.
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // Width alone is not enough: a narrow desktop window has a mouse, and the
  // tap-to-reveal overlay would only get in its way. Touch plus width is the
  // same test the card applied before this hook existed.
  return "ontouchstart" in window && (getMediaQuery()?.matches ?? false);
}

// The prerender has no viewport. Every card starts as a desktop card and the
// browser corrects it during hydration, which is the order the old per-card
// effect produced as well – only now it is one subscription, not one per card.
const getServerSnapshot = () => false;

/**
 * Whether the page is being touched on a phone-sized screen.
 *
 * Shared by every `MediaCard` on the page. Each card used to register its own
 * `resize` listener and its own throttle for this – a grid of forty posters was
 * forty listeners recomputing the same boolean. React de-duplicates the
 * subscription per component, and the browser evaluates the query once for the
 * page, so the cost no longer scales with the grid.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
