// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TonightPicker } from "./TonightPicker";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { getWatchlist, WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { getWatched } from "@/lib/watched";
import { refreshSettings } from "@/lib/settings";
import {
  getCachedMovieDetails,
  getCachedMovieWatchProviders,
  getCachedTVShowDetails,
  getCachedTVWatchProviders,
} from "@/lib/tmdb-cache";
import { createProfileLockManager } from "@/test/profile-locks";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";

// Keep the shortlist loader, action and providers real: the full catalogue date
// must survive the path through Tonight's candidate and into watched storage.
vi.mock("@/lib/tmdb-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/tmdb-cache")>(),
  getCachedMovieDetails: vi.fn(),
  getCachedTVShowDetails: vi.fn(),
  getCachedMovieWatchProviders: vi.fn(),
  getCachedTVWatchProviders: vi.fn(),
}));
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

beforeEach(() => {
  window.localStorage.clear();
  refreshSettings();
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.mocked(getCachedMovieDetails).mockReset();
  vi.mocked(getCachedTVShowDetails).mockReset();
  vi.mocked(getCachedMovieWatchProviders).mockReset().mockResolvedValue({ id: 550, results: {} });
  vi.mocked(getCachedTVWatchProviders).mockReset().mockResolvedValue({ id: 1396, results: {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("marking Tonight's pick watched", () => {
  it.each([
    { mediaType: "movie", title: "Fight Club", saved: "1999-10-15", fetched: "1999-10-15", expected: "1999-10-15" },
    { mediaType: "tv", title: "Breaking Bad", saved: "2008-01-20", fetched: "2008-01-20", expected: "2008-01-20" },
    { mediaType: "movie", title: "Undated film", saved: "", fetched: "", expected: "" },
    { mediaType: "tv", title: "Undated series", saved: "", fetched: null, expected: "" },
    { mediaType: "movie", title: "Film missing its current date", saved: "1999-10-15", fetched: "", expected: "1999-10-15" },
    { mediaType: "tv", title: "Series missing its current date", saved: "2008-01-20", fetched: null, expected: "2008-01-20" },
    { mediaType: "movie", title: "Film with an invalid current date", saved: "1999-10-15", fetched: "1999-02-30", expected: "1999-10-15" },
    { mediaType: "tv", title: "Series with an invalid current date", saved: "2008-01-20", fetched: "2008-02-30", expected: "2008-01-20" },
    { mediaType: "movie", title: "Film with an updated date", saved: "1999-10-14", fetched: "1999-10-15", expected: "1999-10-15" },
    { mediaType: "tv", title: "Series with an updated date", saved: "2008-01-19", fetched: "2008-01-20", expected: "2008-01-20" },
  ] as const)("preserves $title's release date and removes it from the queue", async ({ mediaType, title, saved, fetched, expected }) => {
    const id = mediaType === "movie" ? 550 : 1396;
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
      id, title, mediaType, posterPath: null, voteAverage: 8,
      releaseDate: saved, addedAt: "2026-01-01T00:00:00.000Z",
    }]));
    if (mediaType === "movie") {
      const details: Partial<MovieDetails> = {
        id, title, release_date: fetched, status: "Released",
        runtime: 100, genres: [], vote_average: 8,
      };
      vi.mocked(getCachedMovieDetails).mockResolvedValue(details as MovieDetails);
    } else {
      const details: Partial<TVShowDetails> = {
        id, name: title, first_air_date: fetched, status: "Ended",
        episode_run_time: [45], genres: [], vote_average: 8,
      };
      vi.mocked(getCachedTVShowDetails).mockResolvedValue(details as TVShowDetails);
    }

    await act(async () => {
      render(<WatchlistProvider><WatchedProvider><TonightPicker /></WatchedProvider></WatchlistProvider>);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `Mark ${title} as watched` }));
    });

    expect(getWatched()).toEqual([expect.objectContaining({
      id, title, mediaType, releaseDate: expected,
    })]);
    expect(getWatchlist()).toEqual([]);
  });
});
