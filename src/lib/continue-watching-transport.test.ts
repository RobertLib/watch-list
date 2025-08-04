import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";
import type { ContinueWatchingSeed } from "./continue-watching";

const TODAY = "2026-10-06";
const details = {
  id: 1,
  name: "A Series",
  seasons: [{ season_number: 1, episode_count: 3 }],
  last_episode_to_air: { season_number: 1, episode_number: 3 },
};

function seeds(count: number): ContinueWatchingSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    tvId: index + 1,
    name: "A Series",
    posterPath: null,
    seasons: { "1": [1, 2, 3] },
    updatedAt: "2026-10-01T00:00:00.000Z",
  }));
}

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function flushRequests() {
  for (let tick = 0; tick < 20; tick++) await Promise.resolve();
}

async function freshModules() {
  vi.resetModules();
  const loader = await import("./continue-watching-data");
  const transport = await import("./tmdb-cache");
  return { ...loader, ...transport };
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Continue Watching with the shared TMDB transport", () => {
  it("lets an interactive search use the next slot before queued history lookups", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((resolve) => pending.push(() => resolve(reply(details))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getContinueWatchingEpisodes, tmdbFetchJson } = await freshModules();
    const history = getContinueWatchingEpisodes(seeds(25), TODAY);
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
    expect(fetchMock).toHaveBeenCalledTimes(26);
  });

  it("cancels active and queued lookups without walking the rest of the history", async () => {
    const controller = new AbortController();
    setMaxListeners(0, controller.signal);
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getContinueWatchingEpisodes, tmdbFetchJson } = await freshModules();
    const history = getContinueWatchingEpisodes(seeds(25), TODAY, controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    const reason = new TypeError("Left the home page");
    controller.abort(reason);
    await expect(tmdbFetchJson("https://api.themoviedb.org/3/search/multi?query=Heat", 60))
      .resolves.toEqual({ results: [] });
    expect(await history).toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("preserves a shared detail and its cache when another page still needs it", async () => {
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
    const { getContinueWatchingEpisodes, getCachedTVShowDetails } = await freshModules();
    const history = getContinueWatchingEpisodes(seeds(1), TODAY, controller.signal)
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

  it.each([1, 0])("prioritizes search and cancels season reads after a season %s marker", async (seasonNumber) => {
    const controller = new AbortController();
    setMaxListeners(0, controller.signal);
    const pending: (() => void)[] = [];
    const seasonSignals: AbortSignal[] = [];
    const season = {
      season_number: 1,
      episodes: [1, 2, 3].map((episodeNumber) => ({
        episode_number: episodeNumber,
        air_date: "2000-01-01",
      })),
    };
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      if (!url.includes("/season/")) return Promise.resolve(reply({
        ...details,
        last_episode_to_air: { season_number: seasonNumber, episode_number: 3 },
      }));
      seasonSignals.push(options.signal!);
      return new Promise<Response>((resolve, reject) => {
        pending.push(() => resolve(reply(season)));
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getContinueWatchingEpisodes, tmdbFetchJson } = await freshModules();
    const history = getContinueWatchingEpisodes(
      seeds(12).map((seed) => ({ ...seed, seasons: { "1": [1] } })),
      TODAY,
      controller.signal,
    ).catch((error: unknown) => error);
    await flushRequests();
    expect(seasonSignals).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(20);

    const searchUrl = "https://api.themoviedb.org/3/search/multi?query=Heat";
    const search = tmdbFetchJson(searchUrl, 60);
    pending.shift()!();
    await expect(search).resolves.toEqual({ results: [] });
    expect(fetchMock.mock.calls[20][0]).toBe(searchUrl);
    await flushRequests();

    const reason = new TypeError("Left during the season download");
    controller.abort(reason);
    expect(await history).toBe(reason);
    expect(seasonSignals[0].aborted).toBe(false);
    expect(seasonSignals.slice(1).every((signal) => signal.aborted)).toBe(true);
    // One season finished to free search's slot, then one queued season began.
    // The remaining queued seasons and subsequent retries must never start.
    expect(seasonSignals).toHaveLength(9);
    expect(fetchMock).toHaveBeenCalledTimes(22);
  });
});
