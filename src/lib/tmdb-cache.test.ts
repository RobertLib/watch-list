import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
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
  it("drops a failed request from the cache instead of serving the failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }))
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

  // A slot held by a request that threw would shrink the pool one failure at a
  // time, until nothing could be fetched at all.
  it("releases its slot even when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })),
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
