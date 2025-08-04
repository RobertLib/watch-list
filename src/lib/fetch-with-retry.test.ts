import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, REQUEST_TIMEOUT_MS } from "./fetch-with-retry";

/**
 * The transport every outbound request in the app goes through.
 *
 * Its transport-failure half is exercised from `tmdb-cache.test.ts`, which is
 * where the module used to live and which still imports it through the
 * re-export. What is pinned here is the half `fetch` makes easy to get wrong: a
 * rate limit or a bad gateway *resolves*, so it sails straight past a `catch`
 * and only a status check can see it.
 *
 * Timers are faked throughout. The backoff is real time otherwise, and a suite
 * that pays 600ms to prove a 503 was asked about twice is a suite people start
 * skipping.
 */

/** A Response with only the parts this module touches. */
function reply(status: number, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: headers ? new Headers(headers) : undefined,
    json: async () => ({}),
  } as unknown as Response;
}

/** The same, plus a body whose cancellation can be observed. */
function replyWithBody(status: number): {
  response: Response;
  cancel: ReturnType<typeof vi.fn>;
} {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const response = { ...reply(status), body: { cancel } } as unknown as Response;
  return { response, cancel };
}

/**
 * Run a call to completion with the clock under our control.
 *
 * Advancing in one jump rather than stepping: every wait this module schedules
 * is shorter than the deadline, so the only thing a long jump can reach is the
 * next attempt.
 */
async function runWithClock<T>(start: () => Promise<T>): Promise<T> {
  const promise = start();

  // Marked as handled before the clock moves. Nothing is awaiting it yet, so a
  // rejection landing mid-advance is reported as an unhandled one – which fails
  // the run even though the test that expects it goes on to pass. The original
  // promise is still what gets returned, so `rejects` sees the same rejection.
  promise.catch(() => undefined);

  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchWithRetry – transient statuses", () => {
  // The five that mean "not now" rather than "no". Safe to repeat because every
  // request this app makes is a GET.
  it.each([429, 500, 502, 503, 504])(
    "retries a %i and hands back the attempt that works",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply(status))
        .mockResolvedValueOnce(reply(200));
      vi.stubGlobal("fetch", fetchMock);

      const response = await runWithClock(() =>
        fetchWithRetry("https://example.test/transient"),
      );

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  // A 4xx that is not a rate limit is an answer: asking again gets the same one.
  it.each([400, 401, 403, 404, 422])("does not retry a %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(reply(status));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/final"),
    );

    expect(response.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The caller decides what a failed status means – `tmdb-cache.ts` throws on
   * it, `wikipedia.ts` returns null – so a spent retry budget has to hand the
   * response back rather than invent an error of its own.
   */
  it("returns the last response once the retries are spent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(503));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/down"),
    );

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honours the caller's retry budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(500));
    vi.stubGlobal("fetch", fetchMock);

    await runWithClock(() => fetchWithRetry("https://example.test/x", {}, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The stand-in responses in `tmdb-cache.test.ts` carry no `headers` at all,
  // and neither does every real one carry a `Retry-After`.
  it("falls back to the backoff when there is no Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/no-header"),
    );

    expect(response.status).toBe(200);
  });
});

