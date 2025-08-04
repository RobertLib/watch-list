// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalendarContent } from "./CalendarContent";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { refreshSettings, setRegion } from "@/lib/settings";
import { todayLocal } from "@/lib/dates";
import type { ReleaseCalendar } from "@/lib/release-calendar";

/**
 * The release calendar, and the difference between empty and broken.
 *
 * A failed request used to be written into the calendar as `EMPTY`, which the
 * render below cannot tell from a genuinely quiet month – so somebody following
 * twenty shows was shown "Nothing on the horizon" because TMDB had not answered.
 * Every date here comes from TMDB while the list itself is in this browser, so
 * that reading is not just unhelpful, it is alarming.
 */

const { getReleaseCalendar } = vi.hoisted(() => ({
  getReleaseCalendar: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ getReleaseCalendar }));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

function saveOneTitle() {
  window.localStorage.setItem(
    WATCHLIST_STORAGE_KEY,
    JSON.stringify([
      {
        id: 1396,
        title: "Breaking Bad",
        mediaType: "tv",
        posterPath: "/poster.jpg",
        voteAverage: 8.9,
        releaseDate: "2008-01-20",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
}

async function renderCalendar() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <WatchlistProvider>
        <EpisodeProgressProvider>
          <CalendarContent />
        </EpisodeProgressProvider>
      </WatchlistProvider>,
    );
  });
  return view;
}

