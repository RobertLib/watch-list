// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { TVSeasons } from "./TVSeasons";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { EPISODE_PROGRESS_STORAGE_KEY, type EpisodeProgress } from "@/lib/episode-progress";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY, readProfileSlot, switchProfile } from "@/lib/profiles";
import { profileStoreKey, readProfileStore, writeProfileStore } from "@/lib/profile-storage";
import { toast } from "@/components/Toast";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import type { Season, SeasonDetails } from "@/types/tmdb";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";

/**
 * Expanding a season, and what happens when that fails.
 *
 * The episodes are the one thing on a series page that is not fetched with the
 * rest of it – a show with twelve seasons would otherwise pull twelve episode
 * lists nobody asked for – so each row loads its own on first open. Which means
 * each row also owns a failure, a retry, and the state in between.
 */

const { fetchSeasonDetails } = vi.hoisted(() => ({
  fetchSeasonDetails: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ fetchSeasonDetails }));

vi.mock("@/components/Toast", () => ({ toast: { showToast: vi.fn() } }));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid="image" data-src={src}>{alt}</span>
  ),
}));

function season(over: Partial<Season> = {}): Season {
  return {
    id: 1,
    name: "Season 1",
    season_number: 1,
    episode_count: 2,
    air_date: "2008-01-20",
    overview: "",
    poster_path: null,
    vote_average: 0,
    ...over,
  };
}

function details(): SeasonDetails {
  return {
    id: 1,
    name: "Season 1",
    season_number: 1,
    air_date: "2008-01-20",
    overview: "",
    poster_path: null,
    episodes: [
      {
        id: 101,
        name: "Pilot",
        overview: "",
        episode_number: 1,
        season_number: 1,
        air_date: "2008-01-20",
        still_path: null,
        vote_average: 0,
        runtime: 58,
      },
    ],
  } as SeasonDetails;
}

function seasonsView() {
  return (
    <EpisodeProgressProvider>
      <TVSeasons
        seasons={[season()]}
        tvId={1396}
        showName="Breaking Bad"
        posterPath={null}
      />
    </EpisodeProgressProvider>
  );
}

function renderSeasons() {
  return render(seasonsView());
}

