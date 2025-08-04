import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";

/**
 * The browser transport in front of TMDB: retry, a concurrency bound, and the
 * per-tab cache.
 *
 * Every test imports the module fresh. The cache and the in-flight counter are
 * module-level state by design – one tab, one cache – so a test that inherited
 * either would be testing the previous test's leftovers.
 */
async function freshModule() {
  vi.resetModules();
  return import("./tmdb-cache");
}

/** A Response good enough for the two things the module asks of one. */
function jsonResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

async function flushRequests() {
  for (let tick = 0; tick < 12; tick++) await Promise.resolve();
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pathId", () => {
  // The ids come from the URL bar and are interpolated into a path, where
  // nothing escapes them – "550/../person/123" would walk to another endpoint.
  it("rejects anything that is not a positive integer", async () => {
    const { pathId } = await freshModule();

    expect(() => pathId(NaN, "movieId")).toThrow(/Invalid movieId/);
    expect(() => pathId(1.5, "movieId")).toThrow(/Invalid movieId/);
    expect(() => pathId(0, "movieId")).toThrow(/Invalid movieId/);
    expect(() => pathId(-1, "movieId")).toThrow(/Invalid movieId/);
  });

  it("accepts a valid id and returns it as a string", async () => {
    const { pathId } = await freshModule();

    expect(pathId(550, "movieId")).toBe("550");
  });

  // Season 0 is where TMDB keeps the specials, so this one really does go to 0.
  it("allows zero where the caller lowers the floor", async () => {
    const { pathId } = await freshModule();

    expect(pathId(0, "seasonNumber", 0)).toBe("0");
    expect(() => pathId(-1, "seasonNumber", 0)).toThrow();
  });
});

describe("TMDB_CONFIG.headers", () => {
  it("names the missing variable rather than answering 401 forever", async () => {
    vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "");
    const { TMDB_CONFIG } = await freshModule();

    expect(() => TMDB_CONFIG.headers).toThrow(/NEXT_PUBLIC_TMDB_API_TOKEN/);
  });

  it("sends the token as a bearer when it is configured", async () => {
    const { TMDB_CONFIG } = await freshModule();

    expect(TMDB_CONFIG.headers.Authorization).toBe("Bearer test-token");
  });
});