beforeEach(() => {
  window.localStorage.clear();
  refreshSettings();
  getReleaseCalendar.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CalendarContent", () => {
  it.each(["unmount", "region", "followed titles", "empty list", "midnight"])(
    "cancels a pending calendar load after %s without reporting an outage",
    async (trigger) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
      saveOneTitle();
      getReleaseCalendar.mockImplementation((_seeds: unknown, signal: AbortSignal) =>
        new Promise<ReleaseCalendar>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      );
      const view = await renderCalendar();
      expect(getReleaseCalendar).toHaveBeenCalledTimes(1);
      const firstSignal = getReleaseCalendar.mock.calls[0][1] as AbortSignal;
      expect(firstSignal.aborted).toBe(false);

      await act(async () => {
        if (trigger === "unmount") {
          view.unmount();
        } else if (trigger === "region") {
          await setRegion("CZ");
        } else if (trigger === "midnight") {
          await vi.advanceTimersByTimeAsync(2_000);
        } else {
          const titles = trigger === "empty list" ? [] : [{
            id: 550, title: "New film", mediaType: "movie", posterPath: null,
            voteAverage: 8, releaseDate: "2026-10-01", addedAt: "2026-01-02T00:00:00.000Z",
          }];
          window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(titles));
          window.dispatchEvent(new StorageEvent("storage", { key: WATCHLIST_STORAGE_KEY }));
        }
      });

      expect(firstSignal.aborted).toBe(true);
      expect(console.error).not.toHaveBeenCalled();
      expect(screen.queryByText("Could not load your calendar")).toBeNull();
      if (trigger === "unmount" || trigger === "empty list") {
        expect(getReleaseCalendar).toHaveBeenCalledTimes(1);
      } else {
        expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
        const nextSignal = getReleaseCalendar.mock.calls[1][1] as AbortSignal;
        expect(nextSignal).not.toBe(firstSignal);
        expect(nextSignal.aborted).toBe(false);
      }
    },
  );

  it.each([
    ["regional-theatrical", "In cinemas", "Release date"],
    ["primary", "Release date", "In cinemas"],
  ])("labels a film date from %s without claiming a different release type", async (source, label, absentLabel) => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [{
        key: "movie-550", id: 550, mediaType: "movie", slug: "a-film-550",
        title: "A Film", posterPath: null, date: "2026-09-14",
        movieReleaseSource: source,
        seasonNumber: null, episodeNumber: null, episodeName: null, stillPath: null,
      }],
      awaiting: [], today: "2026-09-13", checked: 1, eligible: 1,
    });

    await renderCalendar();

    expect(screen.getByText(label)).toBeDefined();
    expect(screen.queryByText(absentLabel)).toBeNull();
  });

  it("hides another profile's calendar until the current followed titles resolve", async () => {
    saveOneTitle();
    const empty = {
      events: [], awaiting: [], today: "2026-09-13", checked: 1, eligible: 1,
    };
    getReleaseCalendar.mockResolvedValueOnce({
      ...empty,
      events: [{
        key: "tv-1396-s1e2", id: 1396, mediaType: "tv", slug: "breaking-bad-1396",
        title: "Old episode", posterPath: null, date: "2026-09-14",
        seasonNumber: 1, episodeNumber: 2, episodeName: null, stillPath: null,
      }],
    });
    await renderCalendar();
    expect(screen.getByText("Old episode")).toBeDefined();

    let finish!: (value: typeof empty) => void;
    getReleaseCalendar.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
        id: 550, title: "New film", mediaType: "movie", posterPath: null,
        voteAverage: 8, releaseDate: "2026-10-01", addedAt: "2026-01-02T00:00:00.000Z",
      }]));
      window.dispatchEvent(new StorageEvent("storage", { key: WATCHLIST_STORAGE_KEY }));
    });

    expect(screen.queryByText("Old episode")).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
    await act(async () => { finish(empty); });
    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
    expect(screen.queryByText("Old episode")).toBeNull();
  });

  it("shows undated films alongside returning series with links for each media type", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [], today: "2026-09-13", checked: 2, eligible: 2,
      awaiting: [
        { id: 550, mediaType: "movie", slug: "announced-film-550", title: "Announced film", posterPath: null, status: "Planned" },
        { id: 550, mediaType: "tv", slug: "returning-show-550", title: "Returning show", posterPath: null, status: "Returning Series" },
      ],
    });

    await renderCalendar();

    expect(screen.getByText("No date announced")).toBeDefined();
    expect(screen.getByText("No release date announced")).toBeDefined();
    expect(screen.getByRole("link", { name: /Announced film/ }).getAttribute("href")).toBe("/movie?id=announced-film-550");
    expect(screen.getByRole("link", { name: /Returning show/ }).getAttribute("href")).toBe("/tv?id=returning-show-550");
    expect(screen.queryByText("Nothing on the horizon")).toBeNull();
    expect(screen.queryByText(/Everything you follow has already been released/)).toBeNull();
  });

  it("keeps older TV-only awaiting results linked to the show", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [], today: "2026-09-13", checked: 1, eligible: 1,
      awaiting: [{ id: 1396, slug: "a-show-1396", title: "A show", posterPath: null, status: "Returning Series" }],
    });

    await renderCalendar();

    expect(screen.getByRole("link", { name: /A show/ }).getAttribute("href")).toBe("/tv?id=a-show-1396");
  });

  it("asks for nothing when nothing is followed", async () => {
    await renderCalendar();

    expect(screen.getByText("Nothing to schedule yet")).toBeDefined();
    expect(getReleaseCalendar).not.toHaveBeenCalled();
  });

  // The regression: a rejected request rendered as a quiet calendar.
  it("tells a failed load apart from an empty calendar", async () => {
    saveOneTitle();
    getReleaseCalendar.mockRejectedValue(new Error("TMDB is down"));
    await renderCalendar();

    expect(screen.getByText("Could not load your calendar")).toBeDefined();
    expect(screen.queryByText("Nothing on the horizon")).toBeNull();
  });

  it("still says the horizon is clear when it really is", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [],
      awaiting: [],
      today: "2026-09-13",
      checked: 1,
      eligible: 1,
    });
    await renderCalendar();

    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
    expect(screen.queryByText("Could not load your calendar")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText(/No upcoming film or episode dates are listed for the titles checked/)).toBeDefined();
    expect(screen.queryByText(/Everything you follow has already been released/)).toBeNull();
  });

  /**
   * The look-ups are capped, so a long list is checked in part. A calendar that
   * presented that part as the whole – including "Nothing on the horizon" for a
   * list it had only half read – was quietly wrong for exactly the visitors who
   * follow the most.
   */
  it("says when some of what is followed was not checked", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [],
      awaiting: [],
      today: "2026-09-13",
      checked: 30,
      eligible: 45,
    });
    await renderCalendar();

    expect(screen.getByRole("note").textContent).toMatch(
      /covers 30 of the 45 followed titles/,
    );
  });

  it("offers a retry instead of a clear horizon when part of a small list could not be checked", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [], awaiting: [], today: "2026-09-13", checked: 2, eligible: 3,
      failedKeys: ["tv-1396"],
    });

    await renderCalendar();

    expect(screen.getByRole("alert").textContent).toContain("Dates for 1 followed title could not be loaded");
    expect(screen.getByRole("button", { name: /Try again/ })).toBeDefined();
    expect(screen.queryByText("Nothing on the horizon")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("keeps available releases visible during a retry and clears the warning after recovery", async () => {
    saveOneTitle();
    const partial = { ...calendarForDay("2026-09-13"), checked: 2, eligible: 3, failedKeys: ["tv-1396"] };
    getReleaseCalendar.mockResolvedValueOnce(partial);
    await renderCalendar();
    expect(screen.getByText("A Film")).toBeDefined();

    let finish!: (value: ReleaseCalendar) => void;
    getReleaseCalendar.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByText("A Film")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Updating release dates");
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();

    await act(async () => { finish({ ...partial, checked: 3, failedKeys: [] }); });
    expect(screen.getByText("A Film")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("reports capped titles separately from lookup failures", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      ...calendarForDay("2026-09-13"), checked: 29, eligible: 45, failedKeys: ["tv-1396"],
    });

    await renderCalendar();

    expect(screen.getByRole("alert").textContent).toContain("Dates for 1 followed title could not be loaded");
    expect(screen.getByRole("note").textContent).toContain("covers 30 of the 45 followed titles");
    expect(screen.getByRole("note").textContent).toContain("remaining 15 titles");
    expect(screen.getByText("A Film")).toBeDefined();
  });

  it("retries partial lookup failures when the connection returns, then stops after recovery", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValueOnce({
      events: [], awaiting: [], today: "2026-09-13", checked: 2, eligible: 3,
      failedKeys: ["tv-1396"],
    });
    getReleaseCalendar.mockResolvedValueOnce({
      events: [], awaiting: [], today: "2026-09-13", checked: 3, eligible: 3,
    });
    await renderCalendar();

    await act(async () => { window.dispatchEvent(new Event("online")); });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Nothing on the horizon")).toBeDefined();

    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
  });

  it("offers a retry that asks again", async () => {
    saveOneTitle();
    getReleaseCalendar.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderCalendar();

    getReleaseCalendar.mockResolvedValueOnce({
      events: [],
      awaiting: [],
      today: "2026-09-13",
      checked: 1,
      eligible: 1,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
  });

  it("reloads on a region change and hides the previous country's dates while loading", async () => {
    saveOneTitle();
    const empty = {
      events: [], awaiting: [], today: "2026-09-13", checked: 1, eligible: 1,
    };
    getReleaseCalendar.mockResolvedValueOnce({
      ...empty,
      events: [{
        key: "movie-550", id: 550, mediaType: "movie", slug: "us-release-550",
        title: "US release", posterPath: null, date: "2026-10-01",
        seasonNumber: null, episodeNumber: null, episodeName: null, stillPath: null,
      }],
    });
    await renderCalendar();
    expect(screen.getByText("US release")).toBeDefined();

    let finish!: (value: typeof empty) => void;
    getReleaseCalendar.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { setRegion("CZ"); });
    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("US release")).toBeNull();
    expect(screen.queryByText("Nothing on the horizon")).toBeNull();

    await act(async () => { finish(empty); });
    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
  });

  it("refreshes dates and relative labels at local midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
    saveOneTitle();
    getReleaseCalendar.mockImplementation(async () => calendarForDay(todayLocal()));
    await renderCalendar();
    expect(screen.getByText("Tomorrow")).toBeDefined();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: /^Today\s*\(1\)$/ })).toBeDefined();
    expect(screen.queryByText("Tomorrow")).toBeNull();
  });

  it("refreshes after a suspended tab returns on a later local day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 10));
    saveOneTitle();
    getReleaseCalendar.mockImplementation(async () => calendarForDay(todayLocal()));
    await renderCalendar();
    expect(screen.getByText("Tomorrow")).toBeDefined();

    await act(async () => {
      vi.setSystemTime(new Date(2026, 9, 6, 8));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: /^Today\s*\(1\)$/ })).toBeDefined();
    expect(screen.queryByText("Tomorrow")).toBeNull();
  });

  it("discards a prior day's slow response after the new day has loaded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
    saveOneTitle();
    let finishOld!: (value: ReleaseCalendar) => void;
    getReleaseCalendar.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    getReleaseCalendar.mockImplementationOnce(async () => calendarForDay(todayLocal()));
    await renderCalendar();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByRole("heading", { name: /^Today\s*\(1\)$/ })).toBeDefined();

    await act(async () => { finishOld(calendarForDay("2026-10-05")); });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: /^Today\s*\(1\)$/ })).toBeDefined();
    expect(screen.queryByText("Tomorrow")).toBeNull();
  });
});

function calendarForDay(today: string): ReleaseCalendar {
  return {
    events: [{
      key: "movie-550", id: 550, mediaType: "movie", slug: "a-film-550",
      title: "A Film", posterPath: null, date: "2026-10-06",
      movieReleaseSource: "primary", seasonNumber: null, episodeNumber: null,
      episodeName: null, stillPath: null,
    }],
    awaiting: [], today, checked: 1, eligible: 1,
  };
}
