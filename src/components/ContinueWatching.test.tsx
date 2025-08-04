// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import {
  EPISODE_PROGRESS_STORAGE_KEY,
  getEpisodeProgress,
  isEpisodeWatched,
} from "@/lib/episode-progress";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { getContinueWatching } from "@/lib/api";
import { sanitizeContinueWatchingSeeds, type UpNextEpisode } from "@/lib/continue-watching";
import { getContinueWatchingEpisodes } from "@/lib/continue-watching-data";
import { getCachedSeasonDetails, getCachedTVShowDetails } from "@/lib/tmdb-cache";
import type { SeasonDetails, TVShowDetails } from "@/types/tmdb";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY } from "@/lib/profiles";
import { readProfileStore, writeProfileStore } from "@/lib/profile-storage";
import { toast } from "./Toast";
import { ContinueWatching } from "./ContinueWatching";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";

vi.mock("@/lib/api", () => ({ getContinueWatching: vi.fn() }));
vi.mock("@/lib/tmdb-cache", () => ({
  getCachedSeasonDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
}));
vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

function episode(episodeNumber: number): UpNextEpisode {
  return {
    tvId: 1396,
    slug: "breaking-bad-1396",
    showName: "Breaking Bad",
    posterPath: null,
    seasonNumber: 1,
    episodeNumber,
    episodeName: null,
    stillPath: null,
    airDate: null,
    runtime: 45,
    watchedCount: episodeNumber - 1,
    airedCount: 7,
  };
}

async function renderSection() {
  const view = render(
    <EpisodeProgressProvider>
      <ContinueWatching />
    </EpisodeProgressProvider>,
  );
  await act(async () => vi.advanceTimersByTimeAsync(500));
  return view;
}

async function renderRow() {
  await renderSection();
  return screen.getByRole("button", {
    name: "Mark Breaking Bad S01E02 as watched",
  }) as HTMLButtonElement;
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.localStorage.clear();
  const initialProgress = JSON.stringify({
    "1396": {
      tvId: 1396,
      name: "Breaking Bad",
      posterPath: null,
      seasons: { "1": [1] },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, initialProgress, "default");
  writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, initialProgress, "bob");
  vi.mocked(getContinueWatching).mockReset().mockResolvedValue([episode(2)]);
  vi.mocked(getCachedTVShowDetails).mockReset();
  vi.mocked(getCachedSeasonDetails).mockReset();
  vi.mocked(toast.showToast).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("ContinueWatching cancellation", () => {
  it("cancels the debounce before starting a request when the row unmounts", async () => {
    const view = render(
      <EpisodeProgressProvider>
        <ContinueWatching />
      </EpisodeProgressProvider>,
    );
    view.unmount();

    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(getContinueWatching).not.toHaveBeenCalled();
  });

  it.each(["unmount", "profile switch", "progress change", "day change"])(
    "aborts a started lookup after %s without showing an outage",
    async (change) => {
      vi.setSystemTime(new Date(2026, 9, 4, 12));
      vi.mocked(getContinueWatching).mockImplementationOnce((_input, signal) =>
        new Promise((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
        }),
      );
      const view = await renderSection();
      const previousSignal = vi.mocked(getContinueWatching).mock.calls[0][1]!;
      expect(previousSignal.aborted).toBe(false);

      act(() => {
        if (change === "unmount") view.unmount();
        else if (change === "profile switch") {
          window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
          window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY, newValue: "bob" }));
        } else if (change === "progress change") {
          const progress = getEpisodeProgress();
          progress["1396"].seasons["1"] = [1, 2];
          writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
          window.dispatchEvent(new StorageEvent("storage", { key: EPISODE_PROGRESS_STORAGE_KEY }));
        } else {
          vi.setSystemTime(new Date(2026, 9, 5, 9));
          vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });
      expect(previousSignal.aborted).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(500));

      expect(screen.queryByRole("alert")).toBeNull();
      expect(console.error).not.toHaveBeenCalled();
      expect(getContinueWatching).toHaveBeenCalledTimes(change === "unmount" ? 1 : 2);
      if (change !== "unmount") {
        const currentSignal = vi.mocked(getContinueWatching).mock.calls[1][1]!;
        expect(currentSignal).not.toBe(previousSignal);
        expect(currentSignal.aborted).toBe(false);
      }
    },
  );
});

