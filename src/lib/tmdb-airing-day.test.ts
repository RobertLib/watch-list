import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalTimezone = process.env.TZ;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("airing-today cache across local days", () => {
  it.each(["UTC", "Europe/Prague", "America/New_York", "Pacific/Auckland"])(
    "loads tomorrow's programme at midnight in %s while retaining same-day cache hits",
    async (timezone) => {
      process.env.TZ = timezone;
      const fetch = vi.fn(async () => new Response(JSON.stringify({
        page: 1,
        results: [{ id: 1, name: `Programme ${new Date().getDate()}` }],
      }), { headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetch);
      const { tmdbApi } = await import("./tmdb");

      vi.setSystemTime(new Date(2026, 9, 6, 23, 55));
      const beforeMidnight = await tmdbApi.getAiringTodayTVShows();
      vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 59));
      expect(await tmdbApi.getAiringTodayTVShows()).toEqual(beforeMidnight);
      expect(fetch).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date(2026, 9, 7));
      const afterMidnight = await tmdbApi.getAiringTodayTVShows();
      expect(afterMidnight.results[0].name).toBe("Programme 7");
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
});
