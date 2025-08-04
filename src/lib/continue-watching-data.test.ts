import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Episode, SeasonDetails, TVShowDetails } from "@/types/tmdb";
import type { ContinueWatchingSeed } from "./continue-watching";

/**
 * The "Continue Watching" row, assembled from ticked episodes.
 *
 * Which episode comes next is decided by `resolveUpNext`, which is pure and
 * tested next door. What this half owns is the fetching, and its one real
 * economy: the season is fetched for the episode actually being offered rather
 * than for the whole show, so a series with fifteen seasons still costs two
 * reads. That pairing is index-based across two settled batches, and getting it
 * wrong would show one show's episode title under another show's poster – a bug
 * that looks like bad data rather than like a mis-paired array.
 *
 * The failure path matters for the same reason it does everywhere else here: a
 * season TMDB will not serve should cost the row its episode name, not its card.
 */

vi.mock("./tmdb-cache", () => ({
  getCachedTVShowDetails: vi.fn(),
  getCachedSeasonDetails: vi.fn(),
}));

const { getCachedTVShowDetails, getCachedSeasonDetails } = await import(
  "./tmdb-cache"
);
const { getContinueWatchingEpisodes } = await import(
  "./continue-watching-data"
);

function seed(over: Partial<ContinueWatchingSeed> = {}): ContinueWatchingSeed {
  return {
    tvId: 1396,
    name: "Stored Name",
    posterPath: "/stored.jpg",
    seasons: { "1": [1] },
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function episode(number: number, over: Partial<Episode> = {}): Episode {
  return {
    id: 1000 + number,
    name: `Episode ${number}`,
    overview: "",
    air_date: "2008-01-20",
    episode_number: number,
    season_number: 1,
    still_path: `/${number}.jpg`,
    vote_average: 8,
    runtime: 48,
    ...over,
  };
}

/** A show with one season of three aired episodes. */
function show(over: Partial<TVShowDetails> = {}): TVShowDetails {
  return {
    id: 1396,
    name: "Breaking Bad",
    poster_path: "/tmdb.jpg",
    seasons: [{ season_number: 1, episode_count: 3 }],
    last_episode_to_air: { season_number: 1, episode_number: 3 },
    ...over,
  } as TVShowDetails;
}

function season(over: Partial<SeasonDetails> = {}): SeasonDetails {
  return {
    id: 1,
    season_number: 1,
    episodes: [
      episode(1, { name: "Pilot", air_date: "2008-01-20", runtime: 58 }),
      episode(2, { name: "Cat's in the Bag", air_date: "2008-01-27" }),
      episode(3, { name: "Bag's in the River", air_date: "2008-02-10" }),
    ],
    ...over,
  } as SeasonDetails;
}

beforeEach(() => {
  vi.mocked(getCachedTVShowDetails).mockReset();
  vi.mocked(getCachedSeasonDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockResolvedValue(show());
  vi.mocked(getCachedSeasonDetails).mockResolvedValue(season());
});

describe("getContinueWatchingEpisodes", () => {
  it("asks for nothing when nothing is in progress", async () => {
    expect(await getContinueWatchingEpisodes([])).toEqual([]);
    expect(getCachedTVShowDetails).not.toHaveBeenCalled();
  });

  it("offers the next unwatched episode, with what a card needs to show it", async () => {
    const [next] = await getContinueWatchingEpisodes([seed()]);

    expect(next).toMatchObject({
      tvId: 1396,
      slug: "breaking-bad-1396",
      showName: "Breaking Bad",
      posterPath: "/tmdb.jpg",
      seasonNumber: 1,
      episodeNumber: 2,
      episodeName: "Cat's in the Bag",
      stillPath: "/2.jpg",
      airDate: "2008-01-27",
      runtime: 48,
      watchedCount: 1,
      airedCount: 3,
    });
  });

  /** One extra read, not one per season. */
  it("fetches only the season the offered episode is in", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({
        seasons: [
          { season_number: 1, episode_count: 3 },
          { season_number: 2, episode_count: 13 },
          { season_number: 3, episode_count: 13 },
        ],
        last_episode_to_air: { season_number: 3, episode_number: 13 },
      } as unknown as Partial<TVShowDetails>),
    );

    await getContinueWatchingEpisodes([seed({ seasons: { "1": [1] } })]);

    expect(getCachedSeasonDetails).toHaveBeenCalledTimes(1);
    expect(getCachedSeasonDetails).toHaveBeenCalledWith(1396, 1);
  });

  it("prefers TMDB's name and poster over the stored copy", async () => {
    const [next] = await getContinueWatchingEpisodes([seed()]);

    expect(next.showName).toBe("Breaking Bad");
    expect(next.posterPath).toBe("/tmdb.jpg");
  });

  it("falls back to the stored name and poster when TMDB has neither", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(
      show({ name: "", poster_path: null }),
    );

    const [next] = await getContinueWatchingEpisodes([seed()]);

    expect(next.showName).toBe("Stored Name");
    expect(next.posterPath).toBe("/stored.jpg");
  });

  it("keeps the seed order the client sent", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id: number) =>
      show({ id, name: `Series ${id}` }),
    );

    const rows = await getContinueWatchingEpisodes([
      seed({ tvId: 3 }),
      seed({ tvId: 1 }),
      seed({ tvId: 2 }),
    ]);

    expect(rows.map((row) => row.tvId)).toEqual([3, 1, 2]);
  });

  it("drops a show whose details fail to load", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("TMDB API error: 404 Not Found");
      return show({ id });
    });

    const rows = await getContinueWatchingEpisodes([
      seed({ tvId: 404 }),
      seed({ tvId: 1396 }),
    ]);

    expect(rows.map((row) => row.tvId)).toEqual([1396]);
  });

  /** A season that will not load costs the episode's name, not the card. */
  it("still offers the episode when the season read fails", async () => {
    vi.mocked(getCachedSeasonDetails).mockRejectedValue(new Error("no season"));

    const [next] = await getContinueWatchingEpisodes([seed()]);

    expect(next.episodeNumber).toBe(2);
    expect(next.episodeName).toBeNull();
    expect(next.stillPath).toBeNull();
    expect(next.airDate).toBeNull();
    expect(next.runtime).toBeNull();
  });

  it("copes with a season whose episode list does not hold the offered number", async () => {
    vi.mocked(getCachedSeasonDetails).mockResolvedValue(season({ episodes: [] }));

    const [next] = await getContinueWatchingEpisodes([seed()]);

    expect(next.episodeNumber).toBe(2);
    expect(next.episodeName).toBeNull();
  });

  it("leaves out a show that has nothing left to watch", async () => {
    const rows = await getContinueWatchingEpisodes([
      seed({ seasons: { "1": [1, 2, 3] } }),
    ]);

    expect(rows).toEqual([]);
  });

  /**
   * The pairing that would show one show's episode under another's poster. The
   * dropped show must not shift the surviving one onto the wrong season read.
   */
  it("pairs each surviving show with its own season", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id: number) => {
      if (id === 404) throw new Error("gone");
      return show({ id, name: `Series ${id}` });
    });
    vi.mocked(getCachedSeasonDetails).mockImplementation(async (tvId: number) =>
      season({ episodes: [episode(2, { name: `Episode of ${tvId}` })] }),
    );

    const rows = await getContinueWatchingEpisodes([
      seed({ tvId: 404 }),
      seed({ tvId: 77 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].tvId).toBe(77);
    expect(rows[0].episodeName).toBe("Episode of 77");
  });
});
