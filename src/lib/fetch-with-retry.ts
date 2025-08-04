/**
 * One `fetch` with a deadline and a retry, shared by everything that leaves the
 * origin.
 *
 * It lived in `tmdb-cache.ts` while TMDB was the only thing this app talked to.
 * Wikipedia is the second, and it was calling bare `fetch` – no timeout at all,
 * which in a browser means a request that is never answered is also never
 * abandoned, and the section waiting on it spins for as long as the tab is open.
 */

/** How long a fetch may hang before it is worth retrying. */
export const REQUEST_TIMEOUT_MS = 10000;

/**
 * Statuses worth asking again about.
 *
 * A retry is only safe because every request this app makes is a GET: nothing
 * here creates or changes anything upstream, so a repeat costs a round trip and
 * nothing else. These five are the ones that mean "not now" rather than "no" –
 * a shared read token collecting a rate limit, or a gateway between here and the
 * origin having a moment. A 4xx other than 429 is an answer, and asking again
 * gets the same answer.
 *
 * This used to be missing entirely, and the gap was easy to miss: `fetch` only
 * rejects on a *transport* failure, so a 429 resolved normally and sailed past
 * the `catch` below. The retry that existed could not see the one failure most
 * worth retrying.
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * The longest a `Retry-After` may ask us to sit before giving up instead.
 *
 * A server naming a delay longer than this is not rate-limiting a burst, it is
 * throttling in earnest – and waiting it out behind a spinner is worse than
 * failing now, because `useAsyncData` gives every failed load a "Try again"
 * button and the visitor may not want to spend the wait here at all.
 */
const MAX_RETRY_AFTER_MS = 5000;

/**
 * A dropped connection is worth another attempt; a 4xx is not.
 *
 * In a browser every transport failure – DNS, refused socket, offline, CORS –
 * arrives as the same bare `TypeError`, so unlike the Node version this cannot
 * discriminate on an error code. A timeout aborts with `TimeoutError`.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return err instanceof TypeError;
}

/** Exponential, from 200ms: enough to outlast a blip, short enough to feel live. */
function backoffMs(attempt: number): number {
  return 200 * 2 ** attempt;
}

/**
 * How long to wait before retrying a retryable status, or null to stop trying.
 *
 * `Retry-After` is read when the server sends one – it knows when its own window
 * resets and we do not – and accepted in both spellings the header allows: a
 * count of seconds, or an HTTP date. Anything unparseable falls back to the
 * ordinary backoff rather than being treated as a refusal.
 *
 * `headers` is read defensively because a `Response` is not always a real one:
 * the transport is exercised against hand-built stand-ins that carry only the
 * fields the callers touch.
 */
function retryDelayMs(response: Response, attempt: number): number | null {
  const header = response.headers?.get?.("retry-after");
  if (!header) return backoffMs(attempt);

  // A header of nothing but whitespace is not a delay, and it cannot be allowed
  // to fall through: `Number("")` is 0, not NaN, so it would read as "retry now"
  // and skip the backoff entirely – the one case where an unparseable header
  // made us try *harder* than an absent one.
  const trimmed = header.trim();
  if (!trimmed) return backoffMs(attempt);

  // The common spelling, and the one TMDB uses: whole seconds.
  const seconds = Number(trimmed);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : new Date(trimmed).getTime() - Date.now();

  if (!Number.isFinite(ms)) return backoffMs(attempt);

  // A date already in the past, or a zero, means "now".
  if (ms <= 0) return 0;

  return ms > MAX_RETRY_AFTER_MS ? null : ms;
}

/**
 * Let go of a response nobody will read.
 *
 * A retry abandons the failed attempt's body unread, and an unread body is a
 * connection the browser holds open until the response is garbage collected –
 * so a burst of 429s ties up the very sockets the retries need. Cancelling
 * hands it back immediately.
 *
 * Read defensively for the same reason `headers` is: a `Response` here is not
 * always a real one, and a stand-in carrying only the fields the callers touch
 * has no `body` at all. The rejection is swallowed because there is nothing to
 * do about a body that could not be cancelled, and an unhandled rejection here
 * would surface as noise on a request that went on to succeed.
 */
