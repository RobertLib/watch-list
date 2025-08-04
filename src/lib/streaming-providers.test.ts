import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamingProvider } from "./streaming-providers";

/**
 * The platform list behind both pickers, and the ordering imposed on it.
 *
 * TMDB returns a region's platforms by its own `display_priority`, which buries
 * Netflix under a dozen regional services nobody picking a platform is looking
 * for. The curated order is the whole value of this module, and it is exactly
 * the kind of comparator that looks right and sorts wrong – so what is asserted
 * here is the resulting order rather than the branches that produce it.
 *
 * The region guard matters for a different reason: it throws rather than
 * escaping, because a region that needs escaping is a bug upstream and quietly
 * requesting a mangled one would answer with the wrong country's platforms.
 */

vi.mock("./tmdb-cache", () => ({
  TMDB_CONFIG: { BASE_URL: "https://api.themoviedb.org/3" },
  TTL: { SHORT: 3600, MEDIUM: 7200, LONG: 21600, DAY: 86400 },
  tmdbFetchJson: vi.fn(),
}));

const { tmdbFetchJson } = await import("./tmdb-cache");
const { getStreamingProviders } = await import("./streaming-providers");

function provider(
  id: number,
  name: string,
  displayPriority = 50,
): StreamingProvider {
  return {
    provider_id: id,
    provider_name: name,
    logo_path: `/${id}.jpg`,
    display_priority: displayPriority,
  };
}

function answers(providers: StreamingProvider[]) {
  vi.mocked(tmdbFetchJson).mockResolvedValue({ results: providers });
}

beforeEach(() => {
  vi.mocked(tmdbFetchJson).mockReset();
});

describe("getStreamingProviders", () => {
  it("asks TMDB for the region's movie providers", async () => {
    answers([]);

    await getStreamingProviders("GB");

    expect(tmdbFetchJson).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/watch/providers/movie?watch_region=GB",
      86400,
    );
  });

  it("refuses a region that is not two capital letters", async () => {
    await expect(getStreamingProviders("gb")).rejects.toThrow(
      "Invalid region: gb",
    );
    await expect(getStreamingProviders("GBR")).rejects.toThrow();
    await expect(getStreamingProviders("")).rejects.toThrow();
    await expect(getStreamingProviders("../US")).rejects.toThrow();

    expect(tmdbFetchJson).not.toHaveBeenCalled();
  });

  it("answers an empty list when TMDB sends no results at all", async () => {
    vi.mocked(tmdbFetchJson).mockResolvedValue({});

    expect(await getStreamingProviders("US")).toEqual([]);
  });

  /** The point of the module: Netflix first, whatever TMDB thinks. */
  it("lifts the curated platforms above everything else", async () => {
    answers([
      provider(999, "A Regional Service", 1),
      provider(8, "Netflix", 90),
      provider(998, "Another Regional Service", 2),
    ]);

    const names = (await getStreamingProviders("US")).map(
      (p) => p.provider_name,
    );

    expect(names[0]).toBe("Netflix");
  });

  it("orders the curated platforms among themselves by the curated order", async () => {
    // Handed over backwards, and with display_priority pointing the other way.
    answers([
      provider(350, "Apple TV+", 1),
      provider(1899, "Max", 2),
      provider(9, "Amazon Prime Video", 3),
      provider(337, "Disney Plus", 4),
      provider(8, "Netflix", 5),
    ]);

    const names = (await getStreamingProviders("US")).map(
      (p) => p.provider_name,
    );

    expect(names).toEqual([
      "Netflix",
      "Disney Plus",
      "Amazon Prime Video",
      "Max",
      "Apple TV+",
    ]);
  });

  it("falls back to TMDB's display priority for everything else", async () => {
    answers([
      provider(997, "Third", 30),
      provider(995, "First", 10),
      provider(996, "Second", 20),
    ]);

    const names = (await getStreamingProviders("US")).map(
      (p) => p.provider_name,
    );

    expect(names).toEqual(["First", "Second", "Third"]);
  });

  it("caps the list at thirty, past which it stops being a list", async () => {
    answers(
      Array.from({ length: 80 }, (_, i) => provider(900 + i, `P${i}`, i)),
    );

    expect(await getStreamingProviders("US")).toHaveLength(30);
  });

  /** Sorting in place would reorder whatever the cache is holding. */
  it("leaves the response array it was given untouched", async () => {
    const results = [
      provider(999, "A Regional Service", 1),
      provider(8, "Netflix", 90),
    ];
    vi.mocked(tmdbFetchJson).mockResolvedValue({ results });

    await getStreamingProviders("US");

    expect(results.map((p) => p.provider_id)).toEqual([999, 8]);
  });
});
