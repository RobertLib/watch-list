import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityRef } from "./watchlist-availability";

const details = {
  title: "A Film", name: "A Series", status: "Released",
  release_date: "2000-01-01", first_air_date: "2000-01-01",
  runtime: 100, episode_run_time: [45], genres: [],
};

function refs(): AvailabilityRef[] {
  return Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    mediaType: index % 2 === 0 ? "movie" : "tv",
  }));
}

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function flushRequests() {
  for (let tick = 0; tick < 30; tick++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Tonight with the shared TMDB transport", () => {
  it.each(["providers", "details"] as const)(
    "lets search take the next free slot ahead of queued %s reads",
    async (stage) => {
      const pending: (() => void)[] = [];
      const fetchMock = vi.fn((url: string) => {
        if (url.includes("/search/")) return Promise.resolve(reply({ results: [] }));
        const isProvider = url.includes("/watch/providers");
        const body = isProvider ? { results: {} } : details;
        // Reach the detail queue without waiting on provider downloads, so
        // both bulk fan-outs must independently yield to interactive work.
        if (stage === "details" && isProvider) return Promise.resolve(reply(body));
        return new Promise<Response>((resolve) => pending.push(() => resolve(reply(body))));
      });
      vi.stubGlobal("fetch", fetchMock);
      const { getTonightCandidates } = await import("./tonight-data");
      const { tmdbFetchJson } = await import("./tmdb-cache");
      const shortlist = getTonightCandidates(refs());
      await flushRequests();
      if (stage === "providers") expect(fetchMock).toHaveBeenCalledTimes(8);
      await vi.waitFor(() => expect(pending).toHaveLength(8));

      const searchUrl = "https://api.themoviedb.org/3/search/multi?query=Heat";
      const beforeSearch = fetchMock.mock.calls.length;
      const search = tmdbFetchJson(searchUrl, 60);
      pending.shift()!();
      await flushRequests();
      expect(fetchMock.mock.calls[beforeSearch][0]).toBe(searchUrl);
      await expect(search).resolves.toEqual({ results: [] });

      while (pending.length > 0) {
        pending.shift()!();
        await flushRequests();
      }
      await expect(shortlist).resolves.toHaveLength(60);
      expect(fetchMock).toHaveBeenCalledTimes(121);
    },
  );
});
