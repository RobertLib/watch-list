// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { StreamingProvider } from "@/lib/streaming-providers";

const getStreamingProviders =
  vi.fn<(regionCode: string) => Promise<StreamingProvider[]>>();

vi.mock("@/lib/streaming-providers", () => ({
  getStreamingProviders: (regionCode: string) =>
    getStreamingProviders(regionCode),
}));

const { useStreamingProviders } = await import("./useStreamingProviders");
const { REGION_KEY, setRegion, setSelectedProviderIds, subscribeSettings } =
  await import("@/lib/settings");

/**
 * The platform list behind the filter bar, split into the visitor's own and the
 * rest.
 *
 * Two things here are worth pinning. The split is what the bar renders as two
 * groups, and it is computed against a set the visitor edits in the same panel.
 * And the fetch is keyed on the region, so changing country has to re-ask – a
 * stale list is a filter bar offering platforms that do not exist where the
 * visitor is.
 */

function provider(id: number, name: string): StreamingProvider {
  return {
    provider_id: id,
    provider_name: name,
    logo_path: `/logo-${id}.jpg`,
    display_priority: id,
  };
}

const NETFLIX = provider(8, "Netflix");
const PRIME = provider(9, "Prime Video");
const DISNEY = provider(337, "Disney Plus");

function recomputeSettings(): void {
  const unsubscribe = subscribeSettings(() => {});
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  unsubscribe();
}

beforeEach(() => {
  window.localStorage.clear();
  recomputeSettings();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  getStreamingProviders.mockResolvedValue([NETFLIX, PRIME, DISNEY]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getStreamingProviders.mockReset();
  window.localStorage.clear();
  recomputeSettings();
});

describe("useStreamingProviders", () => {
  it("starts loading", () => {
    const { result } = renderHook(() => useStreamingProviders());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.providers).toEqual([]);
  });

  it("hands back the region's platforms", async () => {
    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([NETFLIX, PRIME, DISNEY]);
  });

  it("splits the visitor's own platforms from the rest", async () => {
    setSelectedProviderIds([8, 337]);

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.myProviders).toEqual([NETFLIX, DISNEY]);
    expect(result.current.otherProviders).toEqual([PRIME]);
  });

  // Nothing chosen is not the same as everything chosen: the bar has to be able
  // to tell "my platforms" apart from "all platforms".
  it("claims none as the visitor's own when none are chosen", async () => {
    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.myProviders).toEqual([]);
    expect(result.current.otherProviders).toEqual([NETFLIX, PRIME, DISNEY]);
  });

  it("asks for the visitor's own region", async () => {
    window.localStorage.setItem(REGION_KEY, "CZ");
    recomputeSettings();

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getStreamingProviders).toHaveBeenCalledWith("CZ");
  });

  it("re-asks when the visitor changes country", async () => {
    const { result } = renderHook(() => useStreamingProviders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      setRegion("GB");
    });

    await waitFor(() =>
      expect(getStreamingProviders).toHaveBeenCalledWith("GB"),
    );
  });

  // A missing list costs the platform options and nothing else – the rest of the
  // filter bar has to keep working.
  it("settles empty when TMDB does not answer", async () => {
    getStreamingProviders.mockRejectedValue(new Error("TMDB API error: 500"));

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([]);
    expect(result.current.myProviders).toEqual([]);
  });

  it("does not write state after the panel has closed", async () => {
    let resolve!: (value: StreamingProvider[]) => void;
    getStreamingProviders.mockReturnValue(
      new Promise<StreamingProvider[]>((res) => {
        resolve = res;
      }),
    );

    const { unmount } = renderHook(() => useStreamingProviders());
    unmount();

    // Settling after the unmount must not reach the state setter. React no
    // longer warns about that, which is precisely why it is worth asserting.
    await act(async () => {
      resolve([NETFLIX]);
    });

    expect(console.error).not.toHaveBeenCalled();
  });
});
