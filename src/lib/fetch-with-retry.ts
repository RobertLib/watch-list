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
  response.body?.cancel?.().catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch, retrying a transport failure or a transient status.
 *
 * A response is handed back whatever its status: deciding what a 404 means is
 * the caller's business, and both callers already do it – `tmdb-cache.ts` throws
 * on `!ok`, `wikipedia.ts` returns null. All this promises is that a status
 * worth asking about again was asked about again first.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Rebuilt per attempt: a timeout consumed by the attempt that failed would
    // abort the retry before it left.
    //
    // Built *outside* the `try`, so that a failure to build it is not mistaken
    // for a failure to fetch. `AbortSignal.any` is recent enough to be missing
    // from an older browser, and a missing method throws the same bare
    // `TypeError` a dropped connection does – so the loop used to back off and
    // try the same programming error three times over before surfacing it.
    const signal = deadline(options.signal);
    let response: Response;

    try {
      response = await fetch(url, { ...options, signal });
    } catch (err) {
      if (attempt < retries && isRetryable(err)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }

    if (attempt < retries && RETRYABLE_STATUSES.has(response.status)) {
      const wait = retryDelayMs(response, attempt);
      if (wait !== null) {
        discard(response);
        await sleep(wait);
        continue;
      }
    }

    return response;
  }

  // unreachable, but satisfies TS
  throw new Error("fetchWithRetry: exhausted retries");
}

/**
 * The deadline, plus whatever the caller wants to abort on.
 *
 * `options.signal ?? AbortSignal.timeout(...)` is what this replaced, and it
 * quietly traded the deadline away: a caller passing its own signal – to drop a
 * request on unmount, say – got a fetch with no timeout at all, which is the
 * exact failure this module exists to prevent. Composing them keeps both.
 */
function deadline(signal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
