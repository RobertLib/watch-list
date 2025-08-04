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
import { clearWatchlist, WATCHLIST_STORAGE_KEY, type WatchlistItem } from "@/lib/watchlist";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey } from "@/lib/profile-storage";
import { SaveSharedListButton } from "./SaveSharedListButton";
import type { MediaItem } from "@/types/tmdb";

/**
 * "Save all to my watchlist", on the receiving end of a share link.
 *
 * The whole point of a share link is that acting on it costs one click, so what
 * is pinned here is the arithmetic around that click: only the titles the
 * recipient does not already have get added, the count in the confirmation is
 * the number actually saved rather than the number offered, and a list they
 * already hold in full disables the button instead of claiming to have saved
 * nothing.
 *
 * The refusal is the case with the most ways to be wrong. One refused write
 * means the browser is out of room rather than confused about one title – but
 * some may already have landed before it ran out, and saying "could not save"
 * over a partial success is as wrong as staying silent over a total failure.
 */

vi.mock("./Toast", () => ({
  toast: { showToast: vi.fn() },
}));

const { toast } = await import("./Toast");

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 550,
    title: "Fight Club",
    overview: "",
    poster_path: "/poster.jpg",
    backdrop_path: null,
    release_date: "1999-10-15",
    vote_average: 8.4,
    vote_count: 27000,
    genre_ids: [18],
    media_type: "movie",
    ...overrides,
  };
}

function storedItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: 550,
    title: "Fight Club",
    mediaType: "movie",
    posterPath: "/poster.jpg",
    voteAverage: 8.4,
    releaseDate: "1999-10-15",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <WatchlistProvider>{children}</WatchlistProvider>;
}

async function renderButton(items: MediaItem[]) {
  const view = render(<SaveSharedListButton items={items} />, { wrapper });
  // The button holds a skeleton until storage has been read, so it cannot
  // briefly claim titles the visitor already has are missing.
  await waitFor(() => expect(screen.queryByRole("button")).not.toBeNull());
  return view;
}

function stored(): WatchlistItem[] {
  return JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "[]");
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

