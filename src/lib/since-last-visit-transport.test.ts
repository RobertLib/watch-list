import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";
import type { CalendarSeed } from "./release-calendar";

const SINCE = "2026-10-01";
const TODAY = "2026-10-06";
const details = {
  name: "A Series",
  title: "A Film",
  release_date: "2000-01-01",
  last_episode_to_air: {
    air_date: "2000-01-01",
    season_number: 1,
    episode_number: 1,
  },
};

function seeds(count: number, mediaType: "movie" | "tv" = "tv"): CalendarSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    mediaType,
    title: "A Title",
    posterPath: null,
    releaseDate: null,
  }));
}

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function flushRequests() {
  for (let tick = 0; tick < 30; tick++) await Promise.resolve();
}

async function freshModules() {
  vi.resetModules();
  const loader = await import("./since-last-visit-data");
  const transport = await import("./tmdb-cache");
  return { ...loader, ...transport };
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token"));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("releases since the last visit with the shared TMDB transport", () => {
  it("finds an elapsed next episode in a detail cached before midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T23:55:00.000Z"));
    const scheduled = {
      air_date: "2026-10-07", season_number: 1, episode_number: 2, name: "New episode",
    };
    const cachedDetails = {
      ...details,
      last_episode_to_air: {
        air_date: "2026-10-05", season_number: 1, episode_number: 1,
      },
      next_episode_to_air: scheduled,
    };
    const fetchMock = vi.fn(async () => reply(cachedDetails));
    vi.stubGlobal("fetch", fetchMock);
    const { getReleasesSince, getCachedTVShowDetails } = await freshModules();

    await getCachedTVShowDetails(1);
    expect(await getReleasesSince(seeds(1), "2026-10-06", "2026-10-06", "CZ"))
      .toEqual([]);

    vi.setSystemTime(new Date("2026-10-07T00:05:00.000Z"));
    const releases = await getReleasesSince(seeds(1), "2026-10-06", "2026-10-07", "CZ");

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      key: "tv-1-1-2", date: "2026-10-07", episodeNumber: 2, episodeName: "New episode",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets search take the next free slot while scanning every followed title", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((resolve) => pending.push(() => resolve(reply(details))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getReleasesSince, tmdbFetchJson } = await freshModules();
    // Both media types must be background work, including titles past the old
    // per-type caps and the first batch.
    const history = getReleasesSince(
      [...seeds(31), ...seeds(45, "movie")],
      SINCE,
      TODAY,
      "CZ",
    );
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    const searchUrl = "https://api.themoviedb.org/3/search/multi?query=Heat";
    const search = tmdbFetchJson(searchUrl, 60);
    pending.shift()!();
    await expect(search).resolves.toEqual({ results: [] });
    expect(fetchMock.mock.calls[8][0]).toBe(searchUrl);

    while (pending.length > 0) {
      pending.shift()!();
      await flushRequests();
    }
    await expect(history).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(77);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/tv/31"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/movie/45?"))).toBe(true);
  });

  it.each(["movie", "tv"] as const)(
    "cancels active and queued %s reads without starting a later batch",
    async (mediaType) => {
      const controller = new AbortController();
      // One browser page can have a full batch of consumers on this signal.
      setMaxListeners(0, controller.signal);
      const activeSignals: AbortSignal[] = [];
      const fetchMock = vi.fn((url: string, options: RequestInit) => {
        if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
        activeSignals.push(options.signal!);
        return new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      const { getReleasesSince, tmdbFetchJson } = await freshModules();
      const history = getReleasesSince(
        seeds(130, mediaType),
        SINCE,
        TODAY,
        "CZ",
        controller.signal,
      ).catch((error: unknown) => error);
      await flushRequests();
      expect(fetchMock).toHaveBeenCalledTimes(8);

      const reason = new TypeError("Left before checking the complete interval");
      controller.abort(reason);
      await expect(tmdbFetchJson("https://api.themoviedb.org/3/search/multi?query=Heat", 60))
        .resolves.toEqual({ results: [] });
      expect(await history).toBe(reason);
      expect(activeSignals.every((signal) => signal.aborted)).toBe(true);
      await flushRequests();
      expect(fetchMock).toHaveBeenCalledTimes(9);
    },
  );

  it("keeps a shared detail and its cache when the visit check is canceled", async () => {
    const controller = new AbortController();
    const interactiveController = new AbortController();
    let finish!: (response: Response) => void;
    let requestSignal!: AbortSignal;
    const fetchMock = vi.fn((_url: string, options: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        finish = resolve;
        requestSignal = options.signal!;
        requestSignal.addEventListener("abort", () => reject(requestSignal.reason), { once: true });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getReleasesSince, getCachedTVShowDetails } = await freshModules();
    const history = getReleasesSince(seeds(1), SINCE, TODAY, "CZ", controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    const interactive = getCachedTVShowDetails(1, { signal: interactiveController.signal });

    controller.abort();
    expect(await history).toMatchObject({ name: "AbortError" });
    expect(requestSignal.aborted).toBe(false);
    finish(reply(details));
    await expect(interactive).resolves.toEqual(details);
    await expect(getCachedTVShowDetails(1)).resolves.toEqual(details);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
