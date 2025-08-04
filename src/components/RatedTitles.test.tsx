// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RatedTitles } from "./RatedTitles";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { RATINGS_STORAGE_KEY, saveRatings, type Ratings } from "@/lib/ratings";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { MAX_RATED_SHOWN } from "@/lib/rated-view";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { createProfileLockManager } from "@/test/profile-locks";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";

/**
 * The rated list, which is half local and half TMDB.
 *
 * The scores are in this browser; the posters and titles they hang on are not.
 * A failed or pending request must leave the scores visible and editable, with
 * locally saved metadata or an id as the fallback. Only title enrichment waits
 * for the network.
 */

const { getTitlesResolutionByRefs } = vi.hoisted(() => ({ getTitlesResolutionByRefs: vi.fn() }));

vi.mock("@/lib/api", () => ({ getTitlesResolutionByRefs }));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <span data-poster-src={src}>{alt}</span>,
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

vi.mock("./ShareListButton", () => ({ ShareListButton: () => null }));
vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));
const { toast } = await import("./Toast");

function saveOneRating() {
  window.localStorage.setItem(
    RATINGS_STORAGE_KEY,
    JSON.stringify({
      "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
    }),
  );
}

const card = {
  id: 550,
  media_type: "movie" as const,
  title: "Fight Club",
  poster_path: "/poster.jpg",
  vote_average: 8.4,
  release_date: "1999-10-15",
  overview: "",
  genre_ids: [],
};

const secondCard = {
  ...card,
  id: 949,
  title: "Heat",
  poster_path: "/heat.jpg",
};

function saveTwoRatings() {
  window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify({
    "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
    "movie-949": { rating: 8, ratedAt: "2026-01-02T00:00:00.000Z" },
  }));
}

function saveManyRatings() {
  const ratings: Ratings = Object.fromEntries(
    Array.from({ length: MAX_RATED_SHOWN }, (_, index) => [
      `movie-${index + 1}`,
      { rating: 5, ratedAt: "2026-01-01T00:00:00.000Z" },
    ]),
  );
  ratings["movie-9999"] = { rating: 10, ratedAt: "2026-01-02T00:00:00.000Z" };
  ratings["movie-8888"] = { rating: 9, ratedAt: "2026-01-03T00:00:00.000Z" };
  window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));

  getTitlesResolutionByRefs.mockImplementation(async (refs: { id: number; mediaType: "movie" | "tv" }[]) =>
    ({
      items: refs.map((ref) => ({
        ...card,
        id: ref.id,
        media_type: ref.mediaType,
        title: `Film ${ref.id}`,
        poster_path: `/${ref.id}.jpg`,
      })),
      failedRefs: [],
    }),
  );
  return ratings;
}

