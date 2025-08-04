// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalendarContent } from "./CalendarContent";
import { TonightPicker } from "./TonightPicker";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import {
  getCachedMovieDetails,
  getCachedMovieWatchProviders,
  getCachedTVShowDetails,
  getCachedTVWatchProviders,
} from "@/lib/tmdb-cache";
import { refreshSettings, setSelectedProviderIds } from "@/lib/settings";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";

// Keep api.ts and its resolvers real: mocking the public API hid the swallowed
// network errors from the component-only failure tests.
vi.mock("@/lib/tmdb-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tmdb-cache")>()),
  getCachedMovieDetails: vi.fn().mockRejectedValue(new TypeError("offline")),
  getCachedTVShowDetails: vi.fn(),
  getCachedMovieWatchProviders: vi.fn().mockRejectedValue(new TypeError("offline")),
  getCachedTVWatchProviders: vi.fn().mockRejectedValue(new TypeError("offline")),
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
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
    id: 1396,
    title: "Breaking Bad",
    mediaType: "tv",
    posterPath: "/poster.jpg",
    voteAverage: 8.9,
    releaseDate: "2008-01-20",
    addedAt: "2026-01-01T00:00:00.000Z",
  }]));
  vi.mocked(getCachedTVShowDetails).mockReset().mockRejectedValue(
    new Error("TMDB API error: 503 Service Unavailable"),
  );
  vi.mocked(getCachedTVWatchProviders).mockReset().mockRejectedValue(
    new Error("TMDB API error: 503 Service Unavailable"),
  );
  vi.mocked(getCachedMovieDetails).mockReset().mockRejectedValue(new TypeError("offline"));
  vi.mocked(getCachedMovieWatchProviders).mockReset().mockRejectedValue(new TypeError("offline"));
  refreshSettings();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderPage(page: React.ReactNode) {
  await act(async () => {
    render(
      <WatchlistProvider>
        <WatchedProvider>
          <EpisodeProgressProvider>{page}</EpisodeProgressProvider>
        </WatchedProvider>
      </WatchlistProvider>,
    );
  });
}

function filmDetails(id: number, title = `Film ${id}`): MovieDetails {
  return {
    id, title, original_title: title, original_language: "en", overview: "",
    poster_path: null, backdrop_path: null, release_date: "2020-01-01",
    vote_average: 8, vote_count: 100, popularity: 1, adult: false, video: false,
    runtime: 100, genres: [], budget: 0, revenue: 0, production_companies: [],
    production_countries: [], spoken_languages: [], status: "Released",
    tagline: null, imdb_id: null, homepage: null, belongs_to_collection: null,
  };
}

function seriesDetails(name = "Breaking Bad"): TVShowDetails {
  return {
    id: 1396, name, original_name: name, original_language: "en", overview: "",
    poster_path: null, backdrop_path: null, first_air_date: "2008-01-20",
    vote_average: 8, vote_count: 100, popularity: 1, adult: false,
    episode_run_time: [47], genres: [], created_by: [], number_of_episodes: 1,
    number_of_seasons: 1, production_companies: [], production_countries: [],
    spoken_languages: [], status: "Ended", tagline: null, homepage: null,
    last_air_date: "2008-01-20", in_production: false, networks: [], seasons: [],
    next_episode_to_air: null, last_episode_to_air: null,
  };
}