describe("fetchWithRetry – Retry-After", () => {
  it("waits the number of seconds the server named", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(429, { "retry-after": "2" }))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.test/slow-down");

    // Two seconds is well past the 200ms backoff, so a retry before then would
    // mean the header was read and ignored.
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(600);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts the date spelling of the header", async () => {
    const when = new Date(Date.now() + 2000).toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { "retry-after": when }))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/dated"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * Past the cap the server is not smoothing a burst, it is throttling – and
   * sitting behind a spinner for it is worse than failing now, because every
   * failed load in this app gets a "Try again" the visitor can ignore.
   */
  it("gives up rather than waiting out a delay past the cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(429, {
      "retry-after": "120",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/throttled"),
    );

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable header as no header at all", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { "retry-after": "soon-ish" }))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/garbled"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /**
   * The one unparseable spelling that did not behave like the others.
   *
   * `"soon-ish"` above is NaN and falls back to the backoff. A header of nothing
   * but whitespace does not: it trims to `""`, and `Number("")` is 0 rather than
   * NaN – so it read as "retry now" and skipped the wait entirely, making a
   * garbled header retry *harder* than an absent one.
   *
   * Reachable only through a stand-in, which is the point of pinning it. A real
   * `Headers` normalises the value away to `""` before `get` ever returns it, so
   * the `!header` check catches it first and the whole path is dead behind a
   * genuine `Response`. But this module documents that it reads `headers`
   * defensively *because* a Response here is not always a real one – and every
   * stand-in in this suite and in `tmdb-cache.test.ts` hands back exactly what it
   * was given. So the guard is what makes the defensive read honest, and a raw
   * stand-in is the only thing that can prove it is there.
   */
  it("falls back to the backoff for a whitespace-only header", async () => {
    // Deliberately not `new Headers`: normalising is the behaviour under test.
    const raw = (value: string): Response =>
      ({
        ok: false,
        status: 503,
        statusText: "503",
        headers: { get: () => value },
      }) as unknown as Response;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(raw("   "))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.test/blank-header");
    promise.catch(() => undefined);

    // The 200ms backoff has to be waited out. A second attempt on this tick is
    // the bug: it means the header was read as a delay of zero.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect((await promise).status).toBe(200);
  });

  it("retries immediately when the date has already passed", async () => {
    const past = new Date(Date.now() - 5000).toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { "retry-after": past }))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://example.test/stale-date");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await promise;
  });
});

describe("fetchWithRetry – transport failures", () => {
  // Still true after the status handling went in: the two paths are separate,
  // and a dropped socket must not stop being retried because a 503 now is.
  it("retries a dropped connection", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/flaky"),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows a failure that is not a transport one", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new RangeError("nope"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runWithClock(() => fetchWithRetry("https://example.test/bug")),
    ).rejects.toThrow(RangeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A programming error that happens to be a `TypeError`.
   *
   * Every transport failure in a browser is a bare `TypeError`, so that is what
   * the retry predicate keys on – and `AbortSignal.any` being missing from an
   * older browser throws exactly the same kind. Built inside the `try`, the
   * signal used to make that failure look like three dropped connections:
   * three backoffs, three identical throws, and the real cause surfacing a
   * second and a half late.
   */
  it("does not retry a signal that could not be built", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetchMock);
    const any = vi.spyOn(AbortSignal, "any").mockImplementation(() => {
      throw new TypeError("AbortSignal.any is not a function");
    });

    await expect(
      runWithClock(() =>
        fetchWithRetry("https://example.test/old-browser", {
          signal: new AbortController().signal,
        }),
      ),
    ).rejects.toThrow(TypeError);
    // One attempt to build the signal, not three with backoffs between – and
    // `fetch` itself never reached.
    expect(any).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * An abandoned attempt still holds a connection.
 *
 * `fetch` resolves as soon as the headers land, so a retried 429 leaves a body
 * nobody will ever read – and the browser keeps the socket open until that
 * response is garbage collected. Under a rate limit that is precisely backwards:
 * the retries queue behind connections the failed attempts are still holding.
 */
describe("fetchWithRetry – abandoned responses", () => {
  it("cancels the body of an attempt it retries", async () => {
    const failed = replyWithBody(503);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failed.response)
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    await runWithClock(() => fetchWithRetry("https://example.test/retried"));

    expect(failed.cancel).toHaveBeenCalledTimes(1);
  });

  // The one the caller receives is the caller's to read: cancelling it here
  // would hand back a response whose `json()` rejects.
  it("leaves the body of the response it returns alone", async () => {
    const served = replyWithBody(200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(served.response));

    await runWithClock(() => fetchWithRetry("https://example.test/ok"));

    expect(served.cancel).not.toHaveBeenCalled();
  });

  // Retries spent means the 503 is handed back, so it is the caller's too.
  it("leaves the last failed response alone once retries are spent", async () => {
    const served = replyWithBody(503);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(served.response));

    await runWithClock(() => fetchWithRetry("https://example.test/down", {}, 0));

    expect(served.cancel).not.toHaveBeenCalled();
  });

  // A stand-in with no `body` at all is the shape `tmdb-cache.test.ts` uses, and
  // a real opaque response has a null one. Neither may throw.
  it("survives a response with no body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await runWithClock(() =>
      fetchWithRetry("https://example.test/bodiless"),
    );

    expect(response.status).toBe(200);
  });
});
