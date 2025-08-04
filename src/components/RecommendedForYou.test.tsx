// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MediaItem, Movie } from "@/types/tmdb";
import type { WatchlistItem } from "@/lib/watchlist";
import type { WatchedItem } from "@/lib/watched";
import type { TMDBRequestOptions } from "@/lib/tmdb-cache";
import { RecommendedForYou } from "./RecommendedForYou";
import {
  REGION_KEY,
  setRegion,
  setSelectedProviderIds,
  setWatchProviderFilter,
} from "@/lib/settings";

const { lists, getMovieRecommendations, ratingFor } = vi.hoisted(() => ({
  lists: {
    watchlist: [] as WatchlistItem[],
    watched: [] as WatchedItem[],
  },
  getMovieRecommendations: vi.fn(),
  ratingFor: vi.fn(() => null),
}));

vi.mock("@/contexts/WatchlistContext", () => ({
  useWatchlist: () => ({ watchlist: lists.watchlist, isLoading: false }),
}));
vi.mock("@/contexts/WatchedContext", () => ({
  useWatched: () => ({ watched: lists.watched, isLoading: false }),
}));
vi.mock("@/hooks/useRatings", () => ({
  useRatings: () => ({ ratingFor }),
}));
vi.mock("@/lib/tmdb", () => ({
  tmdbApi: { getMovieRecommendations, getTVShowRecommendations: vi.fn() },
}));
vi.mock("@/components/MediaCarousel", () => ({
  MediaCarousel: ({ items }: { items: MediaItem[] }) => (
    <ul>
      {items.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>
  ),
}));

function recommended(id: number): Movie {
  return {
    id,
    title: `Movie ${id}`,
    overview: "",
    poster_path: `/poster-${id}.jpg`,
    backdrop_path: null,
    release_date: "1999-01-01",
    vote_average: 7,
    vote_count: 500,
    genre_ids: [],
    adult: false,
    original_language: "en",
    original_title: `Movie ${id}`,
    popularity: 1,
    video: false,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  setRegion("US");
  vi.useFakeTimers();
  lists.watchlist = [];
  lists.watched = [];
  getMovieRecommendations.mockReset();
  getMovieRecommendations.mockImplementation(async (id: number) => ({
    results: id === 1 ? [recommended(9999), recommended(8888)] : [],
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it.each(["watchlist", "watched"] as const)(
  "excludes a title beyond the two-thousandth entry of the %s",
  async (list) => {
    const entries = Array.from({ length: 2001 }, (_, index) => {
      const savedAt = new Date(Date.UTC(2026, 9, 4) - index * 86_400_000).toISOString();
      return {
        id: index === 2000 ? 9999 : index + 1,
        mediaType: "movie" as const,
        title: `Saved ${index}`,
        posterPath: null,
        voteAverage: 7,
        releaseDate: "1999-01-01",
        addedAt: savedAt,
        watchedAt: savedAt,
      };
    });
    lists[list] = entries;

    render(<RecommendedForYou />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(550);
    });

    expect(screen.getByText("Movie 8888")).toBeTruthy();
    expect(screen.queryByText("Movie 9999")).toBeNull();
    expect(getMovieRecommendations).toHaveBeenCalledTimes(6);
  },
);

function savedFilm(): WatchlistItem {
  return {
    id: 1,
    mediaType: "movie",
    title: "Saved film",
    posterPath: null,
    voteAverage: 7,
    releaseDate: "1999-01-01",
    addedAt: "2026-10-04T12:00:00.000Z",
  };
}

it("hides recommendations based on a previous list during the refresh debounce", async () => {
  lists.watchlist = [savedFilm()];
  getMovieRecommendations
    .mockResolvedValueOnce({ results: [recommended(100)] })
    .mockResolvedValueOnce({ results: [recommended(200)] });
  const view = render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });
  expect(screen.getByText("Movie 100")).toBeTruthy();

  lists.watchlist = [{ ...savedFilm(), id: 2, title: "Another profile's film" }];
  view.rerender(<RecommendedForYou />);
  expect(screen.queryByText("Movie 100")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(screen.getByText("Movie 200")).toBeTruthy();
  expect(screen.queryByText("Movie 100")).toBeNull();
});

const settingsChanges = [
  { name: "region in another tab", change: () => {
    window.localStorage.setItem(REGION_KEY, "CZ");
    window.dispatchEvent(new StorageEvent("storage", { key: REGION_KEY, newValue: "CZ" }));
  } },
  { name: "streaming filter", change: () => setWatchProviderFilter("streaming-only") },
  { name: "selected providers", change: () => setSelectedProviderIds([8]) },
];

it.each(settingsChanges)("refreshes recommendations after changing $name", async ({ change }) => {
  lists.watchlist = [savedFilm()];
  getMovieRecommendations
    .mockResolvedValueOnce({ results: [recommended(100)] })
    .mockResolvedValueOnce({ results: [recommended(200)] });
  render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });
  expect(screen.getByText("Movie 100")).toBeTruthy();

  act(change);
  expect(screen.queryByText("Movie 100")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(getMovieRecommendations).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Movie 200")).toBeTruthy();
});

it("ignores a pending recommendation response for previous settings", async () => {
  lists.watchlist = [savedFilm()];
  let resolve!: (response: { results: Movie[] }) => void;
  const previous = new Promise<{ results: Movie[] }>((done) => { resolve = done; });
  getMovieRecommendations
    .mockReturnValueOnce(previous)
    .mockResolvedValueOnce({ results: [recommended(200)] });
  render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });
  const previousSignal = getMovieRecommendations.mock.calls[0][1].signal as AbortSignal;

  act(() => setRegion("CZ"));
  expect(previousSignal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });
  expect(screen.getByText("Movie 200")).toBeTruthy();

  await act(async () => { resolve({ results: [recommended(100)] }); });

  expect(screen.queryByText("Movie 100")).toBeNull();
  expect(screen.getByText("Movie 200")).toBeTruthy();
});