describe("ContinueWatching load recovery", () => {
  it("sends older tracked shows so completed recent shows cannot crowd them out", async () => {
    window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(
      Object.fromEntries(Array.from({ length: 13 }, (_, index) => [index + 1, {
        tvId: index + 1,
        name: `Show ${index + 1}`,
        posterPath: null,
        seasons: { "1": index < 12 ? [1, 2, 3] : [1] },
        updatedAt: `2026-01-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`,
      }])),
    ));
    vi.mocked(getContinueWatching).mockImplementation(async (input) => {
      const shows = input as Array<{ tvId: number }>;
      return shows.some((show) => show.tvId === 13)
        ? [{ ...episode(2), tvId: 13, showName: "Show 13" }]
        : [];
    });

    await renderSection();

    expect(vi.mocked(getContinueWatching).mock.calls[0][0]).toHaveLength(13);
    expect(screen.getByRole("button", { name: "Mark Show 13 S01E02 as watched" })).toBeTruthy();
  });

  it("shows a retry notice after an outage and restores the row when retried", async () => {
    vi.mocked(getContinueWatching).mockRejectedValueOnce(new Error("TMDB unavailable"));
    await renderSection();

    expect(screen.getByRole("alert").textContent).toContain("Could not load Continue Watching");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(getContinueWatching).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })).toBeTruthy();
  });

  it("retries a failed row when the browser comes back online", async () => {
    vi.mocked(getContinueWatching).mockRejectedValueOnce(new Error("Offline"));
    await renderSection();

    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(getContinueWatching).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })).toBeTruthy();
  });

  it.each(["button", "online"])(
    "recovers via %s when a completed show loads but an unfinished show's real lookup fails",
    async (retry) => {
      writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify({
        "1396": {
          tvId: 1396,
          name: "Completed Show",
          posterPath: null,
          seasons: { "1": [1, 2, 3] },
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        "77": {
          tvId: 77,
          name: "Unfinished Show",
          posterPath: null,
          seasons: { "1": [1] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }));
      let unavailable = true;
      vi.mocked(getCachedTVShowDetails).mockImplementation(async (id) => {
        if (id === 77 && unavailable) {
          throw new Error("TMDB API error: 503 Service Unavailable");
        }
        return {
          id,
          name: id === 77 ? "Unfinished Show" : "Completed Show",
          poster_path: null,
          seasons: [{ season_number: 1, episode_count: 3 }],
          last_episode_to_air: { season_number: 1, episode_number: 3 },
        } as TVShowDetails;
      });
      vi.mocked(getCachedSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [{ episode_number: 2 }],
      } as SeasonDetails);
      vi.mocked(getContinueWatching).mockImplementation((input, signal) =>
        getContinueWatchingEpisodes(sanitizeContinueWatchingSeeds(input), undefined, signal),
      );

      await renderSection();

      expect(screen.getByRole("alert").textContent).toContain("Could not load Continue Watching");
      expect(screen.queryByRole("button", { name: /Mark Unfinished Show/ })).toBeNull();

      unavailable = false;
      act(() => {
        if (retry === "online") window.dispatchEvent(new Event("online"));
        else fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      });
      await act(async () => vi.advanceTimersByTimeAsync(500));

      expect(getContinueWatching).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Mark Unfinished Show S01E02 as watched" })).toBeTruthy();
    },
  );

  it("keeps a successfully caught-up row hidden without a retry notice", async () => {
    vi.mocked(getContinueWatching).mockResolvedValue([]);
    await renderSection();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(getContinueWatching).toHaveBeenCalledTimes(1);
  });

  it("discards a pending failure from the previous profile", async () => {
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (episodes: UpNextEpisode[]) => void;
    vi.mocked(getContinueWatching)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    await renderSection();

    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY, newValue: "bob" }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => rejectOld(new Error("Old profile request failed")));
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => resolveNew([episode(4)]));
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E04 as watched" })).toBeTruthy();
  });

  it("hides the previous profile's failure during a profile change", async () => {
    vi.mocked(getContinueWatching).mockRejectedValueOnce(new Error("TMDB unavailable"));
    await renderSection();
    expect(screen.getByRole("alert")).toBeTruthy();

    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY, newValue: "bob" }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })).toBeTruthy();
  });

  it("clears a failed row and its online retry when all tracked shows are removed", async () => {
    vi.mocked(getContinueWatching).mockRejectedValueOnce(new Error("TMDB unavailable"));
    await renderSection();
    expect(screen.getByRole("alert")).toBeTruthy();

    act(() => {
      window.localStorage.removeItem(EPISODE_PROGRESS_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: EPISODE_PROGRESS_STORAGE_KEY }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(getContinueWatching).toHaveBeenCalledTimes(1);
  });
});

