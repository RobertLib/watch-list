// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MAX_PROVIDERS_SHOWN } from "@/lib/streaming-providers";
import type { StreamingProvider } from "@/lib/streaming-providers";
import type { MediaType } from "@/types/tmdb";

const getRegionalStreamingProviders =
  vi.fn<(regionCode: string, mediaType?: MediaType) => Promise<StreamingProvider[]>>();

vi.mock("@/lib/streaming-providers", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/streaming-providers")>(),
  getRegionalStreamingProviders: (regionCode: string, mediaType?: MediaType) =>
    getRegionalStreamingProviders(regionCode, mediaType),
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
  getRegionalStreamingProviders.mockResolvedValue([NETFLIX, PRIME, DISNEY]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getRegionalStreamingProviders.mockReset();
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

  it("keeps a sole saved platform offered beyond the regional display cutoff", async () => {
    const usualOffer = Array.from({ length: MAX_PROVIDERS_SHOWN }, (_, i) =>
      provider(1000 + i, `Platform ${i}`),
    );
    const saved = provider(999, "Saved Platform");
    getRegionalStreamingProviders.mockResolvedValue([...usualOffer, saved]);
    setSelectedProviderIds([saved.provider_id]);

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.myProviders).toEqual([saved]));
    expect(result.current.providers).toEqual([...usualOffer, saved]);
    expect(result.current.otherProviders).toEqual(usualOffer);
  });

  it("bounds the offer when the region has more platforms and none are saved", async () => {
    const catalogue = Array.from({ length: MAX_PROVIDERS_SHOWN + 10 }, (_, i) =>
      provider(1000 + i, `Platform ${i}`),
    );
    getRegionalStreamingProviders.mockResolvedValue(catalogue);

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual(catalogue.slice(0, MAX_PROVIDERS_SHOWN));
    expect(result.current.otherProviders).toEqual(result.current.providers);
    expect(result.current.myProviders).toEqual([]);
  });

  it("adds and removes a platform beyond the cutoff as the saved selection changes", async () => {
    const usualOffer = Array.from({ length: MAX_PROVIDERS_SHOWN }, (_, i) =>
      provider(1000 + i, `Platform ${i}`),
    );
    const saved = provider(999, "Saved Platform");
    getRegionalStreamingProviders.mockResolvedValue([...usualOffer, saved]);
    const { result } = renderHook(() => useStreamingProviders());
    await waitFor(() => expect(result.current.providers).toEqual(usualOffer));

    await act(async () => {
      setSelectedProviderIds([saved.provider_id]);
    });
    await waitFor(() => expect(result.current.myProviders).toEqual([saved]));
    expect(result.current.providers).toEqual([...usualOffer, saved]);

    await act(async () => {
      setSelectedProviderIds([]);
    });
    await waitFor(() => expect(result.current.myProviders).toEqual([]));
    expect(result.current.providers).toEqual(usualOffer);
  });

  it("keeps a saved platform when a new region moves it beyond the cutoff", async () => {
    const usualOffer = Array.from({ length: MAX_PROVIDERS_SHOWN }, (_, i) =>
      provider(1000 + i, `Platform ${i}`),
    );
    const saved = provider(999, "Saved Platform");
    getRegionalStreamingProviders
      .mockResolvedValueOnce([saved, ...usualOffer])
      .mockResolvedValueOnce([...usualOffer, saved]);
    setSelectedProviderIds([saved.provider_id]);
    const { result } = renderHook(() => useStreamingProviders());
    await waitFor(() => expect(result.current.myProviders).toEqual([saved]));

    await act(async () => {
      setRegion("GB");
    });

    await waitFor(() => expect(result.current.providers).toEqual([...usualOffer, saved]));
    expect(result.current.myProviders).toEqual([saved]);
    expect(result.current.otherProviders).toEqual(usualOffer);
  });

  it("asks for the visitor's own region", async () => {
    window.localStorage.setItem(REGION_KEY, "CZ");
    recomputeSettings();

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getRegionalStreamingProviders).toHaveBeenCalledWith("CZ", undefined);
  });

  it("re-asks when the visitor changes country", async () => {
    const { result } = renderHook(() => useStreamingProviders());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      setRegion("GB");
    });

    await waitFor(() =>
      expect(getRegionalStreamingProviders).toHaveBeenCalledWith("GB", undefined),
    );
  });

  it("loads the discovery catalogue for its media type and reloads when that type changes", async () => {
    const hayu = provider(223, "Hayu");
    getRegionalStreamingProviders.mockImplementation(async (_region, mediaType) =>
      mediaType === "tv" ? [NETFLIX, hayu] : [NETFLIX],
    );
    setSelectedProviderIds([hayu.provider_id]);
    const { result, rerender } = renderHook(
      ({ mediaType }) => useStreamingProviders(mediaType),
      { initialProps: { mediaType: "movie" as MediaType } },
    );
    await waitFor(() => expect(result.current.providers).toEqual([NETFLIX]));
    expect(result.current.myProviders).toEqual([]);

    rerender({ mediaType: "tv" });

    await waitFor(() => expect(result.current.myProviders).toEqual([hayu]));
    expect(getRegionalStreamingProviders).toHaveBeenLastCalledWith("US", "tv");
  });

  // A missing list costs the platform options and nothing else – the rest of the
  // filter bar has to keep working.
  it("settles empty when TMDB does not answer", async () => {
    getRegionalStreamingProviders.mockRejectedValue(new Error("TMDB API error: 500"));

    const { result } = renderHook(() => useStreamingProviders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([]);
    expect(result.current.myProviders).toEqual([]);
  });

  it("does not write state after the panel has closed", async () => {
    let resolve!: (value: StreamingProvider[]) => void;
    getRegionalStreamingProviders.mockReturnValue(
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
