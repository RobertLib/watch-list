import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";

/**
 * Resolving a list of ids – the ratings page, a shared list, a comparison –
 * against the real transport rather than a mocked one.
 *
 * Those resolutions used to ask at the default, interactive priority with no
 * signal: two hundred rated titles put a header search at position 201 in the
 * queue, and leaving the page cancelled none of them.
 */

const details = {
  title: "A Film", name: "A Series", poster_path: "/p.jpg", overview: "",
  release_date: "2000-01-01", first_air_date: "2000-01-01", vote_average: 7,
  genres: [],
};

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function rated(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    mediaType: index % 2 === 0 ? "movie" as const : "tv" as const,
  }));
}

async function flushRequests() {
  for (let tick = 0; tick < 30; tick++) await Promise.resolve();
}

const searchUrl = "https://api.themoviedb.org/3/search/multi?query=Heat";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolving rated titles with the shared TMDB transport", () => {
  it("lets a search take the next free slot ahead of two hundred queued reads", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((resolve) => pending.push(() => resolve(reply(details))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTitlesResolutionByRefs } = await import("./api");
    const { tmdbFetchJson } = await import("./tmdb-cache");

    const resolution = getTitlesResolutionByRefs(rated(200));
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    const search = tmdbFetchJson(searchUrl, 60);
    pending.shift()!();
    await flushRequests();
    expect(fetchMock.mock.calls[8][0]).toBe(searchUrl);
    await expect(search).resolves.toEqual({ results: [] });

    while (pending.length > 0) {
      pending.shift()!();
      await flushRequests();
    }
    expect((await resolution).items).toHaveLength(200);
  });

  it("releases its reads when the page leaves, but not one another caller shares", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTitlesResolutionByRefs } = await import("./api");
    const { getCachedMovieDetails, tmdbFetchJson } = await import("./tmdb-cache");
    const page = new AbortController();
    // Browsers impose no EventTarget listener limit; this page has 200 reads.
    setMaxListeners(0, page.signal);

    const resolution = getTitlesResolutionByRefs(rated(200), page.signal)
      .catch((reason: unknown) => reason);
    // A detail page reads the first title too, without cancelling anything.
    const detail = getCachedMovieDetails(1);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    page.abort();
    expect(await resolution).toMatchObject({ name: "AbortError" });
    const signals = fetchMock.mock.calls.map(([, options]) => options.signal!);
    expect(signals.filter((signal) => signal.aborted)).toHaveLength(7);
    expect(signals[0].aborted).toBe(false);

    // The queued reads are gone: the next request starts straight away.
    await expect(tmdbFetchJson(searchUrl, 60)).resolves.toEqual({ results: [] });
    expect(fetchMock).toHaveBeenCalledTimes(9);
    void detail.catch(() => undefined);
  });
});
