import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchProvider, WatchProvidersResponse } from "@/types/tmdb";

/**
 * Where everything on a watchlist can be watched, resolved in one pass.
 *
 * Two things are worth pinning. The sanitiser, because its input is whatever the
 * page hands over and its cap is the only thing between a 400-title watchlist
 * and 400 upstream reads per page view. And the classification, because getting
 * it wrong is the kind of bug nobody reports: a title quietly filed under "not
 * streaming" reads as a fact about the catalogue rather than as a defect.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedMovieWatchProviders: vi.fn(),
  getCachedTVWatchProviders: vi.fn(),
}));

vi.mock("./settings", () => ({
  getRegion: vi.fn(() => "US"),
  getSelectedProviderIds: vi.fn(() => []),
}));

const { getCachedMovieWatchProviders, getCachedTVWatchProviders } =
  await import("./tmdb-cache");
const { getSelectedProviderIds } = await import("./settings");
const { getWatchlistAvailability, sanitizeAvailabilityRefs } = await import(
  "./watchlist-availability"
);

function provider(id: number, name: string): WatchProvider {
  return {
    provider_id: id,
    provider_name: name,
    logo_path: `/${name}.jpg`,
    display_priority: 1,
  };
}

/** What TMDB answers for one title, narrowed to the region under test. */
function providersIn(
  data: { flatrate?: WatchProvider[]; rent?: WatchProvider[]; buy?: WatchProvider[] },
  region = "US",
): WatchProvidersResponse {
  return { id: 1, results: { [region]: data } } as WatchProvidersResponse;
}

beforeEach(() => {
  vi.mocked(getSelectedProviderIds).mockReturnValue([]);
  vi.mocked(getCachedMovieWatchProviders).mockReset();
  vi.mocked(getCachedTVWatchProviders).mockReset();
});

describe("sanitizeAvailabilityRefs", () => {
  it("keeps the entries it understands", () => {
    expect(
      sanitizeAvailabilityRefs([
        { id: 550, mediaType: "movie" },
        { id: 1399, mediaType: "tv" },
      ]),
    ).toEqual([
      { id: 550, mediaType: "movie" },
      { id: 1399, mediaType: "tv" },
    ]);
  });

  it("drops anything that is not a positive integer id", () => {
    expect(
      sanitizeAvailabilityRefs([
        { id: 0, mediaType: "movie" },
        { id: -1, mediaType: "movie" },
        { id: 1.5, mediaType: "movie" },
        { id: "550", mediaType: "movie" },
        { id: 550 },
        null,
        "movie",
      ]),
    ).toEqual([]);
  });

  it("drops a media type that is neither a film nor a show", () => {
    expect(
      sanitizeAvailabilityRefs([
        { id: 550, mediaType: "person" },
        { id: 551, mediaType: "" },
      ]),
    ).toEqual([]);
  });

  it("is not fooled by a non-array", () => {
    expect(sanitizeAvailabilityRefs(undefined)).toEqual([]);
    expect(sanitizeAvailabilityRefs({ id: 550, mediaType: "movie" })).toEqual(
      [],
    );
  });

  // A film and a show can share an id, so the key is the pair – deduplicating on
  // the id alone would drop one of them.
  it("deduplicates on the pair, not on the id", () => {
    expect(
      sanitizeAvailabilityRefs([
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "tv" },
      ]),
    ).toEqual([
      { id: 550, mediaType: "movie" },
      { id: 550, mediaType: "tv" },
    ]);
  });

  // The cap is what keeps opening the watchlist from turning into a fan-out of
  // one TMDB read per saved title, however long the list has grown.
  it("stops at the cap", () => {
    const refs = sanitizeAvailabilityRefs(
      Array.from({ length: 500 }, (_, i) => ({
        id: i + 1,
        mediaType: "movie",
      })),
    );

    expect(refs).toHaveLength(120);
    expect(refs[0]).toEqual({ id: 1, mediaType: "movie" });
  });
});

describe("getWatchlistAvailability", () => {
  it("asks for nothing when there is nothing to ask about", async () => {
    const result = await getWatchlistAvailability([]);

    expect(result).toEqual({
      region: "US",
      hasSelectedProviders: false,
      byKey: {},
      checked: 0,
    });
    expect(getCachedMovieWatchProviders).not.toHaveBeenCalled();
  });

  it("calls the endpoint that matches each media type", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({ flatrate: [provider(8, "Netflix")] }),
    );
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue(
      providersIn({ flatrate: [provider(9, "Prime")] }),
    );

    await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
      { id: 1399, mediaType: "tv" },
    ]);

    expect(getCachedMovieWatchProviders).toHaveBeenCalledWith(550, "US");
    expect(getCachedTVWatchProviders).toHaveBeenCalledWith(1399, "US");
  });

  it("files a title on a subscribed platform under 'mine'", async () => {
    vi.mocked(getSelectedProviderIds).mockReturnValue([8]);
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({ flatrate: [provider(8, "Netflix")] }),
    );

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
    ]);

    expect(result.hasSelectedProviders).toBe(true);
    expect(result.byKey["movie-550"].status).toBe("mine");
  });

  it("files one streaming elsewhere under 'streaming'", async () => {
    vi.mocked(getSelectedProviderIds).mockReturnValue([8]);
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({ flatrate: [provider(337, "Disney+")] }),
    );

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
    ]);

    expect(result.byKey["movie-550"].status).toBe("streaming");
  });

  it("files one that can only be paid for under 'rent'", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({ rent: [provider(2, "Apple TV")] }),
    );

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
    ]);

    expect(result.byKey["movie-550"].status).toBe("rent");
    // The badges are the subscription row: a wall of rental logos answers a
    // question the grouping is not asking.
    expect(result.byKey["movie-550"].providers).toEqual([]);
  });

  it("files one nobody carries under 'none'", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({}),
    );

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
    ]);

    expect(result.byKey["movie-550"].status).toBe("none");
  });

  // The visitor's region is the only one that answers the question they asked.
  it("ignores an answer for a region that is not the visitor's", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({ flatrate: [provider(8, "Netflix")] }, "GB"),
    );

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
    ]);

    expect(result.byKey["movie-550"].status).toBe("none");
  });

  /**
   * A failed lookup has to stay *absent* rather than land as "none": the page
   * reads a missing key as "unknown" and says so, where a "none" would claim
   * the title is nowhere on the strength of a request that never arrived.
   */
  it("leaves a failed lookup out of the map entirely", async () => {
    vi.mocked(getCachedMovieWatchProviders)
      .mockRejectedValueOnce(new Error("429"))
      .mockResolvedValueOnce(providersIn({ flatrate: [provider(8, "N")] }));

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
      { id: 551, mediaType: "movie" },
    ]);

    expect(result.byKey["movie-550"]).toBeUndefined();
    expect(result.byKey["movie-551"]).toBeDefined();
    // `checked` is what lets the page say it stopped short rather than imply the
    // whole list was looked at.
    expect(result.checked).toBe(1);
  });

  it("turns the subscription platforms into badges", async () => {
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue(
      providersIn({ flatrate: [provider(8, "Netflix")] }),
    );

    const result = await getWatchlistAvailability([
      { id: 550, mediaType: "movie" },
    ]);

    expect(result.byKey["movie-550"].providers).toEqual([
      { id: 8, name: "Netflix", logoPath: "/Netflix.jpg" },
    ]);
  });
});
