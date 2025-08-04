import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";
import type { CalendarSeed } from "./release-calendar";

const TODAY = "2026-10-06";
const details = {
  name: "A Series", title: "A Film", status: "Ended", in_production: false,
  release_date: "2000-01-01",
};

function seeds(): CalendarSeed[] {
  return [
    ...Array.from({ length: 30 }, (_, index) => ({
      id: index + 1, mediaType: "tv" as const, title: "A Series", posterPath: null, releaseDate: null,
    })),
    ...Array.from({ length: 40 }, (_, index) => ({
      id: index + 1, mediaType: "movie" as const, title: "A Film", posterPath: null, releaseDate: null,
    })),
  ];
}

async function flushRequests() {
  for (let tick = 0; tick < 12; tick++) await Promise.resolve();
}

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function freshModules() {
  vi.resetModules();
  const calendar = await import("./release-calendar-data");
  const transport = await import("./tmdb-cache");
  return { ...calendar, ...transport };
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("release calendar with the shared TMDB transport", () => {
  it("lets a new search take the next free slot ahead of 62 queued calendar reads", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((resolve) => pending.push(() => resolve(reply(details))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getReleaseCalendarFor, tmdbFetchJson } = await freshModules();
    const calendar = getReleaseCalendarFor(seeds(), TODAY, "CZ");
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
    expect((await calendar).checked).toBe(70);
    expect(fetchMock).toHaveBeenCalledTimes(71);
  });

  it("cancels active and queued calendar reads so search starts without draining the backlog", async () => {
    const controller = new AbortController();
    // This is one browser page with 70 consumers, not a Node listener leak.
    setMaxListeners(0, controller.signal);
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getReleaseCalendarFor, tmdbFetchJson } = await freshModules();
    const reason = new TypeError("The calendar page has left");
    const calendar = getReleaseCalendarFor(seeds(), TODAY, "CZ", controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    controller.abort(reason);
    await expect(tmdbFetchJson("https://api.themoviedb.org/3/search/multi?query=Heat", 60))
      .resolves.toEqual({ results: [] });
    expect(await calendar).toBe(reason);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("preserves a detail and its cache when another page still needs it after calendar cancellation", async () => {
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
    const { getReleaseCalendarFor, getCachedTVShowDetails } = await freshModules();
    const calendar = getReleaseCalendarFor([seeds()[0]], TODAY, "CZ", controller.signal)
      .catch((error: unknown) => error);
    await flushRequests();
    const interactive = getCachedTVShowDetails(1, { signal: interactiveController.signal });

    controller.abort();
    expect(await calendar).toMatchObject({ name: "AbortError" });
    expect(requestSignal.aborted).toBe(false);
    finish(reply(details));
    await expect(interactive).resolves.toEqual(details);
    await expect(getCachedTVShowDetails(1)).resolves.toEqual(details);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
