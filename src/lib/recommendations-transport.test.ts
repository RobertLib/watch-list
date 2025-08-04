import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";
import type { Movie } from "@/types/tmdb";

const settings = vi.hoisted(() => ({ filter: "streaming-only" as "all" | "streaming-only" }));
vi.mock("./settings", () => ({
  getRegion: () => "US",
  getSelectedProviderIds: () => [8],
  getSelectedProviderIdsString: () => "8",
  getWatchProviderFilter: () => settings.filter,
}));

const seed = { id: 1, mediaType: "movie" as const, title: "A Saved Film" };
const onNetflix = {
  results: { US: { flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: null }] } },
};

function recommendations(count = 30) {
  return {
    results: Array.from({ length: count }, (_, index) => ({
      id: index + 2,
      title: `Film ${index + 2}`,
      poster_path: "/poster.jpg",
      backdrop_path: null,
      release_date: "2000-01-01",
      vote_average: 8,
      vote_count: 100,
      genre_ids: [18],
      popularity: 1,
      overview: "",
      adult: false,
      original_language: "en",
      original_title: `Film ${index + 2}`,
      video: false,
    } satisfies Movie)),
  };
}

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

async function flushRequests() {
  for (let tick = 0; tick < 40; tick++) await Promise.resolve();
}

async function freshModules() {
  vi.resetModules();
  const loader = await import("./recommendations");
  const transport = await import("./tmdb-cache");
  const { tmdbApi } = await import("./tmdb");
  return { ...loader, ...transport, tmdbApi };
}

beforeEach(() => {
  settings.filter = "streaming-only";
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("recommendations with the shared TMDB transport", () => {
  it("gives search the next free slot ahead of thirty queued provider checks", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/recommendations")) return Promise.resolve(reply(recommendations()));
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((resolve) => pending.push(() => resolve(reply(onNetflix))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getRecommendationsFromWatchlist, tmdbFetchJson } = await freshModules();
    const load = getRecommendationsFromWatchlist([seed]);
    await flushRequests();
    expect(pending).toHaveLength(8);
    expect(fetchMock).toHaveBeenCalledTimes(9);

    const searchUrl = "https://api.themoviedb.org/3/search/multi?query=Heat";
    const search = tmdbFetchJson(searchUrl, 60);
    pending.shift()!();
    await expect(search).resolves.toEqual({ results: [] });
    expect(fetchMock.mock.calls[9][0]).toBe(searchUrl);

    while (pending.length > 0) {
      pending.shift()!();
      await flushRequests();
    }
    await expect(load).resolves.toMatchObject({ items: expect.any(Array) });
    expect(fetchMock).toHaveBeenCalledTimes(32);
  });

  it("cancels active and queued provider checks without starting genre top-ups", async () => {
    const controller = new AbortController();
    setMaxListeners(0, controller.signal);
    const activeSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes("/recommendations")) return Promise.resolve(reply(recommendations()));
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      activeSignals.push(options.signal!);
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getRecommendationsFromWatchlist, tmdbFetchJson } = await freshModules();
    const load = getRecommendationsFromWatchlist([seed], [], controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(9);

    const reason = new TypeError("Left while checking streaming availability");
    controller.abort(reason);
    expect(await load).toBe(reason);
    expect(activeSignals.every((signal) => signal.aborted)).toBe(true);
    await expect(tmdbFetchJson("https://api.themoviedb.org/3/search/multi?query=Heat", 60))
      .resolves.toEqual({ results: [] });
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/discover/"))).toBe(false);
  });

  it("keeps a shared seed request and its cache when only recommendations are cancelled", async () => {
    settings.filter = "all";
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
    const { getRecommendationsFromWatchlist, tmdbApi } = await freshModules();
    const load = getRecommendationsFromWatchlist([seed], [], controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    const interactive = tmdbApi.getMovieRecommendations(1, { signal: interactiveController.signal });

    controller.abort();
    expect(await load).toMatchObject({ name: "AbortError" });
    expect(requestSignal.aborted).toBe(false);
    const body = recommendations(1);
    finish(reply(body));
    await expect(interactive).resolves.toEqual(body);
    await expect(tmdbApi.getMovieRecommendations(1)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the discovery download when a genre top-up is in progress", async () => {
    const controller = new AbortController();
    let topUpSignal!: AbortSignal;
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes("/recommendations")) return Promise.resolve(reply(recommendations(1)));
      if (url.includes("/watch/providers")) return Promise.resolve(reply({ results: {} }));
      topUpSignal = options.signal!;
      return new Promise<Response>((_resolve, reject) => {
        topUpSignal.addEventListener("abort", () => reject(topUpSignal.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getRecommendationsFromWatchlist } = await freshModules();
    const load = getRecommendationsFromWatchlist([seed], [], controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain("/discover/movie?");

    const reason = new TypeError("Changed profile during a genre top-up");
    controller.abort(reason);
    expect(await load).toBe(reason);
    expect(topUpSignal.aborted).toBe(true);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