async function renderRated() {
  await act(async () => {
    render(
      <WatchlistProvider>
        <WatchedProvider><RatedTitles /></WatchedProvider>
      </WatchlistProvider>,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  getTitlesResolutionByRefs.mockReset();
  vi.mocked(toast.showToast).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RatedTitles", () => {
  it("blocks a stale score removal before the changed profile's storage event arrives", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockResolvedValue({ items: [card], failedRefs: [] });
    await renderRated();
    const stored = window.localStorage.getItem(RATINGS_STORAGE_KEY);
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const requests = vi.spyOn(navigator.locks, "request");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove your score for Fight Club" }));
    });

    expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBe(stored);
    expect(requests).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Your active profile changed. Review the current title and try again.", "info",
    );
  });

  it("keeps score removal pending while queued and preserves ratings added before the lock is released", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockResolvedValue({ items: [card], failedRefs: [] });
    await renderRated();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      enter();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await entered;
    const requests = vi.spyOn(navigator.locks, "request");
    const button = screen.getByRole("button", { name: "Remove your score for Fight Club" });

    await act(async () => { fireEvent.click(button); fireEvent.click(button); });

    expect(button.hasAttribute("disabled")).toBe(true);
    expect(requests).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(toast.showToast).not.toHaveBeenCalled();
    const otherScore = { rating: 8, ratedAt: "2026-01-02T00:00:00.000Z" };
    window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify({
      "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
      "tv-949": otherScore,
    }));

    await act(async () => { release(); await holding; });

    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)).toEqual({ "tv-949": otherScore });
    expect(screen.getByText("Title 949")).toBeDefined();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("awaits and reports score removal refused by the lock manager", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockResolvedValue({ items: [card], failedRefs: [] });
    await renderRated();
    vi.spyOn(navigator.locks, "request").mockRejectedValue(new Error("Lock refused"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove your score for Fight Club" }));
    });

    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove your score for Fight Club" }).hasAttribute("disabled"))
      .toBe(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
  });

  it("asks for nothing when nothing is rated", async () => {
    await renderRated();

    expect(screen.getByText("You have not rated anything")).toBeDefined();
    expect(getTitlesResolutionByRefs).not.toHaveBeenCalled();
  });

  it("shows the rated titles once they resolve", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockResolvedValue({ items: [card], failedRefs: [] });
    await renderRated();

    expect(screen.getByText("Fight Club")).toBeDefined();
  });

  it("loads names and posters for the highest scores beyond the first 200 stored ids", async () => {
    saveManyRatings();
    await renderRated();

    expect(screen.getByText("Film 9999")).toBeDefined();
    expect(screen.queryByText("Title 9999")).toBeNull();
    expect(screen.getByRole("link", { name: /Film 9999/ })
      .querySelector("[data-poster-src]")?.getAttribute("data-poster-src"))
      .toContain("/9999.jpg");
    expect(getTitlesResolutionByRefs.mock.calls[0][0]).toHaveLength(MAX_RATED_SHOWN);
    expect(getTitlesResolutionByRefs.mock.calls[0][0]).toContainEqual({ id: 9999, mediaType: "movie" });
  });

  it("loads the displayed selection when score or date ordering changes", async () => {
    saveManyRatings();
    await renderRated();

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Order" }), { target: { value: "lowest" } });
    });
    expect(screen.getByText("Film 200")).toBeDefined();
    expect(screen.queryByText("Film 9999")).toBeNull();
    expect(getTitlesResolutionByRefs.mock.calls[1][0]).toHaveLength(MAX_RATED_SHOWN);
    expect(getTitlesResolutionByRefs.mock.calls[1][0]).toContainEqual({ id: 200, mediaType: "movie" });

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Order" }), { target: { value: "recent" } });
    });
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Film 8888");
    expect(screen.queryByText("Title 8888")).toBeNull();
    expect(getTitlesResolutionByRefs.mock.calls[2][0]).toHaveLength(MAX_RATED_SHOWN);
    expect(getTitlesResolutionByRefs.mock.calls[2][0]).toContainEqual({ id: 8888, mediaType: "movie" });
  });

  it("does not reload unchanged ids when scores change, but resolves newly displayed titles", async () => {
    const ratings = saveManyRatings();
    await renderRated();

    await act(async () => {
      saveRatings({ ...ratings, "movie-1": { rating: 8, ratedAt: "2026-01-04T00:00:00.000Z" } });
    });
    expect(getTitlesResolutionByRefs).toHaveBeenCalledTimes(1);

    await act(async () => {
      saveRatings({ ...ratings, "movie-200": { rating: 10, ratedAt: "2026-01-04T00:00:00.000Z" } });
    });
    expect(getTitlesResolutionByRefs).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Film 200")).toBeDefined();
    expect(getTitlesResolutionByRefs.mock.calls[1][0]).toContainEqual({ id: 200, mediaType: "movie" });
  });

  // The regression: a rejected request rendered as a page with no scores on it,
  // which is exactly what a wiped ratings store looks like.
  it("tells a failed load apart from having rated nothing", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockRejectedValue(new Error("TMDB is down"));
    await renderRated();

    expect(screen.getByText("Could not load title details")).toBeDefined();
    expect(screen.getByText("Title 550")).toBeDefined();
    expect(screen.getByText("9")).toBeDefined();
    expect(screen.getByText(/1 rated/)).toBeDefined();
    expect(screen.queryByText("You have not rated anything")).toBeNull();
  });

  it.each([WATCHLIST_STORAGE_KEY, WATCHED_STORAGE_KEY])(
    "uses metadata from %s and permits score removal while offline",
    async (key) => {
      saveOneRating();
      window.localStorage.setItem(key, JSON.stringify([{
        id: 550,
        title: "Saved Fight Club",
        mediaType: "movie",
        posterPath: "/saved.jpg",
        voteAverage: 8.4,
        releaseDate: "1999-10-15",
        addedAt: "2026-01-01T00:00:00.000Z",
        watchedAt: "2026-01-01T00:00:00.000Z",
      }]));
      getTitlesResolutionByRefs.mockRejectedValue(new TypeError("Offline"));
      await renderRated();

      const link = screen.getByRole("link", { name: /Saved Fight Club/ });
      expect(link.querySelector("[data-poster-src]")?.getAttribute("data-poster-src"))
        .toContain("/saved.jpg");
      expect(screen.getByText("9")).toBeDefined();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Remove your score for Saved Fight Club" }));
      });
      expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)).toEqual({});
      expect(screen.getByText("You have not rated anything")).toBeDefined();
    },
  );

  it("shows scores before a slow network request settles", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockImplementation(() => new Promise(() => {}));
    await renderRated();

    expect(screen.getByText("Title 550")).toBeDefined();
    expect(screen.getByText("9")).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Order" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove your score for Title 550" })).toBeDefined();
  });

  it("offers a retry that asks again", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderRated();

    getTitlesResolutionByRefs.mockResolvedValueOnce({ items: [card], failedRefs: [] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getTitlesResolutionByRefs).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Fight Club")).toBeDefined();
  });

  it("offers a retry for a partial failure and clears the notice when all titles resolve", async () => {
    saveTwoRatings();
    getTitlesResolutionByRefs.mockResolvedValueOnce({
      items: [card],
      failedRefs: [{ id: 949, mediaType: "movie" }],
    });
    await renderRated();

    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(screen.getByText("Title 949")).toBeDefined();
    expect(screen.getByText("Could not load title details")).toBeDefined();
    expect(screen.getByText(/2 rated/)).toBeDefined();

    getTitlesResolutionByRefs.mockResolvedValueOnce({
      items: [card, secondCard],
      failedRefs: [],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getTitlesResolutionByRefs).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(screen.getByText("Heat")).toBeDefined();
    expect(screen.getByRole("link", { name: /Heat/ })
      .querySelector("[data-poster-src]")?.getAttribute("data-poster-src"))
      .toContain("/heat.jpg");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("retains resolved names and posters across partial and complete retry failures", async () => {
    saveTwoRatings();
    getTitlesResolutionByRefs.mockResolvedValueOnce({
      items: [card],
      failedRefs: [{ id: 949, mediaType: "movie" }],
    });
    await renderRated();

    getTitlesResolutionByRefs.mockResolvedValueOnce({
      items: [secondCard],
      failedRefs: [{ id: 550, mediaType: "movie" }],
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(screen.getByText("Heat")).toBeDefined();
    expect(screen.getByRole("link", { name: /Fight Club/ })
      .querySelector("[data-poster-src]")?.getAttribute("data-poster-src"))
      .toContain("/poster.jpg");

    getTitlesResolutionByRefs.mockRejectedValueOnce(new TypeError("Offline"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(screen.getByText("Heat")).toBeDefined();
    expect(screen.getByRole("link", { name: /Heat/ })
      .querySelector("[data-poster-src]")?.getAttribute("data-poster-src"))
      .toContain("/heat.jpg");
    expect(screen.getByText("Could not load title details")).toBeDefined();
    expect(screen.getByText(/2 rated/)).toBeDefined();
  });

  it.each([
    { label: "no titles", items: [] },
    { label: "one title", items: [card] },
  ])("does not offer a retry for removed titles when $label still resolve", async ({ items }) => {
    saveTwoRatings();
    // The resolver excludes 404s from failedRefs, including when all are gone.
    getTitlesResolutionByRefs.mockResolvedValue({ items, failedRefs: [] });
    await renderRated();

    expect(screen.getByText("Title 949")).toBeDefined();
    expect(screen.getByText("9")).toBeDefined();
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("keeps a score and explains when its removal cannot be saved", async () => {
    saveOneRating();
    getTitlesResolutionByRefs.mockResolvedValue({ items: [card], failedRefs: [] });
    await renderRated();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove your score for Fight Club" }));
    });

    expect(screen.getByText("Fight Club")).toBeDefined();
    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating)
      .toBe(9);
    expect(toast.showToast).toHaveBeenCalledWith(STORAGE_REFUSED_MESSAGE, "error");
  });
});