describe("personal pages through the real API", () => {
  it("can choose the only playable title even when it was saved before 60 newer titles", async () => {
    setSelectedProviderIds([8]);
    const movieEntries = Array.from({ length: 60 }, (_, index) => ({
      id: index + 1, title: `Film ${index + 1}`, mediaType: "movie",
      posterPath: null, voteAverage: 7, releaseDate: "2020-01-01",
      addedAt: "2026-01-02T00:00:00.000Z",
    }));
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
      ...movieEntries,
      { id: 1396, title: "Older series", mediaType: "tv", posterPath: null,
        voteAverage: 8, releaseDate: "2008-01-20", addedAt: "2026-01-01T00:00:00.000Z" },
    ]));
    vi.mocked(getCachedMovieDetails).mockImplementation(async (id) => filmDetails(id));
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue({ id: 1, results: {} });
    vi.mocked(getCachedTVShowDetails).mockResolvedValue(seriesDetails("Older series"));
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue({
      id: 1396, results: { US: { link: "https://example.com", flatrate: [{
        provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 1,
      }] } },
    });

    await renderPage(<TonightPicker />);
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));

    expect(screen.getByRole("link", { name: "Older series" })).toBeDefined();
    expect(screen.getByText(/1 of 61 saved titles/)).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(getCachedTVShowDetails).toHaveBeenCalled();
  });

  it("retains a good pick and retries missing details without resetting the series filter", async () => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
      { id: 550, title: "Fight Club", mediaType: "movie", posterPath: null,
        voteAverage: 8, releaseDate: "1999-10-15", addedAt: "2026-01-02T00:00:00.000Z" },
      { id: 1396, title: "Breaking Bad", mediaType: "tv", posterPath: null,
        voteAverage: 8, releaseDate: "2008-01-20", addedAt: "2026-01-01T00:00:00.000Z" },
    ]));
    vi.mocked(getCachedMovieDetails).mockResolvedValue(filmDetails(550, "Fight Club"));
    vi.mocked(getCachedMovieWatchProviders).mockResolvedValue({ id: 550, results: {} });
    vi.mocked(getCachedTVWatchProviders).mockResolvedValue({ id: 1396, results: {} });

    await renderPage(<TonightPicker />);
    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Series" }));

    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/details/i);

    vi.mocked(getCachedTVShowDetails).mockResolvedValue(seriesDetails());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })));

    expect(screen.getByRole("link", { name: "Breaking Bad" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Series" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(2);
  });

  it("shows a calendar outage and recovers through Try again", async () => {
    await renderPage(<CalendarContent />);
    expect(screen.getByText("Could not load your calendar")).toBeDefined();
    expect(screen.queryByText("Nothing on the horizon")).toBeNull();

    vi.mocked(getCachedTVShowDetails).mockResolvedValue({
      id: 1396, name: "Breaking Bad", status: "Ended", in_production: false,
      next_episode_to_air: null,
    } as TVShowDetails);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })));
    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(2);
  });

  it("shows a shortlist outage instead of blaming the filters", async () => {
    await renderPage(<TonightPicker />);
    expect(screen.getByText("Could not pick anything tonight")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();

    // A real 404 is an empty result, and demonstrates that retry calls TMDB again.
    vi.mocked(getCachedTVShowDetails).mockRejectedValue(
      new Error("TMDB API error: 404 Not Found"),
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })));
    expect(screen.queryByText("Could not pick anything tonight")).toBeNull();
    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();
    expect(getCachedTVShowDetails).toHaveBeenCalledTimes(2);
  });

  it("retries a provider-only outage without asking the visitor to loosen filters", async () => {
    setSelectedProviderIds([8]);
    // Title details still load from a warm cache while availability is down.
    vi.mocked(getCachedTVShowDetails).mockResolvedValue({
      id: 1396, name: "Breaking Bad", episode_run_time: [47],
      genres: [{ id: 18, name: "Drama" }], vote_average: 8.9,
      first_air_date: "2008-01-20",
    } as TVShowDetails);
    await renderPage(<TonightPicker />);
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));

    expect(screen.getByText("Could not check streaming availability")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(screen.queryByRole("link", { name: "Breaking Bad" })).toBeNull();
    expect(screen.getByText(/0 of 1 saved titles are confirmed to fit/)).toBeDefined();

    vi.mocked(getCachedTVWatchProviders).mockResolvedValue({
      id: 1396,
      results: { US: { link: "https://example.com", flatrate: [{
        provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 1,
      }] } },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })));

    expect(getCachedTVWatchProviders).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Could not check streaming availability")).toBeNull();
    expect(screen.getByRole("link", { name: "Breaking Bad" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Only what I can play now" })
      .getAttribute("aria-pressed")).toBe("true");
  });
});
