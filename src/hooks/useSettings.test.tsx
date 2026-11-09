// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useSettings, useSettingsActions, useSettingsKey } from "./useSettings";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import {
  DEFAULT_REGION,
  REGION_KEY,
  SELECTED_PROVIDERS_KEY,
  WATCH_PROVIDER_FILTER_KEY,
  setRegion,
  setSelectedProviderIds,
  setWatchProviderFilter,
  subscribeSettings,
} from "@/lib/settings";

/**
 * Region and platforms, which every listing in the app is a function of.
 *
 * `useSettingsKey` is the load-bearing half. It is what a data-loading effect
 * depends on, so a key that fails to change when a setting does leaves every
 * carousel and grid on the page showing the previous region's results – with the
 * selector next to them cheerfully reporting the new one.
 */

function Bar() {
  return <p>{useSettings().region}</p>;
}

/**
 * Make the store re-read storage.
 *
 * The module keeps a snapshot and only recomputes it when something tells it to
 * – the same caching that lets `tmdbApi` read the region from module scope
 * without touching localStorage on every URL it builds. A `storage` event with a
 * null key is what a browser sends when the whole store is cleared, and the
 * subscription has to be live for the store to be listening for it.
 */
function recomputeSettings(): void {
  const unsubscribe = subscribeSettings(() => {});
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  unsubscribe();
}

function resetSettingsStore(): void {
  window.localStorage.clear();
  recomputeSettings();
}

/**
 * Storage as a returning visitor's browser already holds it, before anything has
 * read it. Written directly rather than through the setters: those also record
 * that the visitor has customised something, which is the one thing a couple of
 * these tests are asking about.
 */
function seedStoredSettings(entries: Record<string, string>): void {
  for (const [key, value] of Object.entries(entries)) {
    window.localStorage.setItem(key, value);
  }
  recomputeSettings();
}

beforeEach(resetSettingsStore);

afterEach(() => {
  cleanup();
  resetSettingsStore();
});

describe("useSettings", () => {
  it("starts on the defaults the prerendered HTML shipped", () => {
    seedStoredSettings({ [REGION_KEY]: "CZ" });

    // The prerender has no storage at all, so what it renders has to be the
    // defaults regardless of what this browser happens to hold.
    expect(renderToString(<Bar />)).toContain(DEFAULT_REGION);
  });

  it("reads the visitor's settings once the browser takes over", () => {
    seedStoredSettings({
      [REGION_KEY]: "CZ",
      [WATCH_PROVIDER_FILTER_KEY]: "streaming-only",
      [SELECTED_PROVIDERS_KEY]: "8,337",
    });

    const { result } = renderHook(() => useSettings());

    expect(result.current.region).toBe("CZ");
    expect(result.current.watchProviderFilter).toBe("streaming-only");
    expect(result.current.selectedProviderIds).toEqual([8, 337]);
  });

  it("reaches every component reading it, not just the one that wrote", () => {
    const selector = renderHook(() => useSettings());
    const carousel = renderHook(() => useSettings());

    act(() => setRegion("GB"));

    expect(selector.result.current.region).toBe("GB");
    expect(carousel.result.current.region).toBe("GB");
  });

  it("reports untouched settings as untouched", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.hasCustomSettings).toBe(false);
  });
});

describe("useSettingsKey", () => {
  it("changes when the region does", () => {
    const { result } = renderHook(() => useSettingsKey());
    const before = result.current;

    act(() => setRegion("CZ"));

    expect(result.current).not.toBe(before);
  });

  it("changes when the platform filter does", () => {
    const { result } = renderHook(() => useSettingsKey());
    const before = result.current;

    act(() => setWatchProviderFilter("streaming-only"));

    expect(result.current).not.toBe(before);
  });

  it("changes when the chosen platforms do", () => {
    const { result } = renderHook(() => useSettingsKey());
    const before = result.current;

    act(() => setSelectedProviderIds([8, 337]));

    expect(result.current).not.toBe(before);
  });

  // A key that changed on every render would reload every listing on every
  // render, which is the opposite failure and a much more expensive one.
  it("stays put when nothing changed", () => {
    const { result, rerender } = renderHook(() => useSettingsKey());
    const before = result.current;

    rerender();

    expect(result.current).toBe(before);
  });
});

describe("useSettingsActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A whole-list setter computed its list before waiting for the lock, so a
  // platform another tab or a restore saved meanwhile was silently replaced.
  it("changes platforms only by updating the list read under the lock", async () => {
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    const { result } = renderHook(() => useSettingsActions());
    expect(Object.keys(result.current).sort()).toEqual([
      "setRegion", "setWatchProviderFilter", "updateSelectedProviderIds",
    ]);

    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () =>
      new Promise<void>((resolve) => { release = resolve; }));
    await Promise.resolve();
    const update = result.current.updateSelectedProviderIds((current) => [...current, 8]);
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "337");

    await act(async () => { release(); await held; expect(await update).toBe(true); });

    expect(window.localStorage.getItem(SELECTED_PROVIDERS_KEY)).toBe("337,8");
  });
});
