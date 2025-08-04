// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WelcomeBack } from "./WelcomeBack";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { EPISODE_PROGRESS_STORAGE_KEY } from "@/lib/episode-progress";
import { LAST_VISIT_STORAGE_KEY } from "@/lib/last-visit";
import { refreshSettings, REGION_KEY, setRegion } from "@/lib/settings";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY } from "@/lib/profiles";
import { writeProfileStore } from "@/lib/profile-storage";
import { todayLocal } from "@/lib/dates";
import { createProfileLockManager } from "@/test/profile-locks";
import type { MissedRelease } from "@/lib/since-last-visit-data";
import type { MovieReleaseSource } from "@/lib/release-calendar";

const { getReleasesSinceLastVisit } = vi.hoisted(() => ({
  getReleasesSinceLastVisit: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getReleasesSinceLastVisit }));
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

const ORIGINAL_TZ = process.env.TZ;
const NOW = new Date("2026-10-05T12:00:00.000Z");

function saveVisit(previous = "2026-10-01T12:00:00.000Z") {
  window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, previous);
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
    id: 550, title: "A Film", mediaType: "movie", posterPath: null,
    voteAverage: 8, releaseDate: "2026-10-03", addedAt: previous,
  }]));
}

function saveProgress() {
  window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify({
    "1396": {
      tvId: 1396, name: "A Show", posterPath: null,
      seasons: { "1": [1] }, updatedAt: "2026-10-01T12:00:00.000Z",
    },
  }));
}

function release(title: string, source: MovieReleaseSource = "primary"): MissedRelease {
  return {
    key: "movie-550", id: 550, mediaType: "movie", slug: "a-film-550",
    title, posterPath: null, date: "2026-10-03", seasonNumber: null,
    episodeNumber: null, episodeName: null, movieReleaseSource: source,
  };
}