function discard(response: Response): void {
  try {
    response.body?.cancel?.().catch(() => undefined);
  } catch {
    // A failed JSON reader may still hold the body's lock.
  }
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Fetch, retrying a transport failure or a transient status.
 *
 * A response is handed back whatever its status: deciding what a 404 means is
 * the caller's business, and both callers already do it – `tmdb-cache.ts` throws
 * on `!ok`, `wikipedia.ts` returns null. All this promises is that a status
 * worth asking about again was asked about again first.
 */
export function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<Response> {
  return fetchAndReadWithRetry(url, options, retries, async (response) => response, true);
}

export interface JsonFetchResult<T> {
  response: Response;
  /** Failed HTTP statuses keep their metadata without reading the error body. */
  data: T | undefined;
}

/** Retry the complete JSON download, including failures after the headers arrive. */
export function fetchJsonWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<JsonFetchResult<T>> {
  return fetchAndReadWithRetry(url, options, retries, async (response) => {
    if (!response.ok) {
      discard(response);
      return { response, data: undefined };
    }
    return { response, data: (await response.json()) as T };
  });
}

async function fetchAndReadWithRetry<T>(
  url: string,
  options: RequestInit,
  retries: number,
  read: (response: Response) => Promise<T>,
  keepDeadline = false,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    options.signal?.throwIfAborted();
    // Rebuilt per attempt: a timeout consumed by the attempt that failed would
    // abort the retry before it left.
    //
    // Built outside the `try`, so a programming error while building it is not
    // mistaken for the bare TypeError a dropped connection also produces.
    const attemptDeadline = deadline(options.signal);
    let response: Response;

    try {
      response = await fetch(url, { ...options, signal: attemptDeadline.signal });
    } catch (err) {
      await retryFailure(err, attemptDeadline, options.signal, attempt, retries);
      continue;
    }

    if (attempt < retries && RETRYABLE_STATUSES.has(response.status)) {
      const wait = retryDelayMs(response, attempt);
      if (wait !== null) {
        discard(response);
        attemptDeadline.dispose();
        await sleep(wait, options.signal);
        continue;
      }
    }

    try {
      const value = await read(response);
      // Raw responses still need their deadline while the caller reads them.
      // JSON downloads have finished here, so fallback listeners can be removed.
      if (!keepDeadline) attemptDeadline.dispose();
      return value;
    } catch (err) {
      discard(response);
      await retryFailure(err, attemptDeadline, options.signal, attempt, retries);
    }
  }

  // unreachable, but satisfies TS
  throw new Error("fetchWithRetry: exhausted retries");
}

async function retryFailure(
  error: unknown,
  attemptDeadline: { signal: AbortSignal; dispose: () => void },
  callerSignal: AbortSignal | null | undefined,
  attempt: number,
  retries: number,
): Promise<void> {
  attemptDeadline.dispose();
  // Cancellation may use a TypeError reason too; it must never start a retry.
  callerSignal?.throwIfAborted();
  // Browsers can reject a timed-out body reader with AbortError rather than the
  // deadline's TimeoutError. Preserve the signal's actual reason in that case.
  const reason = attemptDeadline.signal.aborted ? attemptDeadline.signal.reason : error;
  if (attempt >= retries || !isRetryable(reason)) throw reason;
  await sleep(backoffMs(attempt), callerSignal);
}

/**
 * The deadline, plus whatever the caller wants to abort on.
 *
 * `options.signal ?? AbortSignal.timeout(...)` is what this replaced, and it
 * quietly traded the deadline away: a caller passing its own signal – to drop a
 * request on unmount, say – got a fetch with no timeout at all, which is the
 * exact failure this module exists to prevent. Composing them keeps both.
 */
function deadline(signal: AbortSignal | null | undefined): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!signal) return { signal: timeout, dispose: () => undefined };
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([signal, timeout]), dispose: () => undefined };
  }

  // Safari 16.4–17.3 supports timeout, but not any. Forward the first reason
  // unchanged so caller cancellation cannot look like a retryable timeout (or
  // vice versa), and release both listeners once either input has fired.
  const controller = new AbortController();
  const dispose = () => {
    signal.removeEventListener("abort", onCallerAbort);
    timeout.removeEventListener("abort", onTimeout);
  };
  const abort = (source: AbortSignal) => {
    dispose();
    controller.abort(source.reason);
  };
  const onCallerAbort = () => abort(signal);
  const onTimeout = () => abort(timeout);

  if (signal.aborted) {
    abort(signal);
  } else if (timeout.aborted) {
    abort(timeout);
  } else {
    signal.addEventListener("abort", onCallerAbort, { once: true });
    timeout.addEventListener("abort", onTimeout, { once: true });
  }

  return { signal: controller.signal, dispose };
}
