// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WatchlistProvider, useWatchlist } from "@/contexts/WatchlistContext";
import { WatchedProvider, useWatched } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider, useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY, readProfileSlot } from "@/lib/profiles";
import { deletedProfileKey, PROFILE_STORAGE_OWNER_KEY } from "@/lib/profile-storage";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { EPISODE_PROGRESS_STORAGE_KEY } from "@/lib/episode-progress";
import { toast } from "./Toast";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";

vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));

function StoreState() {
  const { watchlist } = useWatchlist();
  const { watched } = useWatched();
  const { shows } = useEpisodeProgress();
  return <output aria-label="Current saved data">{JSON.stringify({
    watchlist: watchlist.map((item) => item.title),
    watched: watched.map((item) => item.title),
    shows: shows.map((show) => show.name),
  })}</output>;
}

function renderSwitcher() {
  render(
    <WatchlistProvider>
      <WatchedProvider>
        <EpisodeProgressProvider>
          <ProfileSwitcher />
          <StoreState />
        </EpisodeProgressProvider>
      </WatchedProvider>
    </WatchlistProvider>,
  );
}

function seedProfiles() {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
    { id: "default", name: "Me" }, { id: "p2", name: "Second" },
  ]));
  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
  const original = JSON.stringify(Array.from({ length: 5 }, (_, index) => ({
    id: index + 1, title: "Original default film ".repeat(15), mediaType: "movie",
  })));
  localStorage.setItem(WATCHLIST_STORAGE_KEY, original);
  localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([
    { id: 11, title: "Original watched", mediaType: "movie" },
  ]));
  localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify({
    "12": { name: "Original series", seasons: { "1": [1] } },
  }));
  localStorage.setItem("profile-data:p2", JSON.stringify({
    watchlist: JSON.stringify([{ id: 99, title: "Second profile film", mediaType: "movie" }]),
  }));
  return original;
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("ProfileSwitcher pending mutations", () => {
  async function holdRosterLock() {
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    return { release, held };
  }

  /**
   * A pending save marks the controls unavailable without native `disabled`,
   * which blurred the control just used and dropped keyboard focus.
   */
  function expectControlsPending(pending: boolean) {
    const controls = screen.getByRole("group", { name: "Profile controls" }) as HTMLFieldSetElement;
    expect(controls.disabled).toBe(false);
    expect(controls.getAttribute("aria-disabled")).toBe(pending ? "true" : null);
  }

  it("waits for creation, marks controls unavailable and ignores duplicate submissions", async () => {
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    renderSwitcher();
    const input = screen.getByLabelText("New profile name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Tom" } });
    input.focus();

    act(() => {
      fireEvent.submit(input.closest("form")!);
      fireEvent.submit(input.closest("form")!);
    });

    expect(requests).toHaveBeenCalledTimes(1);
    expectControlsPending(true);
    expect(document.activeElement).toBe(input);
    // Nothing typed while the save is pending can be lost when it clears.
    expect(input.readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Tom" })).toBeNull();
    expect(toast.showToast).not.toHaveBeenCalled();

    await act(async () => {
      lock.release();
      await lock.held;
    });

    expect(screen.getByRole("button", { name: "Tom" })).toBeDefined();
    expect(input.value).toBe("");
    expect(input.readOnly).toBe(false);
    expect(document.activeElement).toBe(input);
    expectControlsPending(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Added "Tom" – switch to start their list', "success");
  });

  it("keeps a rename pending until its write completes", async () => {
    seedProfiles();
    const lock = await holdRosterLock();
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Rename Second" }));
    const input = screen.getByRole("textbox", { name: "Rename Second" });
    fireEvent.change(input, { target: { value: "Tom" } });
    fireEvent.submit(input.closest("form")!);

    expectControlsPending(true);
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "Tom" })).toBeNull();
    await act(async () => { lock.release(); await lock.held; });
    expect(screen.getByRole("button", { name: "Tom" })).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "Rename Second" })).toBeNull();
  });

  it("waits for deletion before reporting success", async () => {
    seedProfiles();
    const lock = await holdRosterLock();
    renderSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Delete Second and their data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete Second and their data" }));

    expect(screen.getByRole("button", { name: "Second" })).toBeDefined();
    expect(toast.showToast).not.toHaveBeenCalled();
    await act(async () => { lock.release(); await lock.held; });
    expect(screen.queryByRole("button", { name: "Second" })).toBeNull();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Deleted "Second"', "success");
  });

  it("waits for switching, marks controls unavailable and ignores duplicate clicks", async () => {
    seedProfiles();
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    renderSwitcher();
    const target = screen.getByRole("button", { name: "Second" });
    target.focus();

    act(() => {
      fireEvent.click(target);
      fireEvent.click(target);
    });

    expect(requests).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("default");
    expectControlsPending(true);
    expect(document.activeElement).toBe(target);
    expect(toast.showToast).not.toHaveBeenCalled();

    await act(async () => { lock.release(); await lock.held; });

    expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p2");
    expectControlsPending(false);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("treats a switch another tab already made as done and reloads into it", async () => {
    seedProfiles();
    renderSwitcher();
    // Another tab switched first; this tab's storage event has not arrived.
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    const reload = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { reload } });

    try {
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Second" })); });
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    }

    expect(toast.showToast).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /^Second.*active$/ })).toBeDefined();
  });

  it("retains the name and enables retry when acquiring the lock fails", async () => {
    vi.stubGlobal("navigator", {});
    renderSwitcher();
    const input = screen.getByLabelText("New profile name");
    fireEvent.change(input, { target: { value: "Tom" } });
    await act(async () => { fireEvent.submit(input.closest("form")!); });

    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith("Could not add that profile", "error");
    expect((input as HTMLInputElement).value).toBe("Tom");
    expect((screen.getByRole("group", { name: "Profile controls" }) as HTMLFieldSetElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Tom" })).toBeNull();

    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    await act(async () => { fireEvent.submit(input.closest("form")!); });
    expect(screen.getByRole("button", { name: "Tom" })).toBeDefined();
    expect(toast.showToast).toHaveBeenLastCalledWith('Added "Tom" – switch to start their list', "success");
  });
});