async function renderWelcomeBack() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <WatchlistProvider>
        <EpisodeProgressProvider>
          <WelcomeBack />
        </EpisodeProgressProvider>
      </WatchlistProvider>,
    );
  });
  return view;
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  window.sessionStorage.clear();
  refreshSettings();
  getReleasesSinceLastVisit.mockReset().mockResolvedValue([]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("WelcomeBack", () => {
  it("keeps the original interval while loading and after an abandoned response", async () => {
    saveVisit();
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

    const view = await renderWelcomeBack();
    const signal = getReleasesSinceLastVisit.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
    view.unmount();
    expect(signal.aborted).toBe(true);

    await act(async () => { finish([release("An abandoned response")]); });
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
  });

  it.each(["region", "watchlist", "profile"])("cancels the old lookup after a %s change without acknowledging it", async (change) => {
    saveVisit();
    if (change === "profile") {
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
      ]));
      writeProfileStore(WATCHLIST_STORAGE_KEY, window.localStorage.getItem(WATCHLIST_STORAGE_KEY)!, "bob");
    }
    const requests: Array<{ signal: AbortSignal; finish: (value: MissedRelease[]) => void }> = [];
    getReleasesSinceLastVisit.mockImplementation((_seeds, _since, signal: AbortSignal) =>
      new Promise<MissedRelease[]>((resolve, reject) => {
        requests.push({ signal, finish: resolve });
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );
    await renderWelcomeBack();
    expect(requests).toHaveLength(1);

    await act(async () => {
      if (change === "region") setRegion("CZ");
      else if (change === "watchlist") {
        window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
          id: 680, title: "Another film", mediaType: "movie", posterPath: null,
          voteAverage: 8, releaseDate: "2026-10-02", addedAt: "2026-01-02T00:00:00.000Z",
        }]));
        window.dispatchEvent(new StorageEvent("storage", { key: WATCHLIST_STORAGE_KEY }));
      } else {
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      }
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal).not.toBe(requests[0].signal);
    expect(requests[1].signal.aborted).toBe(false);
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(console.error).not.toHaveBeenCalled();

    await act(async () => { requests[1].finish([release("Current premiere")]); });

    expect(screen.getByText("Current premiere")).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("cancels a pending lookup when unmounted without reporting an outage", async () => {
    saveVisit();
    getReleasesSinceLastVisit.mockImplementation((_seeds, _since, signal: AbortSignal) =>
      new Promise<MissedRelease[]>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    );
    const view = await renderWelcomeBack();
    const signal = getReleasesSinceLastVisit.mock.calls[0][2] as AbortSignal;

    await act(async () => { view.unmount(); });

    expect(signal.aborted).toBe(true);
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("preserves an unchecked visit on failure and acknowledges a successful retry", async () => {
    saveVisit();
    getReleasesSinceLastVisit.mockRejectedValueOnce(new Error("TMDB is down"));

    await renderWelcomeBack();
    expect(screen.getByRole("heading", { name: "Could not load recent releases" })).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");

    getReleasesSinceLastVisit.mockResolvedValueOnce([release("Recovered premiere")]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });

    expect(screen.getByText("Recovered premiere")).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("rechecks the original interval after a failed session closes", async () => {
    saveVisit();
    getReleasesSinceLastVisit.mockRejectedValueOnce(new Error("TMDB is down"));
    const view = await renderWelcomeBack();
    const originalDay = getReleasesSinceLastVisit.mock.calls[0][1];
    view.unmount();
    window.sessionStorage.clear();
    const nextVisit = new Date("2026-10-06T12:00:00.000Z");
    vi.setSystemTime(nextVisit);
    getReleasesSinceLastVisit.mockResolvedValueOnce([release("Previously missed premiere")]);

    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(expect.any(Array), originalDay, expect.any(AbortSignal));
    expect(screen.getByText("Previously missed premiere")).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(nextVisit.toISOString());
  });

  it("retries an unchecked interval when the connection returns", async () => {
    saveVisit();
    getReleasesSinceLastVisit.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderWelcomeBack();
    getReleasesSinceLastVisit.mockResolvedValueOnce([release("Recovered online")]);

    await act(async () => { window.dispatchEvent(new Event("online")); });

    expect(screen.getByText("Recovered online")).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("acknowledges a successful empty lookup", async () => {
    saveVisit();
    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [WATCHLIST_STORAGE_KEY, false],
    [WATCHLIST_STORAGE_KEY, true],
    [EPISODE_PROGRESS_STORAGE_KEY, false],
    [EPISODE_PROGRESS_STORAGE_KEY, true],
  ] as const)("retains the interval when %s is unreadable and another source has titles: %s", async (key, partial) => {
    saveVisit();
    saveProgress();
    const saved = window.localStorage.getItem(key)!;
    window.localStorage.setItem(key, saved.slice(0, -1));
    const otherKey = key === WATCHLIST_STORAGE_KEY ? EPISODE_PROGRESS_STORAGE_KEY : WATCHLIST_STORAGE_KEY;
    if (!partial) window.localStorage.removeItem(otherKey);

    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
    expect(screen.getByRole("alert").textContent).toContain("Your saved titles could not be read");

    // Retry also adopts a repaired source when no storage event arrived.
    window.localStorage.setItem(key, saved);
    getReleasesSinceLastVisit.mockResolvedValueOnce([release("Recovered premiere")]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });

    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(expect.any(Array), todayLocal(new Date("2026-10-01T12:00:00.000Z")), expect.any(AbortSignal));
    expect(screen.getByText("Recovered premiere")).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it.each([WATCHLIST_STORAGE_KEY, EPISODE_PROGRESS_STORAGE_KEY])("reloads all followed titles after a temporary %s read failure", async (key) => {
    saveVisit();
    saveProgress();
    const read = Storage.prototype.getItem;
    let refused = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, requested: string) {
      if (this === window.localStorage && requested === key && !refused) {
        refused = true;
        throw new DOMException("Temporary read refusal", "SecurityError");
      }
      return read.call(this, requested);
    });
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

    await renderWelcomeBack();

    expect(refused).toBe(true);
    expect(getReleasesSinceLastVisit).toHaveBeenCalledTimes(1);
    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(expect.arrayContaining([
      { id: 550, mediaType: "movie", title: "A Film", posterPath: null, releaseDate: "2026-10-03" },
      { id: 1396, mediaType: "tv", title: "A Show", posterPath: null, releaseDate: null },
    ]), todayLocal(new Date("2026-10-01T12:00:00.000Z")), expect.any(AbortSignal));
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");

    await act(async () => { finish([release("Checked complete follow list")]); });

    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it.each([WATCHLIST_STORAGE_KEY, EPISODE_PROGRESS_STORAGE_KEY])("checks the original interval in a new session after repairing %s", async (key) => {
    saveVisit();
    saveProgress();
    const saved = window.localStorage.getItem(key)!;
    window.localStorage.setItem(key, saved.slice(0, -1));
    const view = await renderWelcomeBack();
    view.unmount();
    window.sessionStorage.clear();
    window.localStorage.setItem(key, saved);
    const nextVisit = new Date("2026-10-06T12:00:00.000Z");
    vi.setSystemTime(nextVisit);

    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(expect.any(Array), todayLocal(new Date("2026-10-01T12:00:00.000Z")), expect.any(AbortSignal));
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(nextVisit.toISOString());
  });

  it.each([WATCHLIST_STORAGE_KEY, EPISODE_PROGRESS_STORAGE_KEY])("does not acknowledge a changed %s before its storage event arrives", async (key) => {
    saveVisit();
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderWelcomeBack();
    if (key === WATCHLIST_STORAGE_KEY) {
      window.localStorage.setItem(key, JSON.stringify([{
        id: 680, title: "Another film", mediaType: "movie", posterPath: null,
        voteAverage: 8, releaseDate: "2026-10-02", addedAt: "2026-10-01T12:00:00.000Z",
      }]));
    } else {
      saveProgress();
    }
    getReleasesSinceLastVisit.mockImplementation(() => new Promise(() => {}));

    await act(async () => { finish([release("Stale premiere")]); });

    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
    expect(screen.queryByText("Stale premiere")).toBeNull();
  });

  it.each([WATCHLIST_STORAGE_KEY, EPISODE_PROGRESS_STORAGE_KEY])("retains the interval when %s becomes unreadable before completion", async (key) => {
    saveVisit();
    saveProgress();
    const saved = window.localStorage.getItem(key)!;
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderWelcomeBack();
    window.localStorage.setItem(key, saved.slice(0, -1));

    await act(async () => { finish([release("Incomplete result")]); });

    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
    expect(screen.getByRole("alert").textContent).toContain("Your saved titles could not be read");
    expect(screen.queryByText("Incomplete result")).toBeNull();

    getReleasesSinceLastVisit.mockResolvedValueOnce([release("Repaired source premiere")]);
    await act(async () => {
      window.localStorage.setItem(key, saved);
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });

    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(expect.any(Array), todayLocal(new Date("2026-10-01T12:00:00.000Z")), expect.any(AbortSignal));
    expect(screen.getByText("Repaired source premiere")).toBeDefined();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("acknowledges the same followed shows when activity changes their order", async () => {
    saveVisit();
    saveProgress();
    const progress = JSON.parse(window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY)!);
    progress["1399"] = {
      tvId: 1399, name: "Another show", posterPath: null,
      seasons: { "1": [1] }, updatedAt: "2026-10-04T12:00:00.000Z",
    };
    window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderWelcomeBack();
    progress["1396"].updatedAt = NOW.toISOString();
    window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));

    await act(async () => { finish([]); });

    expect(getReleasesSinceLastVisit).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it.each(["first visit", "short gap", "nothing followed"])("records %s without a catalogue lookup", async (scenario) => {
    if (scenario === "short gap") saveVisit("2026-10-05T11:00:00.000Z");
    if (scenario === "nothing followed") {
      saveVisit();
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, "[]");
    }

    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("keeps the original session interval after leaving home and returning", async () => {
    saveVisit();
    const view = await renderWelcomeBack();
    const originalDay = getReleasesSinceLastVisit.mock.calls[0][1];
    view.unmount();
    vi.setSystemTime(new Date("2026-10-05T13:00:00.000Z"));

    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(expect.any(Array), originalDay, expect.any(AbortSignal));
    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it.each(["region", "profile"])("does not acknowledge a stale %s before its storage event arrives", async (change) => {
    saveVisit();
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderWelcomeBack();
    if (change === "region") {
      window.localStorage.setItem(REGION_KEY, "CZ");
    } else {
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
      ]));
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    }

    await act(async () => { finish([release("Stale premiere")]); });

    expect(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
  });

  it.each([
    ["regional-theatrical", "In cinemas", "Release date"],
    ["primary", "Release date", "In cinemas"],
  ] as const)("labels a missed film release from %s accurately", async (source, label, absentLabel) => {
    saveVisit();
    getReleasesSinceLastVisit.mockResolvedValue([release("A Film", source)]);

    await renderWelcomeBack();

    expect(screen.getByText(label)).toBeDefined();
    expect(screen.queryByText(absentLabel)).toBeNull();
  });

  it("does not keep removed titles visible when the replacement lookup fails", async () => {
    saveVisit();
    getReleasesSinceLastVisit.mockResolvedValueOnce([release("Previous profile's premiere")]);
    await renderWelcomeBack();
    expect(screen.getByText("Previous profile's premiere")).toBeDefined();

    let fail!: (error: Error) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await act(async () => {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
        id: 680, title: "Another film", mediaType: "movie", posterPath: null,
        voteAverage: 8, releaseDate: "2026-10-02", addedAt: "2026-01-02T00:00:00.000Z",
      }]));
      window.dispatchEvent(new StorageEvent("storage", { key: WATCHLIST_STORAGE_KEY }));
    });
    expect(screen.queryByText("Previous profile's premiere")).toBeNull();

    await act(async () => { fail(new Error("TMDB is down")); });
    expect(screen.queryByText("Previous profile's premiere")).toBeNull();
  });

  it.each([
    ["Europe/Prague", "2026-09-30T22:30:00.000Z", "2026-10-01"],
    ["America/Los_Angeles", "2026-10-01T03:30:00.000Z", "2026-09-30"],
  ])("starts the interval on the previous visit's local day in %s", async (zone, previous, localDay) => {
    process.env.TZ = zone;
    saveVisit(previous);

    await renderWelcomeBack();

    expect(getReleasesSinceLastVisit).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ id: 550, mediaType: "movie", title: "A Film", posterPath: null, releaseDate: "2026-10-03" }]),
      localDay,
      expect.any(AbortSignal),
    );
  });

  it("reloads on a region change and hides the old region while loading", async () => {
    saveVisit();
    getReleasesSinceLastVisit.mockResolvedValueOnce([release("US premiere")]);
    await renderWelcomeBack();
    expect(screen.getByText("US premiere")).toBeDefined();

    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { setRegion("CZ"); });

    expect(getReleasesSinceLastVisit).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("US premiere")).toBeNull();

    await act(async () => { finish([release("CZ premiere")]); });
    expect(screen.getByText("CZ premiere")).toBeDefined();
  });

  it("ignores a previous region's response that finishes after the new region", async () => {
    saveVisit();
    let finish!: (value: MissedRelease[]) => void;
    getReleasesSinceLastVisit.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await renderWelcomeBack();

    getReleasesSinceLastVisit.mockResolvedValueOnce([release("CZ premiere")]);
    await act(async () => { setRegion("CZ"); });
    expect(screen.getByText("CZ premiere")).toBeDefined();

    await act(async () => { finish([release("US premiere")]); });
    expect(screen.queryByText("US premiere")).toBeNull();
    expect(screen.getByText("CZ premiere")).toBeDefined();
  });
});