describe("watch-provider cancellation", () => {
  it("does not fetch either media type when the lookup's caller has already left", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getCachedMovieWatchProviders, getCachedTVWatchProviders } = await freshModule();
    const controller = new AbortController();
    controller.abort();

    await expect(getCachedMovieWatchProviders(550, "US", { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    await expect(getCachedTVWatchProviders(1396, "US", { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchWithRetry", () => {
  it("retries a dropped connection and returns the attempt that works", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithRetry } = await freshModule();
    const response = await fetchWithRetry("https://example.test/a");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a timeout", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithRetry } = await freshModule();
    await fetchWithRetry("https://example.test/b");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A 4xx is an answer, not a blip: asking again gets the same 4xx.
  it("does not retry an error that is not a transport failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new RangeError("nope"));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithRetry } = await freshModule();

    await expect(fetchWithRetry("https://example.test/c")).rejects.toThrow(
      RangeError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retries are spent and rethrows", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithRetry } = await freshModule();

    await expect(
      fetchWithRetry("https://example.test/d", {}, 1),
    ).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * A caller's signal used to *replace* the deadline rather than join it, so a
   * request made with one – to drop it on unmount, say – could hang for as long
   * as the tab stayed open. Both have to be able to abort it.
   */
  it("honours a caller's own abort signal alongside the deadline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const { fetchWithRetry } = await freshModule();
    await fetchWithRetry("https://example.test/e", {
      signal: controller.signal,
    });

    const passed: AbortSignal = fetchMock.mock.calls[0][1].signal;
    expect(passed).not.toBe(controller.signal);
    expect(passed.aborted).toBe(false);

    controller.abort();
    expect(passed.aborted).toBe(true);
  });

  it("still applies the deadline when the caller passes no signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithRetry } = await freshModule();
    await fetchWithRetry("https://example.test/f");

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("tmdbFetchJson", () => {
  it("shares a complete body retry between callers and caches the recovered JSON", async () => {
    vi.useFakeTimers();
    const brokenResponse = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"id":'));
        controller.error(new TypeError("Body connection dropped"));
      },
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(brokenResponse)
      .mockResolvedValueOnce(new Response('{"id":550,"title":"Fight Club"}'));
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const url = "https://example.test/shared-body";
    const first = tmdbFetchJson(url, 60);
    const shared = tmdbFetchJson(url, 60);

    await vi.advanceTimersByTimeAsync(200);
    const expected = { id: 550, title: "Fight Club" };
    await expect(first).resolves.toEqual(expected);
    await expect(shared).resolves.toEqual(expected);
    await expect(tmdbFetchJson(url, 60)).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("releases a slot when its last caller abandons a pending body download", async () => {
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("queued")) return jsonResponse({ ready: true });
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":'));
          options.signal!.addEventListener("abort", () => {
            controller.error(new DOMException("Body download aborted", "AbortError"));
          }, { once: true });
        },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const callers = Array.from({ length: 8 }, () => new AbortController());
    const active = Promise.allSettled(callers.map((caller, index) =>
      tmdbFetchJson(`https://example.test/body-${index}`, 60, { signal: caller.signal }),
    ));
    const queued = tmdbFetchJson("https://example.test/queued", 60);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    callers[0].abort(new TypeError("Abandoned body"));
    await expect(queued).resolves.toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledTimes(9);
    callers.slice(1).forEach((caller) => caller.abort());
    await active;
  });

  it("loads TMDB JSON without AbortSignal.any when the caller provides no signal", async () => {
    vi.stubGlobal(
      "AbortSignal",
      new Proxy(AbortSignal, {
        get(target, property, receiver) {
          return property === "any"
            ? undefined
            : Reflect.get(target, property, receiver);
        },
      }),
    );
    const body = { results: [{ id: 550, title: "Fight Club" }] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();

    // TMDB adds its own shared-request signal even without caller options, so
    // an unavailable any used to fail every request before fetch was reached.
    await expect(
      tmdbFetchJson("https://example.test/popular", 60),
    ).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on a non-OK status rather than returning the error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { success: false, status_message: "Not found" },
          {
            status: 404,
          },
        ),
      ),
    );

    const { tmdbFetchJson } = await freshModule();

    // The bug this guards: returning `{ success: false }` as if it were data
    // pushes the failure downstream, where it surfaces as a TypeError on a
    // missing `results` array.
    await expect(tmdbFetchJson("https://example.test/404")).rejects.toThrow(
      /TMDB API error: 404/,
    );
  });

  /**
   * The error path never reads the body, and an unread body is a connection
   * the browser holds open until the response is collected. Under a burst of
   * 404s – a watchlist full of titles TMDB has since removed – that is a pool
   * of sockets held by responses nobody will ever look at.
   */
  it("lets go of the body of a response it throws on", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ...jsonResponse({}, { status: 404 }),
        body: { cancel },
      }),
    );

    const { tmdbFetchJson } = await freshModule();

    await expect(tmdbFetchJson("https://example.test/gone")).rejects.toThrow(
      /TMDB API error: 404/,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  // The one that is read is the caller's: cancelling it would make `json()`
  // reject on a response that succeeded.
  it("leaves the body of a response it returns alone", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ...jsonResponse({ ok: 1 }), body: { cancel } }),
    );

    const { tmdbFetchJson } = await freshModule();

    await expect(tmdbFetchJson("https://example.test/kept")).resolves.toEqual({
      ok: 1,
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  // A stand-in with no `body` at all is the shape the rest of this file uses,
  // and a real opaque response has a null one. Neither may mask the status.
  it("still reports the status when there is no body to cancel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })),
    );

    const { tmdbFetchJson } = await freshModule();

    await expect(tmdbFetchJson("https://example.test/bodiless")).rejects.toThrow(
      /TMDB API error: 500/,
    );
  });

  it("does not cache when the TTL is zero", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ page: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const { tmdbFetchJson } = await freshModule();
    await tmdbFetchJson("https://example.test/uncached");
    await tmdbFetchJson("https://example.test/uncached");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a second read of the same URL from cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ page: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const { tmdbFetchJson } = await freshModule();
    const first = await tmdbFetchJson("https://example.test/cached", 60);
    const second = await tmdbFetchJson("https://example.test/cached", 60);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  // What the cache is mainly for: a detail page asks several sections for the
  // same title at once, and they should share one request rather than race.
  it("de-duplicates concurrent reads of the same URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 550 }));
    vi.stubGlobal("fetch", fetchMock);

    const { tmdbFetchJson } = await freshModule();
    await Promise.all([
      tmdbFetchJson("https://example.test/burst", 60),
      tmdbFetchJson("https://example.test/burst", 60),
      tmdbFetchJson("https://example.test/burst", 60),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ page: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const now = vi.spyOn(Date, "now").mockReturnValue(0);

    const { tmdbFetchJson } = await freshModule();
    await tmdbFetchJson("https://example.test/ttl", 60);

    now.mockReturnValue(61_000);
    await tmdbFetchJson("https://example.test/ttl", 60);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // A rejected request must not be what the next caller gets back, or one blip
  // would be served from cache for the whole TTL.
  //
  // 404 rather than 500 because the transport retries a 500: a status this test
  // means as "the request failed" has to be one that fails for good, or the
  // first call quietly succeeds on its second attempt and the cache is never
  // asked the question. Retrying is covered in `fetch-with-retry.test.ts`.
  it("drops a failed request from the cache instead of serving the failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ page: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const { tmdbFetchJson } = await freshModule();

    await expect(
      tmdbFetchJson("https://example.test/blip", 60),
    ).rejects.toThrow();

    await expect(
      tmdbFetchJson("https://example.test/blip", 60),
    ).resolves.toEqual({ page: 1 });
  });

  // Eight at once keeps a watchlist of two hundred titles moving without ever
  // looking to TMDB like an attack.
  it("never has more than eight requests open at once", async () => {
    let open = 0;
    let peak = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        open += 1;
        peak = Math.max(peak, open);
        await new Promise((resolve) => setTimeout(resolve, 1));
        open -= 1;
        return jsonResponse({ ok: true });
      }),
    );

    const { tmdbFetchJson } = await freshModule();
    await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        tmdbFetchJson(`https://example.test/slot-${i}`),
      ),
    );

    expect(peak).toBe(8);
  });

  it("starts a search ahead of the remaining 200-title statistics batch", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/search/")) return Promise.resolve(jsonResponse({ results: [] }));
      return new Promise<Response>((resolve) => {
        pending.push(() => resolve(jsonResponse({ runtime: 100, genres: [] })));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const { getTitleFacts } = await import("./stats-data");
    const background = getTitleFacts(Array.from({ length: 200 }, (_, index) => ({
      id: index + 1, mediaType: "movie" as const,
    })));
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    const search = tmdbFetchJson("https://example.test/search/multi", 60);
    pending.shift()!();
    await search;
    expect(fetchMock.mock.calls[8][0]).toBe("https://example.test/search/multi");

    while (pending.length > 0) {
      pending.shift()!();
      await flushRequests();
    }
    expect(Object.keys(await background)).toHaveLength(200);
  });

  it("removes an abandoned statistics batch and frees its eight active slots", async () => {
    const controller = new AbortController();
    // Browsers impose no EventTarget listener limit; this batch has 200 callers.
    setMaxListeners(0, controller.signal);
    const fetchMock = vi.fn().mockImplementation((url: string, options: RequestInit) => {
      if (url.includes("/search/")) return Promise.resolve(jsonResponse({ results: [] }));
      return new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const { getTitleFacts } = await import("./stats-data");
    const background = getTitleFacts(Array.from({ length: 401 }, (_, index) => ({
      id: index + 1, mediaType: "movie" as const,
    })), controller.signal).catch((reason: unknown) => reason);
    await flushRequests();
    expect(fetchMock).toHaveBeenCalledTimes(8);

    controller.abort();
    await expect(tmdbFetchJson("https://example.test/search/multi", 60))
      .resolves.toEqual({ results: [] });
    expect(await background).toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("keeps a shared detail alive when only its background caller aborts", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      finish = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const controller = new AbortController();
    const url = "https://example.test/shared-detail";
    const background = tmdbFetchJson(url, 60, {
      signal: controller.signal, priority: "background",
    }).catch((reason: unknown) => reason);
    await flushRequests();
    const foreground = tmdbFetchJson(url, 60);

    controller.abort();
    expect(await background).toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    finish(jsonResponse({ id: 550 }));
    await expect(foreground).resolves.toEqual({ id: 550 });
    await expect(tmdbFetchJson(url, 60)).resolves.toEqual({ id: 550 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("promotes a shared queued detail when an interactive caller needs it", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      pending.push(() => resolve(jsonResponse({ id: 550 })));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const requests = Array.from({ length: 20 }, (_, index) => tmdbFetchJson(
      `https://example.test/background-${index}`, 60, { priority: "background" },
    ));
    await flushRequests();
    const foreground = tmdbFetchJson("https://example.test/background-19", 60);
    pending.shift()!();
    await flushRequests();
    expect(fetchMock.mock.calls[8][0]).toBe("https://example.test/background-19");

    while (pending.length > 0) {
      pending.shift()!();
      await flushRequests();
    }
    await Promise.all([...requests, foreground]);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("keeps a shared queued request after its background caller aborts", async () => {
    const pending: (() => void)[] = [];
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      pending.push(() => resolve(jsonResponse({ id: 550 })));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const blockers = Array.from({ length: 8 }, (_, index) =>
      tmdbFetchJson(`https://example.test/blocker-${index}`),
    );
    const controller = new AbortController();
    const url = "https://example.test/queued-shared";
    const background = tmdbFetchJson(url, 60, {
      signal: controller.signal, priority: "background",
    }).catch((reason: unknown) => reason);
    const foreground = tmdbFetchJson(url, 60);
    await flushRequests();
    controller.abort();
    expect(await background).toMatchObject({ name: "AbortError" });

    pending.shift()!();
    await flushRequests();
    expect(fetchMock.mock.calls[8][0]).toBe(url);
    expect(fetchMock.mock.calls[8][1].signal.aborted).toBe(false);
    while (pending.length > 0) {
      pending.shift()!();
      await flushRequests();
    }
    await Promise.all(blockers);
    await expect(foreground).resolves.toEqual({ id: 550 });
    await expect(tmdbFetchJson(url, 60)).resolves.toEqual({ id: 550 });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("aborts a shared fetch only after its final cancellable caller leaves", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const first = new AbortController();
    const second = new AbortController();
    const url = "https://example.test/cancellable-shared";
    const a = tmdbFetchJson(url, 60, { signal: first.signal }).catch((reason: unknown) => reason);
    const b = tmdbFetchJson(url, 60, { signal: second.signal }).catch((reason: unknown) => reason);
    await flushRequests();
    first.abort();
    expect(await a).toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    second.abort();
    expect(await b).toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ retry: true }));
    await expect(tmdbFetchJson(url, 60)).resolves.toEqual({ retry: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not queue or fetch for a caller that has already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { tmdbFetchJson } = await freshModule();
    const controller = new AbortController();
    controller.abort();
    await expect(tmdbFetchJson("https://example.test/aborted", 60, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A slot held by a request that threw would shrink the pool one failure at a
  // time, until nothing could be fetched at all.
  // 404 for the same reason as above: a retried status would make this test pay
  // for two backoffs per request to prove something about slots.
  it("releases its slot even when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 404 })),
    );

    const { tmdbFetchJson } = await freshModule();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        tmdbFetchJson(`https://example.test/fail-${i}`),
      ),
    );

    expect(results.every((r) => r.status === "rejected")).toBe(true);

    // If a slot had leaked, this would hang rather than answer.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: 1 })));
    await expect(
      tmdbFetchJson("https://example.test/after-failures"),
    ).resolves.toEqual({ ok: 1 });
  });

  it("bounds the cache so a long session cannot grow it without limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: 1 })));

    const { tmdbFetchJson } = await freshModule();

    // 300 is the bound; the first URL should be evicted by the time 301 are in.
    for (let i = 0; i < 301; i++) {
      await tmdbFetchJson(`https://example.test/entry-${i}`, 60);
    }

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await tmdbFetchJson("https://example.test/entry-0", 60);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // while a recent one is still there
    await tmdbFetchJson("https://example.test/entry-300", 60);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("cache eviction", () => {
  it("keeps the cache to its bound, dropping the oldest entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { tmdbFetchJson } = await freshModule();

    // Twenty past the 300-entry bound, so the first twenty should be gone.
    for (let i = 0; i < 320; i++) {
      await tmdbFetchJson(`https://example.test/entry-${i}`, 60);
    }

    const before = fetchMock.mock.calls.length;

    // The most recent is still there...
    await tmdbFetchJson("https://example.test/entry-319", 60);
    expect(fetchMock).toHaveBeenCalledTimes(before);

    // ...and the earliest was evicted rather than kept forever.
    await tmdbFetchJson("https://example.test/entry-0", 60);
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
  });
});
