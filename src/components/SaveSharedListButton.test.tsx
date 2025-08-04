// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { WATCHLIST_STORAGE_KEY, type WatchlistItem } from "@/lib/watchlist";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
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
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("SaveSharedListButton", () => {
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
