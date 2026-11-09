// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey } from "@/lib/profile-storage";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { WatchlistButton } from "./WatchlistButton";
import type { MediaItem } from "@/types/tmdb";

/**
 * The heart on every poster in the app.
 *
 * Three things here are worth holding. The first render has to match the empty
 * HTML the static export shipped, whatever storage says – a button that arrives
 * already filled in is a hydration mismatch on the most-rendered component
 * there is.
 *
 * The refused write is the second. There is no account and no server, so a
 * browser that will not store is the end of the line: the visitor has to be told,
 * because the alternative is a heart that fills in and a list that stays empty.
 *
 * And the pulse is the third – it is what the shared `useTransientFlag` hook
 * replaced eight hand-rolled `setTimeout`s with, and clicking twice quickly used
 * to cut the second pulse short.
 */

vi.mock("./Toast", () => ({
  toast: { showToast: vi.fn() },
}));

const { toast } = await import("./Toast");

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 550,
    title: "Fight Club",
    overview: "An insomniac office worker…",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "1999-10-15",
    vote_average: 8.4,
    vote_count: 27000,
    genre_ids: [18],
    media_type: "movie",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <WatchlistProvider>{children}</WatchlistProvider>;
}

function renderButton(media: MediaItem = item()) {
  return render(<WatchlistButton item={media} />, { wrapper });
}

function stored(): unknown[] {
  return JSON.parse(
    window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "[]",
  );
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("WatchlistButton", () => {
  it("waits for the shared lock and ignores a repeated click while saving", async () => {
    renderButton();
    let entered!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      entered();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await acquired;
    const button = screen.getByRole("button", { name: "Add Fight Club to watchlist" });
    const write = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    // Busy, but never natively disabled: that would blur a focused heart.
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(stored()).toEqual([]);
    expect(toast.showToast).not.toHaveBeenCalled();

    await act(async () => { release(); await holding; });
    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(write.mock.calls.filter(([key]) => key === WATCHLIST_STORAGE_KEY)).toHaveLength(1);
    expect(toast.showToast).toHaveBeenCalledTimes(1);
  });

  it("checks the loaded list's owner even when an unrelated render refreshes the profile guard", async () => {
    initializeProfileStorage();
    const view = renderButton();
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    view.rerender(<WatchlistButton item={item()} />);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Fight Club to watchlist" })); });

    expect(stored()).toEqual([]);
    expect(window.localStorage.getItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "bob"))).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("keeps the list read and write on the rendered owner if the pointer changes after the guard", async () => {
    initializeProfileStorage();
    const bobKey = profileStoreKey(WATCHLIST_STORAGE_KEY, "bob");
    const bobList = JSON.stringify([{ id: 550, title: "Fight Club", mediaType: "movie", addedAt: "2026-01-01T00:00:00.000Z" }]);
    window.localStorage.setItem(bobKey, bobList);
    renderButton();
    const getItem = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      const value = getItem.call(this, key);
      if (!switched && key === ACTIVE_PROFILE_STORAGE_KEY) {
        switched = true;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Fight Club to watchlist" })); });

    expect(stored()).toHaveLength(1);
    expect(window.localStorage.getItem(bobKey)).toBe(bobList);
    expect(toast.showToast).toHaveBeenCalledWith('Added "Fight Club" to watchlist', "success");
  });

  it("does not remove a new profile's title before the profile change event arrives", async () => {
    const saved = {
      id: 550, title: "Fight Club", mediaType: "movie", posterPath: null,
      voteAverage: 8.4, releaseDate: "1999-10-15", addedAt: "2026-01-01T00:00:00.000Z",
    };
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([saved]));
    renderButton();

    // A different tab has swapped the live keys; its storage events are queued.
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other");
    const incoming = [{ ...saved, addedAt: "2026-02-01T00:00:00.000Z" }];
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(incoming));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove Fight Club from watchlist" })); });

    expect(stored()).toEqual(incoming);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("refreshes a queued change without turning an old Add click into Remove", async () => {
    renderButton();
    const incoming = [{
      id: 550, title: "Fight Club", mediaType: "movie", posterPath: null,
      voteAverage: 8.4, releaseDate: "1999-10-15", addedAt: "2026-01-01T00:00:00.000Z",
    }];
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(incoming));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add Fight Club to watchlist" })); });

    expect(stored()).toEqual(incoming);
    expect(screen.getByRole("button", { name: "Remove Fight Club from watchlist" })).toBeDefined();
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("watchlist changed"), "info");
  });

  it("adds the title and says so", async () => {
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => expect(stored()).toHaveLength(1));
    expect(toast.showToast).toHaveBeenCalledWith(
      'Added "Fight Club" to watchlist',
      "success",
    );
  });

  it("removes a title that is already saved", async () => {
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    await waitFor(() => expect(stored()).toHaveLength(1));

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => expect(stored()).toHaveLength(0));
    expect(toast.showToast).toHaveBeenLastCalledWith(
      'Removed "Fight Club" from watchlist',
      "success",
    );
  });

  /**
   * There is nowhere else for the list to go, so a refusal has to be said out
   * loud rather than swallowed.
   */
  it("reports a refused write instead of pretending it worked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        STORAGE_REFUSED_MESSAGE,
        "error",
      ),
    );
  });

  it("labels itself for a screen reader", () => {
    renderButton();

    expect(screen.getByRole("button").getAttribute("aria-label")).toBeTruthy();
  });

  it("keeps a film and a show with the same id apart", async () => {
    const { unmount } = renderButton(item({ id: 7, media_type: "movie" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    await waitFor(() => expect(stored()).toHaveLength(1));
    unmount();

    renderButton(item({ id: 7, media_type: "tv", title: "A Series" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => expect(stored()).toHaveLength(2));
  });
});