describe("SaveSharedListButton", () => {
  it("includes all offered titles after an earlier queued clear removes previously saved titles", async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([storedItem({ id: 1 })]));
    await renderButton([item({ id: 1 }), item({ id: 2 })]);
    expect(screen.getByRole("button", { name: "Save 1 to my watchlist" })).toBeDefined();
    let entered!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      entered();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await acquired;
    const clearing = clearWatchlist();
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(stored().map((entry) => entry.id)).toEqual([1]);

    await act(async () => {
      release();
      await holding;
      expect(await clearing).toBe(true);
    });
    await waitFor(() => expect(stored().map((entry) => entry.id)).toEqual([2, 1]));
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith("Added 2 titles to your watchlist", "success");
  });

  it("waits for every save and blocks a second batch while another tab holds the lock", async () => {
    await renderButton([item({ id: 1 }), item({ id: 2 })]);
    let entered!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      entered();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await acquired;
    const button = screen.getByRole("button");
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(stored()).toEqual([]);
    expect(toast.showToast).not.toHaveBeenCalled();

    await act(async () => { release(); await holding; });
    await waitFor(() => expect(stored().map((entry) => entry.id)).toEqual([2, 1]));
    expect(toast.showToast).toHaveBeenCalledTimes(1);
    expect(toast.showToast).toHaveBeenCalledWith("Added 2 titles to your watchlist", "success");
  });

  it("keeps the latest-list read and all saves on one owner if the pointer changes after the guard", async () => {
    initializeProfileStorage();
    const bobKey = profileStoreKey(WATCHLIST_STORAGE_KEY, "bob");
    const bobList = JSON.stringify([storedItem({ id: 1 })]);
    window.localStorage.setItem(bobKey, bobList);
    await renderButton([item({ id: 1 }), item({ id: 2 })]);
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

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save 2 to my watchlist" })); });

    expect(stored().map((entry) => entry.id)).toEqual([2, 1]);
    expect(window.localStorage.getItem(bobKey)).toBe(bobList);
    expect(toast.showToast).toHaveBeenCalledWith("Added 2 titles to your watchlist", "success");
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<SaveSharedListButton items={[]} />, {
      wrapper,
    });

    expect(container.querySelector("button")).toBeNull();
  });

  it("saves every title in one press", async () => {
    await renderButton([item({ id: 1 }), item({ id: 2 }), item({ id: 3 })]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => expect(stored()).toHaveLength(3));
    expect(toast.showToast).toHaveBeenCalledWith(
      "Added 3 titles to your watchlist",
      "success",
    );
  });

  it("counts one title in the singular", async () => {
    await renderButton([item({ id: 1 })]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      "Added 1 title to your watchlist",
      "success",
    );
  });

  it("shows a heart for new missing titles immediately after a successful save", async () => {
    const view = await renderButton([item({ id: 1 })]);
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    expect(screen.getByRole("button", { name: "All on your watchlist" }).querySelector(".lucide-check")).not.toBeNull();

    view.rerender(<SaveSharedListButton items={[item({ id: 1 }), item({ id: 2 })]} />);

    const button = screen.getByRole("button", { name: "Save 1 to my watchlist" });
    expect(button.querySelector(".lucide-check")).toBeNull();
    expect(button.querySelector(".lucide-heart")).not.toBeNull();
  });

  /** The count is what was saved, not what was offered. */
  it("adds only the titles that are missing", async () => {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify([storedItem({ id: 1 })]),
    );

    await renderButton([item({ id: 1 }), item({ id: 2 })]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() => expect(stored()).toHaveLength(2));
    expect(toast.showToast).toHaveBeenCalledWith(
      "Added 1 title to your watchlist",
      "success",
    );
  });

  it.each([false, true])(
    "refuses an old profile's missing list before storage events (rerender: %s)",
    async (rerender) => {
      window.localStorage.setItem(
        WATCHLIST_STORAGE_KEY,
        JSON.stringify([storedItem({ id: 1 })]),
      );
      const items = [item({ id: 1 }), item({ id: 2 })];
      const view = await renderButton(items);
      expect(screen.getByText("Save 1 to my watchlist")).toBeTruthy();

      // The incoming profile needs both titles. The rendered `missing` array
      // still belongs to the outgoing profile until its context refreshes.
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "second");
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, "[]");
      if (rerender) view.rerender(<SaveSharedListButton items={items} />);
      await act(async () => { fireEvent.click(screen.getByRole("button")); });

      expect(stored()).toEqual([]);
      expect(toast.showToast).toHaveBeenCalledWith(
        "Your active profile changed. Review the current list and try again.",
        "info",
      );

      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      });
      expect(screen.getByText("Save 2 to my watchlist")).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole("button")); });
      expect(stored().map((entry) => entry.id)).toEqual([2, 1]);
      expect(toast.showToast).toHaveBeenCalledWith(
        "Added 2 titles to your watchlist",
        "success",
      );
    },
  );

  it("includes titles removed in the same profile before the storage event", async () => {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify([storedItem({ id: 1 })]),
    );
    await renderButton([item({ id: 1 }), item({ id: 2 })]);
    expect(screen.getByText("Save 1 to my watchlist")).toBeTruthy();

    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, "[]");
    await act(async () => { fireEvent.click(screen.getByRole("button")); });

    expect(stored().map((entry) => entry.id)).toEqual([2, 1]);
    expect(toast.showToast).toHaveBeenCalledWith(
      "Added 2 titles to your watchlist",
      "success",
    );
    expect(screen.getByText("All on your watchlist")).toBeTruthy();
  });

  it("disables itself when the recipient already has the whole list", async () => {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify([storedItem({ id: 1 }), storedItem({ id: 2 })]),
    );

    await renderButton([item({ id: 1 }), item({ id: 2 })]);

    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  /** No account, no server: a browser that will not store has to say so. */
  it("reports a wholly refused save", async () => {
    await renderButton([item({ id: 1 }), item({ id: 2 })]);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        STORAGE_REFUSED_MESSAGE,
        "error",
      ),
    );
    expect(stored()).toEqual([]);
    const button = screen.getByRole("button", { name: "Save 2 to my watchlist" });
    expect(button.querySelector(".lucide-check")).toBeNull();
    expect(button.querySelector(".lucide-heart")).not.toBeNull();
  });

  it.each([2, 3])("reports saved and refused counts when storage fills after one of %i titles", async (count) => {
    const items = Array.from({ length: count }, (_, index) => item({ id: index + 1 }));
    await renderButton(items);

    // Allow one title, then refuse the larger list just as a full quota does.
    const quota = JSON.stringify([storedItem({ id: 1 })]).length;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === WATCHLIST_STORAGE_KEY && value.length > quota) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      setItem.call(this, key, value);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => { fireEvent.click(screen.getByRole("button")); });

    const refused = count - 1;
    expect(stored().map((entry) => entry.id)).toEqual([1]);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      `Added 1 title to your watchlist, but could not save ${refused} title${refused === 1 ? "" : "s"}. Check your browser's storage settings.`,
      "error",
    );
    const button = screen.getByRole("button", { name: `Save ${refused} to my watchlist` });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.querySelector(".lucide-check")).toBeNull();
    expect(button.querySelector(".lucide-heart")).not.toBeNull();

    // The accepted title stays saved; retry only adds what was refused.
    vi.restoreAllMocks();
    await act(async () => { fireEvent.click(button); });
    expect(stored()).toHaveLength(count);
    expect(screen.getByRole("button", { name: "All on your watchlist" }).hasAttribute("disabled")).toBe(true);
  });

  /**
   * The label counts what is left to do, so it has to be the number missing
   * rather than the number shared – and once the save lands there is nothing
   * left to press.
   */
  it("counts what is missing, then settles into the done state", async () => {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify([storedItem({ id: 1 })]),
    );

    await renderButton([item({ id: 1 }), item({ id: 2 }), item({ id: 3 })]);
    expect(screen.getByText("Save 2 to my watchlist")).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });

    await waitFor(() =>
      expect(screen.getByText("All on your watchlist")).toBeDefined(),
    );
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("offers a way through to the watchlist it just filled", async () => {
    await renderButton([item({ id: 1 })]);

    expect(
      screen.getByText("View my watchlist").getAttribute("href"),
    ).toBe("/watchlist");
  });
});