function progressFor(episodes: number[]): EpisodeProgress {
  return episodes.length === 0 ? {} : {
    "1396": {
      tvId: 1396,
      name: "Breaking Bad",
      posterPath: null,
      seasons: { "1": episodes },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function writeProgress(episodes: number[]) {
  writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(progressFor(episodes)));
}

function storedProgress(): EpisodeProgress {
  return JSON.parse(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY) ?? "{}");
}

/** Open or close the season, and let the transition it starts settle. */
async function clickHeader() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Season 1/ }));
  });
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  fetchSeasonDetails.mockReset();
  vi.mocked(toast.showToast).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TVSeasons", () => {
  it.each(["episode", "season"] as const)(
    "disables a queued %s action and preserves a concurrent episode edit",
    async (action) => {
      fetchSeasonDetails.mockResolvedValue(details());
      renderSeasons();
      await clickHeader();
      let release!: () => void;
      let entered!: () => void;
      const acquired = new Promise<void>((resolve) => { entered = resolve; });
      const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, async () => {
        entered();
        await new Promise<void>((resolve) => { release = resolve; });
      });
      await acquired;
      const button = screen.getByRole("button", {
        name: action === "episode" ? "Mark S01E01 as watched" : "Mark 1 aired as watched",
      }) as HTMLButtonElement;

      await act(async () => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      expect(button.disabled).toBe(true);
      expect(storedProgress()).toEqual({});

      writeProgress([2]);
      const writes = vi.spyOn(Storage.prototype, "setItem");
      release();
      await act(async () => { await held; });

      expect(storedProgress()["1396"].seasons["1"]).toEqual([1, 2]);
      expect(writes.mock.calls.filter(([key]) => key === EPISODE_PROGRESS_STORAGE_KEY)).toHaveLength(1);
      expect(button.disabled).toBe(false);
      expect(toast.showToast).not.toHaveBeenCalled();
    },
  );

  /**
   * The whole header used to be the button, with the season's <h3> inside it –
   * invalid markup, and a heading a screen reader's heading list never saw. The
   * heading now holds the button, and the button names the panel it opens.
   */
  it("keeps the season heading outside its toggle, and the toggle tied to its panel", async () => {
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();

    const heading = screen.getByRole("heading", { level: 3, name: "Season 1" });
    const toggle = screen.getByRole("button", { name: "Season 1" });
    expect(heading.contains(toggle)).toBe(true);
    expect(document.querySelector("button h1, button h2, button h3, button h4, button p")).toBeNull();

    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel!.hidden).toBe(true);

    await clickHeader();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel!.hidden).toBe(false);
    expect(panel!.textContent).toContain("Pilot");
  });

  // `unoptimized` means the size named is the size downloaded: a 56px poster
  // and a 144px still were both fetched at w500.
  it("fetches the season poster and episode stills at their own size", async () => {
    const withStill = details();
    withStill.episodes[0].still_path = "/still.jpg";
    fetchSeasonDetails.mockResolvedValue(withStill);
    render(
      <EpisodeProgressProvider>
        <TVSeasons
          seasons={[season({ poster_path: "/season.jpg" })]}
          tvId={1396}
          showName="Breaking Bad"
          posterPath={null}
        />
      </EpisodeProgressProvider>,
    );
    await clickHeader();

    const sources = screen.getAllByTestId("image").map((image) => image.getAttribute("data-src"));
    expect(sources).toEqual([
      "https://image.tmdb.org/t/p/w154/season.jpg",
      "https://image.tmdb.org/t/p/w300/still.jpg",
    ]);
  });

  it("loads the episodes when a season is opened", async () => {
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();

    await clickHeader();

    expect(screen.getByText("Pilot")).toBeDefined();
    expect(fetchSeasonDetails).toHaveBeenCalledWith(1396, 1);
  });

  it.each(["episode", "season"] as const)(
    "allows marking a newly aired %s after local midnight without reopening the season",
    async (action) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
      const upcoming = details();
      upcoming.episodes = [
        { ...upcoming.episodes[0], air_date: "2026-10-06" },
        { ...upcoming.episodes[0], id: 102, episode_number: 2, name: "Tomorrow", air_date: "2026-10-07" },
      ];
      fetchSeasonDetails.mockResolvedValue(upcoming);
      renderSeasons();
      await clickHeader();

      expect(screen.queryByRole("button", { name: "Mark S01E01 as watched" })).toBeNull();
      expect(screen.queryByRole("button", { name: /aired as watched/ })).toBeNull();

      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

      expect(screen.getByRole("button", { name: "Mark S01E01 as watched" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Mark 1 aired as watched" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Mark S01E02 as watched" })).toBeNull();
      await act(async () => { fireEvent.click(screen.getByRole("button", {
        name: action === "episode" ? "Mark S01E01 as watched" : "Mark 1 aired as watched",
      })); });

      expect(storedProgress()["1396"].seasons["1"]).toEqual([1]);
    },
  );

  it("updates aired episodes when a suspended tab becomes visible on a new day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 10));
    const upcoming = details();
    upcoming.episodes[0].air_date = "2026-10-06";
    fetchSeasonDetails.mockResolvedValue(upcoming);
    renderSeasons();
    await clickHeader();
    expect(screen.queryByRole("button", { name: "Mark S01E01 as watched" })).toBeNull();

    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    // Changing the clock without advancing timers models a suspended tab.
    vi.setSystemTime(new Date(2026, 9, 6, 10));
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByRole("button", { name: "Mark S01E01 as watched" })).toBeNull();

    visibility.mockReturnValue("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(screen.getByRole("button", { name: "Mark S01E01 as watched" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark 1 aired as watched" })); });
    expect(storedProgress()["1396"].seasons["1"]).toEqual([1]);
  });

  it("says so when the episodes could not be loaded", async () => {
    // `fetchSeasonDetails` answers null rather than throwing, so this is the
    // only signal the row gets.
    fetchSeasonDetails.mockResolvedValue(null);
    renderSeasons();

    await clickHeader();

    expect(screen.getByText("Failed to load episodes.")).toBeDefined();
  });

  /**
   * The bug: the flag was set on failure and never cleared. Re-opening the
   * season does retry – `details` is still null – so a load that went through on
   * the second attempt rendered its episodes *underneath* a "Failed to load
   * episodes." that had no way of ever leaving the page.
   */
  it("clears the failure once a retry succeeds", async () => {
    fetchSeasonDetails.mockResolvedValueOnce(null);
    renderSeasons();

    await clickHeader();
    expect(screen.getByText("Failed to load episodes.")).toBeDefined();

    // Collapse, then open again – which is what triggers the second attempt.
    await clickHeader();
    fetchSeasonDetails.mockResolvedValueOnce(details());
    await clickHeader();

    expect(screen.getByText("Pilot")).toBeDefined();
    expect(screen.queryByText("Failed to load episodes.")).toBeNull();
  });

  it("marks and unmarks the episode according to the displayed button", async () => {
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();
    await clickHeader();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark S01E01 as watched" })); });
    expect(storedProgress()["1396"].seasons["1"]).toEqual([1]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark S01E01 as not watched" })); });
    expect(storedProgress()).toEqual({});
  });

  it("keeps an episode watched when another tab marked it before its storage event arrived", async () => {
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();
    await clickHeader();

    // No storage event yet: this tab still offers to mark the episode watched.
    writeProgress([1, 2]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark S01E01 as watched" })); });

    expect(storedProgress()["1396"].seasons["1"]).toEqual([1, 2]);
    expect(screen.getByRole("button", { name: "Mark S01E01 as not watched" })
      .getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps an episode unmarked when another tab unmarked it before its storage event arrived", async () => {
    writeProgress([1, 2]);
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();
    await clickHeader();

    writeProgress([2]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark S01E01 as not watched" })); });

    expect(storedProgress()["1396"].seasons["1"]).toEqual([2]);
    expect(screen.getByRole("button", { name: "Mark S01E01 as watched" })
      .getAttribute("aria-pressed")).toBe("false");
  });

  it.each([
    ["episode", false], ["season", false],
    ["episode", true], ["season", true],
  ] as const)(
    "keeps both profiles' progress before an %s action with pending storage events (parent rerender: %s)",
    async (action, rerender) => {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
      writeProgress([1, 2]);
      const bobProgress = JSON.stringify(progressFor([1]));
      localStorage.setItem("profile-data:bob", JSON.stringify({
        [EPISODE_PROGRESS_STORAGE_KEY]: bobProgress,
      }));
      fetchSeasonDetails.mockResolvedValue(details());
      const page = renderSeasons();
      await clickHeader();

      await act(async () => { expect(await switchProfile("bob")).toBe(true); });
      if (rerender) page.rerender(seasonsView());
      await act(async () => { fireEvent.click(screen.getByRole("button", {
        name: action === "episode" ? "Mark S01E01 as not watched" : "Unmark all",
      })); });

      expect(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "bob")).toBe(bobProgress);
      expect(JSON.parse(readProfileSlot("default")[EPISODE_PROGRESS_STORAGE_KEY]))
        .toEqual(progressFor([1, 2]));
      expect(toast.showToast).toHaveBeenCalledWith(
        "Your active profile changed. Review the current title and try again.",
        "info",
      );
    },
  );

  it("allows an episode action after its incoming profile progress is refreshed", async () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
    ]));
    writeProgress([2]);
    localStorage.setItem("profile-data:bob", JSON.stringify({
      [EPISODE_PROGRESS_STORAGE_KEY]: JSON.stringify(progressFor([1])),
    }));
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();
    await clickHeader();
    await act(async () => { expect(await switchProfile("bob")).toBe(true); });

    fireEvent(window, new StorageEvent("storage", { key: profileStoreKey(EPISODE_PROGRESS_STORAGE_KEY) }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark S01E01 as not watched" })); });

    expect(storedProgress()).toEqual({});
    expect(JSON.parse(readProfileSlot("default")[EPISODE_PROGRESS_STORAGE_KEY]))
      .toEqual(progressFor([2]));
  });

  it.each(["empty", "identical"] as const)(
    "allows episode tracking after another tab switches profiles with %s progress",
    async (state) => {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      const outgoing = state === "empty" ? null : JSON.stringify(progressFor([1]));
      if (outgoing !== null) localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, outgoing);
      localStorage.setItem("profile-data:bob", JSON.stringify(
        outgoing === null ? {} : { [EPISODE_PROGRESS_STORAGE_KEY]: outgoing },
      ));
      fetchSeasonDetails.mockResolvedValue(details());
      renderSeasons();
      await clickHeader();

      await act(async () => {
        expect(await switchProfile("bob")).toBe(true);
        expect(localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY)).toBe(outgoing);
        // No progress event exists when both profiles' stores match.
        window.dispatchEvent(new StorageEvent("storage", {
          key: ACTIVE_PROFILE_STORAGE_KEY,
          newValue: "bob",
        }));
      });
      await act(async () => { fireEvent.click(screen.getByRole("button", {
        name: state === "empty" ? "Mark S01E01 as watched" : "Mark S01E01 as not watched",
      })); });

      expect(storedProgress()["1396"]?.seasons["1"]).toEqual(
        state === "empty" ? [1] : undefined,
      );
      expect(readProfileSlot("default")[EPISODE_PROGRESS_STORAGE_KEY]).toBe(
        outgoing ?? undefined,
      );
      expect(toast.showToast).not.toHaveBeenCalled();
    },
  );

  it("reports a refused episode write and keeps the displayed tick unchanged", async () => {
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();
    await clickHeader();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark S01E01 as watched" })); });

    expect(storedProgress()).toEqual({});
    expect(screen.getByRole("button", { name: "Mark S01E01 as watched" })
      .getAttribute("aria-pressed")).toBe("false");
    expect(toast.showToast).toHaveBeenCalledWith(STORAGE_REFUSED_MESSAGE, "error");
  });
});
