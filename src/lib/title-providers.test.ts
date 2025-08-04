import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchProvider, WatchProvidersResponse } from "@/types/tmdb";

/**
 * Where one title can be watched, in the visitor's region.
 *
 * Small, and worth pinning anyway: the region is read here rather than passed
 * in, and the same code is used twice – once to ask TMDB and once to pick the
 * country out of the answer. TMDB keys `results` by region, so reading it back
 * with a different code than the request carried is how a card shows an empty
 * overlay for a title that is streaming perfectly well.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieWatchProviders: vi.fn(),
  getCachedTVWatchProviders: vi.fn(),
}));

vi.mock("./settings", () => ({
  getRegion: vi.fn(() => "US"),
}));

const { getCachedMovieWatchProviders, getCachedTVWatchProviders } =
  await import("./tmdb-cache");
const { getRegion } = await import("./settings");
const { getTitleProviders } = await import("./title-providers");

function provider(id: number, name: string): WatchProvider {
  return {
    provider_id: id,
    provider_name: name,
    logo_path: `/${id}.jpg`,
    display_priority: 1,
  };
}

function response(
  region: string,
  entry: Partial<{
    flatrate: WatchProvider[];
    rent: WatchProvider[];
    buy: WatchProvider[];
  }>,
): WatchProvidersResponse {
  return {
    id: 1,
    results: { [region]: { link: "https://example.test", ...entry } },
  } as WatchProvidersResponse;
}

beforeEach(() => {
  vi.mocked(getCachedMovieWatchProviders).mockReset();
  vi.mocked(getCachedTVWatchProviders).mockReset();
  vi.mocked(getRegion).mockReturnValue("US");
});

describe("getTitleProviders", () => {
  it("splits the region's entry into the three ways of watching", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      response("US", {
        flatrate: [provider(8, "Netflix")],
        rent: [provider(2, "Apple TV")],
        buy: [provider(3, "Google Play")],
      }),
    );

    expect(await getTitleProviders(550, "movie")).toEqual({
      streaming: [provider(8, "Netflix")],
      rent: [provider(2, "Apple TV")],
      buy: [provider(3, "Google Play")],
    });
  });

  it("asks the TV endpoint for a show and the movie endpoint for a film", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      response("US", {}),
    );
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue(response("US", {}));

    await getTitleProviders(550, "movie");
    await getTitleProviders(1396, "tv");

    expect(getCachedMovieWatchProviders).toHaveBeenCalledWith(550, "US");
    expect(getCachedTVWatchProviders).toHaveBeenCalledWith(1396, "US");
  });

  /** Request and read-back must use the same code, or the answer looks empty. */
  it("reads back the same region it asked for", async () => {
    vi.mocked(getRegion).mockReturnValue("GB");
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      response("GB", { flatrate: [provider(39, "Now TV")] }),
    );

    const providers = await getTitleProviders(550, "movie");

    expect(getCachedMovieWatchProviders).toHaveBeenCalledWith(550, "GB");
    expect(providers.streaming).toEqual([provider(39, "Now TV")]);
  });

  it("answers three empty lists when the region is not in the response", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      response("DE", { flatrate: [provider(8, "Netflix")] }),
    );

    expect(await getTitleProviders(550, "movie")).toEqual({
      streaming: [],
      rent: [],
      buy: [],
    });
  });

  it("answers three empty lists when TMDB knows the title but nowhere to watch it", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue({
      id: 550,
    } as WatchProvidersResponse);

    expect(await getTitleProviders(550, "movie")).toEqual({
      streaming: [],
      rent: [],
      buy: [],
    });
  });

  /** A region offering rentals but no subscription is ordinary, not an error. */
  it("fills in the ways of watching that are absent", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      response("US", { rent: [provider(2, "Apple TV")] }),
    );

    expect(await getTitleProviders(550, "movie")).toEqual({
      streaming: [],
      rent: [provider(2, "Apple TV")],
      buy: [],
    });
  });
});