describe("ProfileSwitcher failure recovery", () => {
  it.each([PROFILE_STORAGE_OWNER_KEY, ACTIVE_PROFILE_STORAGE_KEY])(
    "keeps both profiles and displayed contexts intact when %s is refused, then allows retry",
    async (refusedKey) => {
      seedProfiles();
      renderSwitcher();
      const displayedBefore = screen.getByLabelText("Current saved data").textContent;
      const originalStores = {
        watchlist: localStorage.getItem(WATCHLIST_STORAGE_KEY),
        watched: localStorage.getItem(WATCHED_STORAGE_KEY),
        episodes: localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY),
        second: localStorage.getItem("profile-data:p2"),
      };
      const write = Storage.prototype.setItem;
      let refuse = true;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
        if (key === refusedKey && refuse) throw new DOMException("QuotaExceededError");
        write.call(this, key, value);
      });

      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Second" })); });

      expect(screen.getByLabelText("Current saved data").textContent).toBe(displayedBefore);
      expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("default");
      expect(localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(originalStores.watchlist);
      expect(localStorage.getItem(WATCHED_STORAGE_KEY)).toBe(originalStores.watched);
      expect(localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY)).toBe(originalStores.episodes);
      expect(localStorage.getItem("profile-data:p2")).toBe(originalStores.second);
      expect(screen.queryByRole("alert")).toBeNull();
      expect((screen.getByRole("group", { name: "Profile controls" }) as HTMLFieldSetElement).disabled)
        .toBe(false);
      expect(toast.showToast).toHaveBeenCalledExactlyOnceWith("Could not switch profile", "error");

      refuse = false;
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Second" })); });

      expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p2");
      expect(readProfileSlot("default").watchlist).toBe(originalStores.watchlist);
      expect(readProfileSlot("p2").watchlist).toBe(JSON.parse(originalStores.second!).watchlist);
      expect(toast.showToast).toHaveBeenCalledTimes(1);
      // A real successful switch reloads. Remount the providers to verify the
      // same saved stores survive that reload under their correct owner.
      cleanup();
      renderSwitcher();
      expect(JSON.parse(screen.getByLabelText("Current saved data").textContent!)).toEqual({
        watchlist: ["Second profile film"], watched: [], shows: [],
      });
    },
  );

  it("refreshes the actual owner and offers recovery when older code invalidates the saved pointer", async () => {
    seedProfiles();
    localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
      { id: 1, title: "Default profile film", mediaType: "movie" },
    ]));
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
      { id: "p3", name: "Third" },
    ]));
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p3");
    localStorage.setItem("profile-store:p3:watchlist", JSON.stringify([
      { id: 33, title: "Third profile film", mediaType: "movie" },
    ]));
    renderSwitcher();
    expect(JSON.parse(screen.getByLabelText("Current saved data").textContent!).watchlist)
      .toEqual(["Third profile film"]);
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      write.call(this, key, value);
      if (key === ACTIVE_PROFILE_STORAGE_KEY && value === "p2") {
        write.call(this, deletedProfileKey("p2"), "true");
      }
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Second" })); });

    expect(screen.getByRole("alert").textContent).toContain("The active profile changed");
    expect(screen.getByRole("button", { name: "Reload saved data" })).toBeDefined();
    expect((screen.getByRole("group", { name: "Profile controls" }) as HTMLFieldSetElement).disabled).toBe(true);
    expect(JSON.parse(screen.getByLabelText("Current saved data").textContent!).watchlist)
      .toEqual(["Default profile film"]);
    expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p2");
  });
});
