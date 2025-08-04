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
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
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
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("WatchlistButton", () => {
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