describe("ContinueWatching day changes", () => {
  it("finds a newly aired episode after local midnight without changing progress", async () => {
    vi.setSystemTime(new Date(2026, 9, 4, 23, 59));
    vi.mocked(getContinueWatching).mockResolvedValueOnce([]);
    await renderSection();
    expect(screen.queryByRole("button")).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(61_000));

    expect(getContinueWatching).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })).toBeTruthy();
  });

  it("refreshes a caught-up show when a suspended tab becomes visible on a later day", async () => {
    vi.setSystemTime(new Date(2026, 9, 4, 23, 59));
    vi.mocked(getContinueWatching).mockResolvedValueOnce([]);
    await renderSection();

    // Moving the clock alone leaves the midnight timer suspended.
    vi.setSystemTime(new Date(2026, 9, 5, 9));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(getContinueWatching).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })).toBeTruthy();
  });

  it.each(["success", "failure"])(
    "discards a prior-day %s before the suspended day subscription resumes",
    async (outcome) => {
      vi.setSystemTime(new Date(2026, 9, 4, 23, 59));
      let resolveOld!: (episodes: UpNextEpisode[]) => void;
      let rejectOld!: (reason: Error) => void;
      let resolveCurrent!: (episodes: UpNextEpisode[]) => void;
      vi.mocked(getContinueWatching)
        .mockImplementationOnce(() => new Promise((resolve, reject) => {
          resolveOld = resolve;
          rejectOld = reject;
        }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));
      await renderSection();

      vi.setSystemTime(new Date(2026, 9, 5, 9));
      await act(async () => {
        if (outcome === "success") resolveOld([episode(2)]);
        else rejectOld(new Error("Yesterday's request failed"));
      });
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();

      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      act(() => { document.dispatchEvent(new Event("visibilitychange")); });
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(getContinueWatching).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button")).toBeNull();

      await act(async () => resolveCurrent([episode(3)]));
      expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E03 as watched" })).toBeTruthy();
    },
  );
});

