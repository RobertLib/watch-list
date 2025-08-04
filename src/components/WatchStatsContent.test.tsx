// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { EPISODE_PROGRESS_STORAGE_KEY } from "@/lib/episode-progress";
import { GOAL_STORAGE_KEY, MAX_GOAL, MIN_GOAL } from "@/lib/goal";
import { WatchStatsContent } from "./WatchStatsContent";
import { TitleFactsLoadError } from "@/lib/stats-data";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey } from "@/lib/profile-storage";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";

/**
 * The page that adds the record up.
 *
 * Two things here are worth pinning. The first is which titles it asks TMDB
 * about: the watched list *plus* every show with ticked episodes that was never
 * marked watched as a whole, deduplicated. That set is the input to a fan-out of
 * cached reads, and getting it wrong is either a series missing from the totals
 * or the same title fetched twice.
 *
 * The second is the goal. It is stored per calendar year, so a target set last
 * year has to read as history rather than as a bar nobody can move – and the
 * bounds are the only thing standing between a typo and a progress bar divided
 * by zero.
 */

const getWatchStatsFacts = vi.fn();

vi.mock("@/lib/api", () => ({
  getWatchStatsFacts: (...args: unknown[]) => getWatchStatsFacts(...args),
}));

vi.mock("@/components/Toast", () => ({
  toast: { showToast: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    // A next/link prop rather than a DOM attribute: React warns when one reaches
    // an <a>, and every link in this app sets it.
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const { toast } = await import("@/components/Toast");

// Local, as the page reads it: a run in Auckland on New Year's morning is in a
// different year from Greenwich, and the page has to agree with itself.
const YEAR = new Date().getFullYear().toString();

function seen(title: string, id: number, overrides = {}) {
  return {
    id,
    title,
    mediaType: "movie",
    posterPath: null,
    voteAverage: 8,
    releaseDate: "1999-10-15",
    watchedAt: `${YEAR}-02-01T00:00:00.000Z`,
    ...overrides,
  };
}

function facts(id: number, mediaType: "movie" | "tv", runtime: number | null) {
  return { id, mediaType, runtime, genres: ["Drama"], year: "1999" };
}

function seed({
  watched = [] as unknown[],
  progress = {} as Record<string, unknown>,
  goal = null as unknown,
} = {}) {
  window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watched));
  window.localStorage.setItem(
    EPISODE_PROGRESS_STORAGE_KEY,
    JSON.stringify(progress),
  );
  if (goal) window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
}

function show(tvId: number, name: string, seasons: Record<string, number[]>) {
  return {
    tvId,
    name,
    posterPath: null,
    seasons,
    updatedAt: `${YEAR}-02-01T00:00:00.000Z`,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <WatchedProvider>
      <EpisodeProgressProvider>{children}</EpisodeProgressProvider>
    </WatchedProvider>
  );
}

async function renderStats() {
  const result = render(<WatchStatsContent />, { wrapper });
  // The stores hydrate in mount effects and the runtimes are fetched after.
  await act(async () => {});
  await act(async () => {});
  return result;
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  getWatchStatsFacts.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("with nothing recorded", () => {
  it("shows the empty state rather than a page of zeroes", async () => {
    seed();
    await renderStats();

    expect(screen.queryByText("Films")).toBeNull();
  });

  /**
   * The spinner keys off the same emptiness the empty state does. Without that,
   * a visitor with nothing recorded waits on a load that is never started.
   */
  it("does not wait on a lookup it never makes", async () => {
    seed();
    await renderStats();

    expect(getWatchStatsFacts).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("which titles it asks TMDB about", () => {
  it("asks about everything on the watched list", async () => {
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 949, mediaType: "movie" },
    ], expect.any(AbortSignal));
  });

  /**
   * A series someone is part-way through was never "watched", but its episodes
   * are the bulk of the hours on this page. Leaving it out was a total that
   * disagreed with the episode count printed beside it.
   */
  it("includes a show with ticked episodes that was never marked watched", async () => {
    seed({
      watched: [seen("Fight Club", 550)],
      progress: { "1438": show(1438, "The Wire", { "1": [1, 2, 3] }) },
    });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 1438, mediaType: "tv" },
    ], expect.any(AbortSignal));
  });

  it("asks once for a show that is both watched and ticked", async () => {
    seed({
      watched: [seen("The Wire", 1438, { mediaType: "tv" })],
      progress: { "1438": show(1438, "The Wire", { "1": [1, 2] }) },
    });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 1438, mediaType: "tv" },
    ], expect.any(AbortSignal));
  });

  it("keeps a film and a show sharing an id apart", async () => {
    seed({
      watched: [seen("Both", 7), seen("Both", 7, { mediaType: "tv" })],
    });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 7, mediaType: "movie" },
      { id: 7, mediaType: "tv" },
    ], expect.any(AbortSignal));
  });

  it("cancels outstanding statistics when the page unmounts", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    getWatchStatsFacts.mockImplementationOnce((_refs: unknown, signal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = await renderStats();
    const signal = getWatchStatsFacts.mock.calls.at(-1)![1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    await act(async () => {});
    expect(signal.aborted).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("the totals", () => {
  it("counts films and series apart", async () => {
    seed({
      watched: [
        seen("Fight Club", 550),
        seen("Heat", 949),
        seen("The Wire", 1438, { mediaType: "tv" }),
      ],
    });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", 139),
      "movie-949": facts(949, "movie", 170),
      "tv-1438": facts(1438, "tv", 60),
    });

    await renderStats();

    const value = (label: string) =>
      screen.getByText(label).previousElementSibling?.textContent;

    expect(value("Films")).toBe("2");
    expect(value("Series")).toBe("1");
  });

  it("counts ticked episodes", async () => {
    seed({
      progress: {
        "1438": show(1438, "The Wire", { "1": [1, 2, 3], "2": [1, 2] }),
      },
    });
    getWatchStatsFacts.mockResolvedValue({ "tv-1438": facts(1438, "tv", 60) });

    await renderStats();

    expect(
      screen.getByText("Episodes").previousElementSibling?.textContent,
    ).toBe("5");
  });

  it.each(["missing facts", "unknown runtime"])(
    "shows the runtime warning for episode-only shows with %s",
    async (caseName) => {
      seed({ progress: { "1438": show(1438, "The Wire", { "1": [1, 2, 3] }) } });
      getWatchStatsFacts.mockResolvedValue(caseName === "missing facts"
        ? {}
        : { "tv-1438": facts(1438, "tv", null) });

      await renderStats();

      expect(screen.getByText("Episodes").previousElementSibling?.textContent).toBe("3");
      expect(screen.getByText(/Watch time excludes 1 title with an unknown runtime/i)).toBeTruthy();
    },
  );

  /**
   * TMDB does not carry a runtime for everything, and a total that quietly
   * omits them reads as precise when it is a floor. Saying so is the whole
   * point of the hint.
   */
  it("says when a runtime was missing, and counts how many", async () => {
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", null),
      "movie-949": facts(949, "movie", null),
    });

    await renderStats();

    expect(screen.getByText(/Watch time excludes 2 titles with an unknown runtime/i)).toBeTruthy();
  });

  it("says 'title' rather than 'titles' when only one was missing", async () => {
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", null),
      "movie-949": facts(949, "movie", 170),
    });

    await renderStats();

    expect(screen.getByText(/Watch time excludes 1 title with an unknown runtime/i)).toBeTruthy();
  });

  it("leaves the hint off when every runtime was known", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", 139),
    });

    await renderStats();

    expect(screen.queryByText(/with an unknown runtime/i)).toBeNull();
  });

  /**
   * The runtimes are an enrichment, not the record. A TMDB outage should cost
   * the watch time and nothing else.
   */
  it("still shows the counts when the lookup failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getWatchStatsFacts.mockRejectedValue(new Error("TMDB is down"));
    seed({ watched: [seen("Fight Club", 550)] });

    await renderStats();

    expect(screen.getByText("Films").previousElementSibling?.textContent).toBe(
      "1",
    );
    expect(screen.getByText(/some statistics could not be updated/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("keeps partial totals visible while retry fills in missing facts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    const saved = window.localStorage.getItem(WATCHED_STORAGE_KEY);
    getWatchStatsFacts.mockRejectedValueOnce(new TitleFactsLoadError(
      { "movie-550": facts(550, "movie", 139) },
      ["movie-949"],
    ));
    await renderStats();

    expect(screen.getByText("Films").previousElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Watch time").previousElementSibling?.textContent).toBe("2 hours");
    expect(screen.getByText(/Details for 1 title could not be loaded/i)).toBeTruthy();

    let finish!: (value: Record<string, ReturnType<typeof facts>>) => void;
    getWatchStatsFacts.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    expect(screen.getByText("Updating title details…")).toBeTruthy();
    expect(screen.getByText("Watch time").previousElementSibling?.textContent).toBe("2 hours");
    await act(async () => {
      finish({
        "movie-550": facts(550, "movie", 139),
        "movie-949": facts(949, "movie", 170),
      });
    });

    expect(screen.getByText("Watch time").previousElementSibling?.textContent).toBe("5 hours");
    expect(screen.queryByText(/some statistics could not be updated/i)).toBeNull();
    expect(screen.queryByText("Updating title details…")).toBeNull();
    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBe(saved);
  });

  it("retains known facts when a later load only resolves different titles", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ watched: [seen("Fight Club", 550)] });
    getWatchStatsFacts.mockResolvedValueOnce({ "movie-550": facts(550, "movie", 139) });
    await renderStats();
    getWatchStatsFacts.mockRejectedValueOnce(new TitleFactsLoadError(
      { "movie-949": facts(949, "movie", 170) },
      ["movie-550"],
    ));

    await act(async () => {
      seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
      window.dispatchEvent(new StorageEvent("storage", { key: WATCHED_STORAGE_KEY }));
    });

    expect(screen.getByText("Watch time").previousElementSibling?.textContent).toBe("5 hours");
    expect(screen.getByText(/some statistics could not be updated/i)).toBeTruthy();
  });

  it("retries incomplete statistics when the connection returns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ watched: [seen("Fight Club", 550)] });
    getWatchStatsFacts.mockRejectedValueOnce(new TitleFactsLoadError({}, ["movie-550"]));
    await renderStats();
    expect(screen.getByText("Watch time").previousElementSibling?.textContent).toBe("no time yet");
    getWatchStatsFacts.mockResolvedValueOnce({ "movie-550": facts(550, "movie", 139) });

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(getWatchStatsFacts).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Watch time").previousElementSibling?.textContent).toBe("2 hours");
    expect(screen.queryByText(/some statistics could not be updated/i)).toBeNull();
  });

  it("does not offer an outage retry for genuinely missing title metadata", async () => {
    seed({ watched: [seen("Removed title", 404)] });
    getWatchStatsFacts.mockResolvedValueOnce({});
    await renderStats();

    expect(screen.getByText(/Watch time excludes 1 title with an unknown runtime/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(getWatchStatsFacts).toHaveBeenCalledTimes(1);
  });
});

