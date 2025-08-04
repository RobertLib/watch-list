import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMaxListeners } from "node:events";
import type { AvailabilityRef } from "./watchlist-availability";

function refs(mediaType: "movie" | "tv"): AvailabilityRef[] {
  return Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    mediaType,
  }));
}

async function flushRequests() {
  for (let tick = 0; tick < 30; tick++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("watchlist availability through the public API and shared transport", () => {
  it.each(["movie", "tv"] as const)(
    "cancels active and queued %s lookups so the next page can search immediately",
    async (mediaType) => {
      const controller = new AbortController();
      // A browser does not impose Node's listener limit on this full watchlist.
      setMaxListeners(0, controller.signal);
      const activeSignals: AbortSignal[] = [];
      const fetchMock = vi.fn((url: string, options: RequestInit) => {
        if (url.includes("/search/")) {
          return Promise.resolve(new Response(JSON.stringify({
            page: 1, results: [], total_pages: 0, total_results: 0,
          })));
        }

        activeSignals.push(options.signal!);
        return new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(options.signal!.reason), {
            once: true,
          });
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      const { getWatchlistAvailabilityFor, searchMulti } = await import("./api");
      const availability = getWatchlistAvailabilityFor(refs(mediaType), controller.signal)
        .catch((error: unknown) => error);
      await flushRequests();
      expect(fetchMock).toHaveBeenCalledTimes(8);
      expect(activeSignals).toHaveLength(8);

      // Navigation starts foreground work while the departed page still fills
      // every slot. Cancellation must release them without waiting for the
      // providers' ten-second deadlines and retries to run out.
      const search = searchMulti("Heat");
      await flushRequests();
      expect(fetchMock).toHaveBeenCalledTimes(8);

      const reason = new TypeError("Left the watchlist page");
      controller.abort(reason);
      expect(activeSignals.every((signal) => signal.aborted)).toBe(true);
      await expect(availability).resolves.toBe(reason);
      await expect(search).resolves.toMatchObject({ results: [] });
      expect(fetchMock.mock.calls[8][0]).toContain("/search/multi");
      expect(fetchMock).toHaveBeenCalledTimes(9);

      // The queued 112 titles and canceled transport attempts must stay stopped,
      // even when the cancellation reason resembles a retryable network error.
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(9);
    },
  );
});
