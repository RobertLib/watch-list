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

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...options,
        // Rebuilt per attempt: a timeout consumed by the attempt that failed
        // would abort the retry before it left.
        signal: deadline(options.signal),
      });
    } catch (err) {
      if (attempt < retries && isRetryable(err)) {
        await new Promise((res) => setTimeout(res, 200 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }

  // unreachable, but satisfies TS
  throw new Error("fetchWithRetry: exhausted retries");
}