describe("ContinueWatching episode marking", () => {
  it("waits for the common lock and does not recreate a show removed while queued", async () => {
    const button = await renderRow();
    const locks = navigator.locks;
    let release!: () => void;
    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const held = locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, async () => {
      entered();
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await acquired;

    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(button.disabled).toBe(true);
    expect(getEpisodeProgress()["1396"].seasons["1"]).toEqual([1]);

    writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "{}");
    release();
    await act(async () => { await held; });

    expect(getEpisodeProgress()).toEqual({});
    expect(screen.queryByText("Breaking Bad")).toBeNull();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("keeps an episode watched after two clicks before the card refreshes", async () => {
    const button = await renderRow();
    // Both clicks can arrive before React disables the old card's control.
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(isEpisodeWatched(getEpisodeProgress(), 1396, 1, 2)).toBe(true);
    expect(getEpisodeProgress()["1396"].seasons["1"]).toEqual([1, 2]);
    expect(button.disabled).toBe(true);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("keeps the saved card disabled until its replacement has loaded", async () => {
    const button = await renderRow();
    let resolveNext!: (episodes: UpNextEpisode[]) => void;
    vi.mocked(getContinueWatching).mockImplementationOnce(() => new Promise((resolve) => {
      resolveNext = resolve;
    }));

    await act(async () => { fireEvent.click(button); });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Mark Breaking Bad S01E03 as watched" }))
      .toBeNull();

    await act(async () => resolveNext([episode(3)]));
    expect((screen.getByRole("button", {
      name: "Mark Breaking Bad S01E03 as watched",
    }) as HTMLButtonElement).disabled).toBe(false);
    expect(isEpisodeWatched(getEpisodeProgress(), 1396, 1, 2)).toBe(true);
  });

  it("keeps the episode unmarked and retryable when storage refuses the write", async () => {
    const button = await renderRow();
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await act(async () => { fireEvent.click(button); });
    expect(isEpisodeWatched(getEpisodeProgress(), 1396, 1, 2)).toBe(false);
    expect(button.disabled).toBe(false);
    expect(toast.showToast).toHaveBeenCalledWith(STORAGE_REFUSED_MESSAGE, "error");

    writes.mockRestore();
    await act(async () => { fireEvent.click(button); });
    expect(isEpisodeWatched(getEpisodeProgress(), 1396, 1, 2)).toBe(true);
    expect(button.disabled).toBe(true);
  });
});

describe("ContinueWatching storage changes", () => {
  it("reports a transient progress read failure and leaves its card retryable", async () => {
    const button = await renderRow();
    const before = window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY);
    refuseNextLocalStorageRead(EPISODE_PROGRESS_STORAGE_KEY);

    await act(async () => { fireEvent.click(button); });

    expect(window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY)).toBe(before);
    expect(button.disabled).toBe(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
    await act(async () => { fireEvent.click(button); });
    expect(getEpisodeProgress()["1396"].seasons["1"]).toEqual([1, 2]);
    expect(button.disabled).toBe(true);
  });

  it("hides a removed show's card while the remaining shows reload", async () => {
    await renderRow();
    vi.mocked(getContinueWatching).mockImplementationOnce(() => new Promise(() => {}));

    act(() => {
      window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify({
        "100": {
          tvId: 100,
          name: "Other Show",
          posterPath: null,
          seasons: { "1": [1] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }));
      window.dispatchEvent(new StorageEvent("storage", { key: EPISODE_PROGRESS_STORAGE_KEY }));
    });

    expect(screen.queryByText("Breaking Bad")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByRole("button", { name: /Breaking Bad/ })).toBeNull();
    expect(getEpisodeProgress()["1396"]).toBeUndefined();
  });

  it("invalidates cards on a profile switch even when both profiles have the same progress", async () => {
    await renderRow();
    let resolveNext!: (episodes: UpNextEpisode[]) => void;
    vi.mocked(getContinueWatching).mockImplementationOnce(() => new Promise((resolve) => {
      resolveNext = resolve;
    }));

    // Equal progress in separate stores does not emit a data-key change.
    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY, newValue: "bob" }));
    });

    expect(screen.queryByRole("button", { name: /Breaking Bad/ })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(getContinueWatching).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: /Breaking Bad/ })).toBeNull();

    await act(async () => resolveNext([episode(2)]));
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })).toBeTruthy();
  });

  it("discards a pending result from the previous profile", async () => {
    await renderRow();
    let resolveOld!: (episodes: UpNextEpisode[]) => void;
    let resolveNew!: (episodes: UpNextEpisode[]) => void;
    vi.mocked(getContinueWatching)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));

    // Begin a refresh for the outgoing profile, then switch before it settles.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark Breaking Bad S01E02 as watched" })); });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY, newValue: "bob" }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => resolveOld([episode(3)]));
    expect(screen.queryByRole("button", { name: /Breaking Bad/ })).toBeNull();

    await act(async () => resolveNew([episode(4)]));
    expect(screen.getByRole("button", { name: "Mark Breaking Bad S01E04 as watched" })).toBeTruthy();
  });

  it.each(["profile switch", "show removal"])(
    "refuses stale clicks after %s before its storage event arrives",
    async (change) => {
      const button = await renderRow();
      if (change === "profile switch") window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      else window.localStorage.removeItem(EPISODE_PROGRESS_STORAGE_KEY);
      const before = window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY);

      await act(async () => { fireEvent.click(button); });

      expect(window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY)).toBe(before);
    },
  );

  it("keeps a completed request with its rendered owner until a delayed profile event arrives", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Alice" },
      { id: "bob", name: "Bob" },
    ]));
    const aliceBefore = readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "default");
    const bobBefore = JSON.stringify({
      "1396": {
        ...getEpisodeProgress()["1396"],
        seasons: { "1": [1, 2, 3] },
      },
    });
    writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, bobBefore, "bob");

    let resolveOld!: (episodes: UpNextEpisode[]) => void;
    vi.mocked(getContinueWatching)
      .mockImplementation(async (input) => {
        const [seed] = sanitizeContinueWatchingSeeds(input);
        return [episode(seed.seasons["1"].length + 1)];
      })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await renderSection();

    // Another tab changes the pointer before this tab receives its storage event.
    // The old request completing causes a render in that interval.
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    await act(async () => resolveOld([episode(2)]));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {
        name: "Mark Breaking Bad S01E02 as watched",
      }));
    });

    expect(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "default")).toBe(aliceBefore);
    expect(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "bob")).toBe(bobBefore);
    expect(getContinueWatching).toHaveBeenCalledTimes(1);
    expect(toast.showToast).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: ACTIVE_PROFILE_STORAGE_KEY,
        newValue: "bob",
      }));
    });
    expect(screen.queryByRole("button", { name: /Breaking Bad/ })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {
        name: "Mark Breaking Bad S01E04 as watched",
      }));
    });

    expect(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "default")).toBe(aliceBefore);
    expect(getEpisodeProgress()["1396"].seasons["1"]).toEqual([1, 2, 3, 4]);
    expect(toast.showToast).not.toHaveBeenCalled();
  });
});