it("shows a load failure and retries the current recommendations", async () => {
  lists.watchlist = [savedFilm()];
  getMovieRecommendations
    .mockRejectedValueOnce(new Error("TMDB API error: 503 Unavailable"))
    .mockResolvedValueOnce({ results: [recommended(200)] });
  render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(screen.getByRole("alert").textContent).toContain("Could not load recommendations");
  const previousSignal = getMovieRecommendations.mock.calls[0][1].signal as AbortSignal;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(getMovieRecommendations).toHaveBeenCalledTimes(2);
  const retrySignal = getMovieRecommendations.mock.calls[1][1].signal as AbortSignal;
  expect(previousSignal.aborted).toBe(true);
  expect(retrySignal).not.toBe(previousSignal);
  expect(retrySignal.aborted).toBe(false);
  expect(screen.getByText("Movie 200")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not report a failure for a successfully empty recommendation list", async () => {
  lists.watchlist = [savedFilm()];
  getMovieRecommendations.mockResolvedValueOnce({ results: [] });
  const view = render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(view.container.textContent).toBe("");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("hides the previous list's failure while requesting picks for a new list", async () => {
  lists.watchlist = [savedFilm()];
  getMovieRecommendations
    .mockRejectedValueOnce(new Error("TMDB API error: 503 Unavailable"))
    .mockResolvedValueOnce({ results: [recommended(200)] });
  const view = render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });
  expect(screen.getByRole("alert")).toBeTruthy();

  lists.watchlist = [{ ...savedFilm(), id: 2, title: "A new profile's film" }];
  view.rerender(<RecommendedForYou />);
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(screen.getByText("Movie 200")).toBeTruthy();
});

it("ignores a pending failure for previous settings", async () => {
  lists.watchlist = [savedFilm()];
  const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let reject!: (error: Error) => void;
  const previous = new Promise<never>((_, fail) => { reject = fail; });
  getMovieRecommendations
    .mockReturnValueOnce(previous)
    .mockResolvedValueOnce({ results: [recommended(200)] });
  render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  act(() => setRegion("CZ"));
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });
  await act(async () => { reject(new Error("TMDB API error: 503 Unavailable")); });

  expect(screen.getByText("Movie 200")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(errors).not.toHaveBeenCalled();
});

it("does not start requests when unmounted during the debounce", async () => {
  lists.watchlist = [savedFilm()];
  const view = render(<RecommendedForYou />);
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(550); });

  expect(getMovieRecommendations).not.toHaveBeenCalled();
});

it.each(["unmount", "empty list", "new list"] as const)(
  "cancels an active load on %s without reporting an error",
  async (change) => {
    lists.watchlist = [savedFilm()];
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let signal!: AbortSignal;
    getMovieRecommendations.mockImplementationOnce((_id: number, options: TMDBRequestOptions) => {
      signal = options.signal!;
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    getMovieRecommendations.mockResolvedValueOnce({ results: [recommended(200)] });
    const view = render(<RecommendedForYou />);
    await act(async () => { await vi.advanceTimersByTimeAsync(550); });
    expect(signal.aborted).toBe(false);

    await act(async () => {
      if (change === "unmount") {
        view.unmount();
      } else {
        lists.watchlist = change === "empty list"
          ? []
          : [{ ...savedFilm(), id: 2, title: "Another profile's film" }];
        view.rerender(<RecommendedForYou />);
      }
    });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(errors).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(550); });
    if (change === "new list") {
      expect(screen.getByText("Movie 200")).toBeTruthy();
      expect(getMovieRecommendations).toHaveBeenCalledTimes(2);
    } else {
      expect(view.container.textContent).toBe("");
      expect(getMovieRecommendations).toHaveBeenCalledTimes(1);
    }
  },
);