describe("the selected review year", () => {
  it.each(["profile switch", "history removal"])("keeps the picker, summary and share text consistent after a %s", async (change) => {
    const previousYear = String(Number(YEAR) - 1);
    const currentFilm = seen("Fight Club", 550);
    const oldFilm = seen("Heat", 949, { watchedAt: `${previousYear}-02-01T00:00:00.000Z` });
    seed({ watched: [currentFilm, oldFilm] });
    await renderStats();
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: previousYear } });
    expect(screen.getByRole("heading", { name: `${previousYear} in review` })).toBeTruthy();

    const incoming = change === "profile switch"
      ? [currentFilm, seen("Star Wars", 11)]
      : [currentFilm];
    await act(async () => {
      seed({ watched: incoming });
      if (change === "profile switch") {
        window.localStorage.setItem("active-profile", "second");
        window.dispatchEvent(new StorageEvent("storage", { key: "active-profile" }));
      }
      window.dispatchEvent(new StorageEvent("storage", { key: WATCHED_STORAGE_KEY }));
    });

    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe(YEAR);
    expect(screen.queryByRole("heading", { name: `${previousYear} in review` })).toBeNull();
    const review = screen.getByRole("heading", { name: `${YEAR} in review` }).closest("section")!;
    expect(within(review).getByText(/You finished/).textContent).toContain(
      `${incoming.length} title${incoming.length === 1 ? "" : "s"}`,
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await act(async () => {
      fireEvent.click(within(review).getByRole("button", { name: "Share" }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(
      `${YEAR} in review\n🎬 ${incoming.length} film${incoming.length === 1 ? "" : "s"}`,
    ));
  });
});

describe("the yearly goal", () => {
  it.each([
    { refresh: "midnight", saved: true },
    { refresh: "midnight", saved: false },
    { refresh: "resuming the tab", saved: true },
    { refresh: "resuming the tab", saved: false },
  ])("uses the new calendar year after $refresh (saved goal: $saved)", async ({ refresh, saved }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
    const goal = saved ? { year: "2026", target: 40 } : null;
    seed({
      watched: [seen("Fight Club", 550, {
        watchedAt: new Date(2026, 11, 31, 12).toISOString(),
      })],
      goal,
    });
    await renderStats();
    expect(screen.getByRole("heading", {
      name: saved ? "2026 goal" : "Set a target for 2026",
    })).toBeTruthy();

    await act(async () => {
      if (refresh === "midnight") {
        await vi.advanceTimersByTimeAsync(2_000);
      } else {
        vi.setSystemTime(new Date(2027, 0, 1, 12));
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });

    expect(screen.getByRole("heading", { name: "Set a target for 2027" })).toBeTruthy();
    expect(screen.getByText(/You have finished 0 so far this year/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null")).toEqual(goal);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set goal" })); });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY)!)).toEqual({ year: "2027", target: 52 });
    expect(screen.getByText("of 52").parentElement?.textContent).toBe("0 of 52");
    expect(getWatchStatsFacts).toHaveBeenCalledTimes(1);
  });

  it("updates the daily goal pace at midnight without reloading title facts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 23, 59, 59));
    seed({
      watched: [seen("Fight Club", 550, {
        watchedAt: new Date(2026, 0, 1, 12).toISOString(),
      })],
      goal: { year: "2026", target: 365 },
    });
    await renderStats();
    expect(screen.getByText("364 to go, and you are ahead of pace.")).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.getByText("364 to go – on pace you would be at 2 by now.")).toBeTruthy();
    expect(getWatchStatsFacts).toHaveBeenCalledTimes(1);
  });

  it.each(["set", "clear"])("cancels a queued goal %s when the statistics page is unmounted", async (action) => {
    const saved = action === "clear" ? { year: YEAR, target: 52 } : null;
    seed({ watched: [seen("Fight Club", 550)], goal: saved });
    const view = await renderStats();
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();

    act(() => { fireEvent.click(screen.getByRole("button", { name: action === "set" ? "Set goal" : "Clear" })); });
    view.unmount();
    await act(async () => { release(); await held; });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null")).toEqual(saved);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it.each(["set", "clear"])("waits for the shared lock before a goal %s and ignores repeated actions", async (action) => {
    const saved = action === "clear" ? { year: YEAR, target: 52 } : null;
    seed({ watched: [seen("Fight Club", 550)], goal: saved });
    await renderStats();
    if (action === "set") {
      fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), { target: { value: "40" } });
    }
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    const requests = vi.spyOn(navigator.locks, "request");
    const button = screen.getByRole("button", { name: action === "set" ? "Set goal" : "Clear" });

    act(() => { fireEvent.click(button); fireEvent.click(button); });

    expect(requests).toHaveBeenCalledExactlyOnceWith(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, expect.any(Function));
    const pending = screen.getByRole("button", { name: action === "set" ? "Saving…" : "Clearing…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    if (action === "set") {
      const field = screen.getByLabelText(`Titles to watch in ${YEAR}`) as HTMLInputElement;
      expect(field.disabled).toBe(true);
      act(() => { fireEvent.submit(field.closest("form")!); });
      expect(requests).toHaveBeenCalledTimes(1);
    }
    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null")).toEqual(saved);

    await act(async () => { release(); await held; });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null"))
      .toEqual(action === "set" ? { year: YEAR, target: 40 } : null);
    expect(screen.queryByRole("button", { name: action === "set" ? "Saving…" : "Clearing…" })).toBeNull();
  });

  it.each(["set", "clear"])("rechecks the displayed owner after a goal %s waits behind a profile switch", async (action) => {
    const saved = action === "clear" ? { year: YEAR, target: 52 } : null;
    seed({ watched: [seen("Fight Club", 550)], goal: saved });
    initializeProfileStorage();
    const bobGoal = { year: YEAR, target: 10 };
    const bobKey = profileStoreKey(GOAL_STORAGE_KEY, "bob");
    window.localStorage.setItem(bobKey, JSON.stringify(bobGoal));
    await renderStats();
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();

    act(() => { fireEvent.click(screen.getByRole("button", { name: action === "set" ? "Set goal" : "Clear" })); });
    // The tab holding the lock switches profiles before delivering its storage
    // event. The queued action still belongs to the previously displayed owner.
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    await act(async () => { release(); await held; });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null")).toEqual(saved);
    expect(JSON.parse(window.localStorage.getItem(bobKey)!)).toEqual(bobGoal);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Your active profile changed. Review the current goal and try again.", "info",
    );
  });

  it.each([
    ["set", "unavailable"], ["clear", "unavailable"],
    ["set", "refused"], ["clear", "refused"],
  ])("keeps the stored goal after %s when the lock is %s", async (action, failure) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const saved = action === "clear" ? { year: YEAR, target: 52 } : null;
    seed({ watched: [seen("Fight Club", 550)], goal: saved });
    await renderStats();
    if (failure === "unavailable") vi.stubGlobal("navigator", {});
    else vi.spyOn(navigator.locks, "request").mockRejectedValue(new DOMException("Lock denied", "SecurityError"));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: action === "set" ? "Set goal" : "Clear" })); });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null")).toEqual(saved);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      action === "set" ? "Could not save your goal. Please try again." : "Could not clear your goal. Please try again.", "error",
    );
    expect((screen.getByRole("button", { name: action === "set" ? "Set goal" : "Clear" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["set", "clear"])("keeps a goal %s with its displayed owner when the pointer changes after its guard", async (action) => {
    initializeProfileStorage();
    seed({ watched: [seen("Fight Club", 550)], goal: action === "clear" ? { year: YEAR, target: 52 } : null });
    const bobGoal = { year: YEAR, target: 10 };
    const bobKey = profileStoreKey(GOAL_STORAGE_KEY, "bob");
    window.localStorage.setItem(bobKey, JSON.stringify(bobGoal));
    await renderStats();
    if (action === "set") {
      fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), { target: { value: "40" } });
    }
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === GOAL_STORAGE_KEY) setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      setItem.call(this, key, value);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
      if (key === GOAL_STORAGE_KEY) setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      removeItem.call(this, key);
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: action === "set" ? "Set goal" : "Clear" })); });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "null"))
      .toEqual(action === "set" ? { year: YEAR, target: 40 } : null);
    expect(JSON.parse(window.localStorage.getItem(bobKey)!)).toEqual(bobGoal);
  });

  it.each(["clear", "set"])(
    "refuses to %s a goal after an external switch before storage events",
    async (action) => {
      seed({
        watched: [seen("Fight Club", 550)],
        goal: action === "clear" ? { year: YEAR, target: 52 } : null,
      });
      await renderStats();
      if (action === "set") {
        fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), {
          target: { value: "40" },
        });
      }

      const incomingGoal = { year: YEAR, target: 10 };
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "second");
      window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(incomingGoal));
      await act(async () => { fireEvent.click(screen.getByRole("button", {
        name: action === "clear" ? "Clear" : "Set goal",
      })); });

      expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY)!)).toEqual(incomingGoal);
      expect(toast.showToast).toHaveBeenCalledWith(
        "Your active profile changed. Review the current goal and try again.",
        "info",
      );

      await act(async () => {
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      });
      expect(screen.getByText("of 10")).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });
      expect(window.localStorage.getItem(GOAL_STORAGE_KEY)).toBeNull();
    },
  );

  it.each([null, { year: String(Number(YEAR) - 1), target: 52 }])(
    "resets an unfinished target when only the profile changes (goal: %j)",
    async (goal) => {
      seed({ watched: [seen("Fight Club", 550)], goal });
      await renderStats();
      fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), {
        target: { value: "40" },
      });

      await act(async () => {
        // Equal goal data need not produce a goal-key storage event.
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "second");
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      });

      expect((screen.getByLabelText(`Titles to watch in ${YEAR}`) as HTMLInputElement).value).toBe("52");
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set goal" })); });
      expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY)!)).toEqual({ year: YEAR, target: 52 });
    },
  );

  it("resets the old draft when a render discovers a switch before its storage event", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    const view = await renderStats();
    fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), {
      target: { value: "40" },
    });

    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "second");
    view.rerender(<WatchStatsContent />);

    expect((screen.getByLabelText(`Titles to watch in ${YEAR}`) as HTMLInputElement).value).toBe("52");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set goal" })); });
    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY)!)).toEqual({ year: YEAR, target: 52 });
  });

  it("follows a goal changed or cleared in another tab", async () => {
    seed({ watched: [seen("Fight Club", 550)], goal: { year: YEAR, target: 52 } });
    await renderStats();
    expect(screen.getByText("of 52")).toBeTruthy();

    act(() => {
      window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify({ year: YEAR, target: 10 }));
      window.dispatchEvent(new StorageEvent("storage", { key: GOAL_STORAGE_KEY }));
    });
    expect(screen.getByText("of 10")).toBeTruthy();
    expect(screen.queryByText("of 52")).toBeNull();

    act(() => {
      window.localStorage.removeItem(GOAL_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: GOAL_STORAGE_KEY }));
    });
    expect(screen.getByText(`Set a target for ${YEAR}`)).toBeTruthy();
  });

  it("uses the new profile's target alongside its history after an external switch", async () => {
    seed({ watched: [seen("Fight Club", 550)], goal: { year: YEAR, target: 52 } });
    await renderStats();

    await act(async () => {
      window.localStorage.setItem("active-profile", "second");
      window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([
        seen("Heat", 949), seen("Alien", 348),
      ]));
      window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify({ year: YEAR, target: 10 }));
      for (const key of [WATCHED_STORAGE_KEY, GOAL_STORAGE_KEY, "active-profile"]) {
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    });

    expect(screen.getByText("of 10").parentElement?.textContent).toBe("2 of 10");
    expect(screen.queryByText("of 52")).toBeNull();
  });

  it("offers to set one when there is none", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    expect(screen.getByText(`Set a target for ${YEAR}`)).toBeTruthy();
  });

  it("saves a target that is in range", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), {
        target: { value: "40" },
      });
      fireEvent.click(screen.getByRole("button", { name: /set goal/i }));
    });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "{}")).toEqual(
      { year: YEAR, target: 40 },
    );
  });

  it("keeps the goal form and draft when saving a target fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();
    const original = Storage.prototype.setItem;
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === GOAL_STORAGE_KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
      original.call(this, key, value);
    });
    const field = screen.getByLabelText(`Titles to watch in ${YEAR}`);
    fireEvent.change(field, { target: { value: "40" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set goal" })); });

    expect(window.localStorage.getItem(GOAL_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(`Set a target for ${YEAR}`)).toBeTruthy();
    expect((screen.getByLabelText(`Titles to watch in ${YEAR}`) as HTMLInputElement).value).toBe("40");
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not save your goal. Please try again.",
      "error",
    );

    writes.mockRestore();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Set goal" })); });
    expect(screen.getByText(`${YEAR} goal`)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "{}")).toEqual({ year: YEAR, target: 40 });
  });

  it("keeps the saved goal visible when clearing it fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const saved = { year: YEAR, target: 52 };
    seed({ watched: [seen("Fight Club", 550)], goal: saved });
    await renderStats();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "{}")).toEqual(saved);
    expect(screen.getByText(`${YEAR} goal`)).toBeTruthy();
    expect(screen.queryByText(`Set a target for ${YEAR}`)).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not clear your goal. Please try again.",
      "error",
    );
  });

  /**
   * The bounds are declared on the input itself, which is the first line: the
   * browser refuses to submit a number outside them and the handler below is
   * never reached. Worth pinning because it is why the handler's own check looks
   * untested – remove these attributes and the only thing left is the backstop.
   */
  it("declares the bounds on the field, so the browser enforces them too", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    const field = screen.getByLabelText(`Titles to watch in ${YEAR}`);
    expect(field.getAttribute("min")).toBe(String(MIN_GOAL));
    expect(field.getAttribute("max")).toBe(String(MAX_GOAL));
  });

  /**
   * And the backstop, exercised the way anything that gets past the attributes
   * would arrive: a submit that did not come from clicking the button, which is
   * what a scripted submit or a browser skipping constraint validation looks
   * like. Without this the only thing between a typo and a progress bar divided
   * by a target of zero is markup.
   */
  it.each([
    ["zero", String(MIN_GOAL - 1)],
    ["past the cap", String(MAX_GOAL + 1)],
    ["not a whole number", "12.5"],
    ["empty", ""],
  ])("refuses a target that is %s even when the field did not stop it", async (
    _label,
    value,
  ) => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    const field = screen.getByLabelText(`Titles to watch in ${YEAR}`);
    await act(async () => {
      fireEvent.change(field, { target: { value } });
      fireEvent.submit(field.closest("form")!);
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      `Pick a number between ${MIN_GOAL} and ${MAX_GOAL}`,
      "error",
    );
    expect(window.localStorage.getItem(GOAL_STORAGE_KEY)).toBeNull();
  });

  /**
   * A target belongs to a calendar year. Last year's is history, and showing it
   * as a live bar is a number that can never be moved again.
   */
  it("asks for a new target when the stored one is last year's", async () => {
    seed({
      watched: [seen("Fight Club", 550)],
      goal: { year: String(Number(YEAR) - 1), target: 52 },
    });
    await renderStats();

    expect(screen.getByText(`Set a target for ${YEAR}`)).toBeTruthy();
  });

  it("shows this year's target as a live one", async () => {
    seed({
      watched: [seen("Fight Club", 550)],
      goal: { year: YEAR, target: 52 },
    });
    await renderStats();

    expect(screen.queryByText(`Set a target for ${YEAR}`)).toBeNull();
  });
});
