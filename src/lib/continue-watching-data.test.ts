import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Episode, SeasonDetails, TVShowDetails } from "@/types/tmdb";
import type { ContinueWatchingSeed } from "./continue-watching";

/**
 * The "Continue Watching" row, assembled from ticked episodes.
 *
 * Which episode comes next is decided by `resolveUpNext`, which is pure and
 * tested next door. What this half owns is the fetching, and its one real
 * economy: normally the season is fetched for the episode actually being offered
 * rather than for the whole show, so a series with fifteen seasons costs two
 * reads. A last-airing special requires individual episode dates instead – for
 * the season that may be part-way through, not for every season of the show.
 * That pairing is index-based across two settled batches, and getting it
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
  it.each([1, 0])("uses cancellable background reads when the last marker is in season %s", async (seasonNumber) => {
    const controller = new AbortController();
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode(3, { season_number: seasonNumber }),
    }));

    await getContinueWatchingEpisodes([seed()], "2026-10-06", controller.signal);

    const options = { signal: controller.signal, priority: "background" };
    expect(getCachedTVShowDetails).toHaveBeenCalledWith(1396, options);
    expect(getCachedSeasonDetails).toHaveBeenCalledWith(1396, 1, options);
  });

  it("does not start lookups for a cancelled load", async () => {
    const controller = new AbortController();
    const reason = new Error("Left the page");
    controller.abort(reason);

    await expect(getContinueWatchingEpisodes([seed()], "2026-10-06", controller.signal))
      .rejects.toBe(reason);
    expect(getCachedTVShowDetails).not.toHaveBeenCalled();
    expect(getCachedSeasonDetails).not.toHaveBeenCalled();
  });

  it("stops before the next history batch when a pending batch is cancelled", async () => {
    const controller = new AbortController();
    let finish!: (details: TVShowDetails) => void;
    const pending = new Promise<TVShowDetails>((resolve) => { finish = resolve; });
    vi.mocked(getCachedTVShowDetails).mockReturnValue(pending);
    const seeds = Array.from({ length: 25 }, (_, index) => seed({
      tvId: index + 1,
      seasons: { "1": [1, 2, 3] },
    }));
    const load = getContinueWatchingEpisodes(seeds, "2026-10-06", controller.signal)
      .catch((error: unknown) => error);
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(12);

    const reason = new Error("The row was unmounted");
    controller.abort(reason);
    // Even a response that finishes after cancellation cannot start more work.
    finish(show());

    expect(await load).toBe(reason);
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(12);
    expect(getCachedSeasonDetails).not.toHaveBeenCalled();
  });

  it.each([1, 0])("preserves cancellation during season reads after a season %s marker", async (seasonNumber) => {
    const controller = new AbortController();
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode(3, { season_number: seasonNumber }),
    }));
    let started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    let fail!: (reason: Error) => void;
    vi.mocked(getCachedSeasonDetails).mockImplementation(() => {
      started();
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    const load = getContinueWatchingEpisodes([seed()], "2026-10-06", controller.signal)
      .catch((error: unknown) => error);
    await reading;

    const reason = new TypeError("Left the page while reading episodes");
    controller.abort(reason);
    fail(new Error("Season body interrupted"));

    // Optional metadata must not produce a stale card, and required dates must
    // not wrap cancellation into the outage shown by the retry notice.
    expect(await load).toBe(reason);
  });

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
    expect(getCachedSeasonDetails).toHaveBeenCalledWith(1396, 1, { signal: undefined, priority: "background" });
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

  it("propagates an outage when none of the shows can be resolved", async () => {
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(outage);

    await expect(getContinueWatchingEpisodes([
      seed(), seed({ tvId: 77 }),
    ])).rejects.toBe(outage);
    expect(getCachedSeasonDetails).not.toHaveBeenCalled();
  });

  it("returns an empty row for shows removed from TMDB", async () => {
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(
      new Error("TMDB API error: 404 Not Found"),
    );

    await expect(getContinueWatchingEpisodes([seed()])).resolves.toEqual([]);
  });

  it("propagates an unfinished show's outage even when a completed show loads", async () => {
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id === 77) throw outage;
      return show();
    });

    await expect(getContinueWatchingEpisodes([
      seed({ seasons: { "1": [1, 2, 3] } }), seed({ tvId: 77 }),
    ])).rejects.toBe(outage);
    expect(getCachedSeasonDetails).not.toHaveBeenCalled();
  });

  it("returns an empty row when a completed show and a removed show are checked", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id === 77) throw new Error("TMDB API error: 404 Not Found");
      return show();
    });

    await expect(getContinueWatchingEpisodes([
      seed({ seasons: { "1": [1, 2, 3] } }), seed({ tvId: 77 }),
    ])).resolves.toEqual([]);
    expect(getCachedSeasonDetails).not.toHaveBeenCalled();
  });

  it("keeps an available continuation alongside a completed show and a failed show", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id === 77) throw new Error("TMDB API error: 503 Service Unavailable");
      return show({ id });
    });

    const rows = await getContinueWatchingEpisodes([
      seed({ seasons: { "1": [1, 2, 3] } }),
      seed({ tvId: 77 }),
      seed({ tvId: 100 }),
    ]);

    expect(rows.map((row) => [row.tvId, row.episodeNumber])).toEqual([[100, 2]]);
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

  it("finds an older unfinished show after twelve newer caught-up shows", async () => {
    const seeds = Array.from({ length: 13 }, (_, index) => seed({
      tvId: index + 1,
      seasons: { "1": index < 12 ? [1, 2, 3] : [1] },
    }));

    const rows = await getContinueWatchingEpisodes(seeds);

    expect(rows.map((row) => [row.tvId, row.episodeNumber])).toEqual([[13, 2]]);
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(13);
    expect(getCachedSeasonDetails).toHaveBeenCalledTimes(1);
    expect(getCachedSeasonDetails).toHaveBeenCalledWith(13, 1, { signal: undefined, priority: "background" });
  });

  it("stops reading the history once twelve actual continuations are found", async () => {
    const seeds = Array.from({ length: 30 }, (_, index) => seed({ tvId: index + 1 }));

    const rows = await getContinueWatchingEpisodes(seeds);

    expect(rows.map((row) => row.tvId)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(12);
    expect(getCachedSeasonDetails).toHaveBeenCalledTimes(12);
  });

  it("caps results across batches while preserving the original seed order", async () => {
    const seeds = Array.from({ length: 48 }, (_, index) => seed({
      tvId: 48 - index,
      seasons: { "1": index < 20 ? [1, 2, 3] : [1] },
    }));

    const rows = await getContinueWatchingEpisodes(seeds);

    expect(rows.map((row) => row.tvId)).toEqual(Array.from({ length: 12 }, (_, index) => 28 - index));
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(36);
    expect(getCachedSeasonDetails).toHaveBeenCalledTimes(12);
  });

  it("keeps an older continuation when every lookup in the first batch fails", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id <= 12) throw new Error("TMDB API error: 503 Service Unavailable");
      return show({ id });
    });

    const rows = await getContinueWatchingEpisodes(
      Array.from({ length: 13 }, (_, index) => seed({ tvId: index + 1 })),
    );

    expect(rows.map((row) => row.tvId)).toEqual([13]);
  });

  it("propagates failures in later batches after completed shows load", async () => {
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
      if (id > 12) throw outage;
      return show({ id });
    });

    await expect(getContinueWatchingEpisodes(
      Array.from({ length: 13 }, (_, index) => seed({
        tvId: index + 1,
        seasons: { "1": [1, 2, 3] },
      })),
    )).rejects.toBe(outage);
  });

  it("propagates an outage across all batches instead of claiming the history is caught up", async () => {
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(outage);

    await expect(getContinueWatchingEpisodes(
      Array.from({ length: 25 }, (_, index) => seed({ tvId: index + 1 })),
    )).rejects.toBe(outage);
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(25);
  });

  it("does not offer future episodes when a special aired most recently", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode(1, { season_number: 0 }),
    }));
    vi.mocked(getCachedSeasonDetails).mockResolvedValue(season({ episodes: [
      episode(1, { air_date: "2026-10-01" }),
      episode(2, { air_date: "2026-10-06" }),
      episode(3, { air_date: null }),
    ] }));

    expect(await getContinueWatchingEpisodes([seed()], "2026-10-05")).toEqual([]);
  });

  it("resolves next and progress from regular episode dates after a special", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      seasons: [
        { season_number: 0, episode_count: 1 },
        { season_number: 1, episode_count: 3 },
        { season_number: 2, episode_count: 3 },
      ] as TVShowDetails["seasons"],
      last_episode_to_air: episode(1, { season_number: 0 }),
    }));
    vi.mocked(getCachedSeasonDetails).mockImplementation(async (_id, seasonNumber) =>
      seasonNumber === 1 ? season() : season({
        season_number: 2,
        episodes: [
          episode(1, { season_number: 2, air_date: "2026-10-03" }),
          episode(2, { season_number: 2, air_date: "2026-10-05", name: "Available now" }),
          episode(3, { season_number: 2, air_date: "2026-10-06" }),
        ],
      }),
    );

    const [next] = await getContinueWatchingEpisodes([seed({
      seasons: { "0": [1], "1": [1, 2, 3], "2": [1, 3] },
    })], "2026-10-05");

    expect(next).toMatchObject({
      seasonNumber: 2,
      episodeNumber: 2,
      episodeName: "Available now",
      watchedCount: 4,
      airedCount: 5,
    });
    expect(getCachedSeasonDetails).toHaveBeenCalledTimes(2);
    expect(getCachedSeasonDetails).not.toHaveBeenCalledWith(1396, 0);
  });

  describe("after a special, on a long-running show", () => {
    // Thirty yearly seasons of ten episodes; the latest premiered last month and
    // has aired five so far. A special aired most recently of all.
    const longRunning = () => show({
      seasons: [
        { season_number: 0, episode_count: 12, air_date: "1999-12-24" },
        ...Array.from({ length: 30 }, (_, index) => ({
          season_number: index + 1,
          episode_count: 10,
          air_date: index === 29 ? "2026-09-07" : `${1996 + index}-09-01`,
        })),
        { season_number: 31, episode_count: 10, air_date: "2027-09-06" },
      ] as TVShowDetails["seasons"],
      last_episode_to_air: episode(12, { season_number: 0, air_date: "2026-10-01" }),
      // Stale or not, a scheduled episode must not stand in for dated lists.
      next_episode_to_air: episode(9, { season_number: 30, air_date: "2026-10-04" }),
    });
    const tenEpisodes = (seasonNumber: number, aired: number) => season({
      season_number: seasonNumber,
      episodes: Array.from({ length: 10 }, (_, index) => episode(index + 1, {
        season_number: seasonNumber,
        name: `S${seasonNumber}E${index + 1}`,
        air_date: index < aired
          ? ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"][index % 5]
          : "2026-11-30",
      })),
    });
    const allWatchedBefore30 = Object.fromEntries(Array.from({ length: 29 }, (_, index) =>
      [String(index + 1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ));

    beforeEach(() => {
      vi.mocked(getCachedTVShowDetails).mockResolvedValue(longRunning());
      vi.mocked(getCachedSeasonDetails).mockImplementation(async (_id, seasonNumber) =>
        tenEpisodes(seasonNumber, seasonNumber === 30 ? 5 : 10),
      );
    });

    it("reads only the season that may be part-way through", async () => {
      const [next] = await getContinueWatchingEpisodes([seed({
        seasons: { ...allWatchedBefore30, "30": [1, 2, 3] },
      })], "2026-10-06");

      expect(next).toMatchObject({
        seasonNumber: 30,
        episodeNumber: 4,
        episodeName: "S30E4",
        watchedCount: 293,
        airedCount: 295,
      });
      expect(vi.mocked(getCachedSeasonDetails).mock.calls.map(([, number]) => number))
        .toEqual([30]);
    });

    it("still offers a gap in an earlier season, reading that season for its card", async () => {
      const seasons = { ...allWatchedBefore30, "2": [1, 2, 3, 4, 6, 7, 8, 9, 10], "30": [1, 2, 3, 4, 5] };
      const [next] = await getContinueWatchingEpisodes([seed({ seasons })], "2026-10-06");

      expect(next).toMatchObject({
        seasonNumber: 2,
        episodeNumber: 5,
        episodeName: "S2E5",
        watchedCount: 294,
        airedCount: 295,
      });
      expect(vi.mocked(getCachedSeasonDetails).mock.calls.map(([, number]) => number))
        .toEqual([30, 2]);
    });

    it("leaves the show out once every aired episode is ticked", async () => {
      expect(await getContinueWatchingEpisodes([seed({
        seasons: { ...allWatchedBefore30, "30": [1, 2, 3, 4, 5] },
      })], "2026-10-06")).toEqual([]);
      expect(getCachedSeasonDetails).toHaveBeenCalledTimes(1);
    });
  });

  it("reads an undated later season rather than assuming it has not aired", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      seasons: [
        { season_number: 1, episode_count: 3, air_date: "2020-01-01" },
        { season_number: 2, episode_count: 3, air_date: "2021-01-01" },
        { season_number: 3, episode_count: 3, air_date: null },
        { season_number: 4, episode_count: 3, air_date: "2099-01-01" },
      ] as TVShowDetails["seasons"],
      last_episode_to_air: episode(1, { season_number: 0 }),
    }));
    vi.mocked(getCachedSeasonDetails).mockImplementation(async (_id, seasonNumber) => season({
      season_number: seasonNumber,
      episodes: [
        episode(1, { season_number: seasonNumber, air_date: "2021-01-01", name: `S${seasonNumber}E1` }),
        episode(2, { season_number: seasonNumber, air_date: seasonNumber === 3 ? "2099-01-01" : "2021-01-08" }),
        episode(3, { season_number: seasonNumber, air_date: seasonNumber === 3 ? null : "2021-01-15" }),
      ],
    }));

    const [next] = await getContinueWatchingEpisodes([seed({
      seasons: { "1": [1, 2, 3], "2": [1, 2, 3] },
    })], "2026-10-05");

    expect(next).toMatchObject({ seasonNumber: 3, episodeNumber: 1, watchedCount: 6, airedCount: 7 });
    expect(vi.mocked(getCachedSeasonDetails).mock.calls.map(([, number]) => number).sort())
      .toEqual([2, 3]);
  });

  it("does not guess the regular run when a special marker's season reads fail", async () => {
    vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => show({
      id,
      last_episode_to_air: episode(1, { season_number: id === 1396 ? 0 : 1 }),
    }));
    vi.mocked(getCachedSeasonDetails).mockImplementation(async (id) => {
      if (id === 1396) throw new Error("no dates");
      return season();
    });

    const rows = await getContinueWatchingEpisodes([
      seed(), seed({ tvId: 77, seasons: {} }),
    ], "2026-10-05");

    expect(rows.map((row) => row.tvId)).toEqual([77]);
  });

  it("propagates required season failures after a special instead of claiming the show is caught up", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      seasons: [
        { season_number: 1, episode_count: 3 },
        { season_number: 2, episode_count: 3 },
      ] as TVShowDetails["seasons"],
      last_episode_to_air: episode(1, { season_number: 0 }),
    }));
    const outage = new Error("TMDB API error: 503 Service Unavailable");
    vi.mocked(getCachedSeasonDetails).mockImplementation(async (_id, seasonNumber) => {
      if (seasonNumber === 2) throw outage;
      return season();
    });

    await expect(getContinueWatchingEpisodes([seed()], "2026-10-05"))
      .rejects.toMatchObject({ cause: outage });
  });

  it("does not treat a missing required season as a removed show", async () => {
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(show({
      last_episode_to_air: episode(1, { season_number: 0 }),
    }));
    vi.mocked(getCachedSeasonDetails).mockRejectedValue(
      new Error("TMDB API error: 404 Not Found"),
    );

    await expect(getContinueWatchingEpisodes([seed()], "2026-10-05"))
      .rejects.toThrow("Could not load aired episodes for TV show 1396");
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
