import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rating duels with the shared TMDB transport", () => {
  it.each([true, false])(
    "does not replace a throttled title when withChampion is %s",
    async (withChampion) => {
      const fetch = vi.fn(async () => new Response("{}", {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "120" },
      }));
      vi.stubGlobal("fetch", fetch);
      const { pickRatingDuel } = await import("./rating-duel-data");

      await expect(pickRatingDuel([], withChampion)).rejects.toThrow(
        "TMDB API error: 429",
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("replaces removed and unrated titles with playable films", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetch = vi.fn(async (url: string) => {
      if (fetch.mock.calls.length === 1) {
        return new Response("{}", { status: 404, statusText: "Not Found" });
      }
      const id = Number(url.split("/").pop());
      return new Response(JSON.stringify({
        id,
        title: `Film ${id}`,
        release_date: "2000-01-01",
        poster_path: null,
        backdrop_path: null,
        vote_average: fetch.mock.calls.length === 2 ? 0 : 8,
      }));
    });
    vi.stubGlobal("fetch", fetch);
    const { pickRatingDuel } = await import("./rating-duel-data");

    const duel = await pickRatingDuel([], true);

    expect(duel?.champion?.rating).toBe(8);
    expect(duel?.challenger.id).not.toBe(duel?.champion?.id);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(new Set(fetch.mock.calls.map(([url]) => url)).size).toBe(4);
  });

  it.each(["expiry", "eviction"])(
    "judges against the displayed champion after cache %s",
    async (change) => {
      let championChanged = false;
      const fetch = vi.fn(async (url: string) => {
        const id = Number(url.split("/").pop());
        return new Response(JSON.stringify({
          id,
          title: `Film ${id}`,
          release_date: "2000-01-01",
          poster_path: null,
          backdrop_path: null,
          vote_average: id === 550 ? (championChanged ? 9 : 7) : 8,
        }), { headers: { "Content-Type": "application/json" } });
      });
      vi.stubGlobal("fetch", fetch);
      const { getCachedMovieDetails } = await import("./tmdb-cache");
      const { settleRatingDuel } = await import("./rating-duel-data");

      const displayedChampion = await getCachedMovieDetails(550);
      await getCachedMovieDetails(680);
      championChanged = true;
      if (change === "expiry") {
        vi.setSystemTime(Date.now() + 6 * 3_600_000 + 1000);
      } else {
        for (let index = 0; index < 300; index++) {
          await getCachedMovieDetails(1000 + index);
        }
      }
      fetch.mockClear();

      await expect(settleRatingDuel(displayedChampion.vote_average, 680, "higher"))
        .resolves.toEqual({ correct: true, challengerRating: 8 });
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://api.themoviedb.org/3/movie/680",
      ]);
      // A fresh champion lookup would change the result, but that score was
      // never on the card and must not be used to settle this round.
      expect((await getCachedMovieDetails(550)).vote_average).toBe(9);
    },
  );
});
