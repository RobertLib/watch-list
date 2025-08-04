// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

/**
 * The one "is this a phone?" answer every poster on the page shares.
 *
 * jsdom ships no `matchMedia` at all, which is the first thing worth pinning: a
 * hook called by forty cards a page has to answer "no" there rather than throw.
 * The rest is a stand-in `MediaQueryList` whose `change` event the test fires
 * by hand, because that event is the whole mechanism – the resize listener it
 * replaced is gone.
 */

type Listener = (event: MediaQueryListEvent) => void;

/** A `matchMedia` the test controls, installed on the jsdom window. */
function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches,
    media: "(max-width: 767px)",
    addEventListener: (_: "change", listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_: "change", listener: Listener) => {
      listeners.delete(listener);
    },
  };

  vi.stubGlobal("matchMedia", () => query);

  return {
    listeners,
    flip(next: boolean) {
      query.matches = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("answers no where matchMedia does not exist, rather than throwing", () => {
    // jsdom's default – nothing installed.
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  /**
   * Only the width half is exercised here. jsdom's window carries every
   * `GlobalEventHandlers` property, `ontouchstart` included, so as far as this
   * hook can tell the test browser is a touch device – which is also why the
   * cards' own tests can put a phone under a poster by stubbing `matchMedia`.
   */
  it("is a phone when the screen is narrow", () => {
    installMatchMedia(true);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it("follows the media query when it flips", () => {
    const media = installMatchMedia(false);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.flip(true));
    expect(result.current).toBe(true);

    act(() => media.flip(false));
    expect(result.current).toBe(false);
  });

  it("lets go of its listener on unmount", () => {
    const media = installMatchMedia(false);

    const { unmount } = renderHook(() => useIsMobile());
    expect(media.listeners.size).toBe(1);

    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
