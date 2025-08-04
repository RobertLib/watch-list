// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MovieContent } from "./MovieContent";
import { TVContent } from "./TVContent";
import { refreshSettings, setRegion } from "@/lib/settings";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";

const api = vi.hoisted(() => ({
  getMovieDetails: vi.fn(),
  getTVShowDetails: vi.fn(),
  getImageUrl: vi.fn(() => "/poster.jpg"),
}));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("@/lib/wikipedia", () => ({
  getMovieWikipediaContent: vi.fn().mockResolvedValue(null),
  getTVWikipediaContent: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("id=example-1"),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));
// These controls need personal-data contexts but do not participate in ratings.
vi.mock("@/components/DetailPageWatchlistButton", () => ({ DetailPageWatchlistButton: () => null }));
vi.mock("@/components/DetailPageWatchedButton", () => ({ DetailPageWatchedButton: () => null }));
vi.mock("@/components/UserRating", () => ({ UserRating: () => null }));
vi.mock("@/components/GenreTags", () => ({ GenreTags: () => null }));

const common = {
  id: 1,
  overview: "",
  poster_path: null,
  backdrop_path: null,
  vote_average: 8,
  vote_count: 1000,
  adult: false,
  original_language: "en",
  popularity: 20,
  genres: [],
  production_companies: [],
  production_countries: [],
  spoken_languages: [],
  tagline: null,
  homepage: null,
};
const movie: MovieDetails = {
  ...common,
  title: "Example Movie",
  original_title: "Example Movie",
  release_date: "2020-01-01",
  video: false,
  runtime: 120,
  budget: 0,
  revenue: 0,
  status: "Released",
  imdb_id: null,
  belongs_to_collection: null,
  release_dates: {
    id: 1,
    results: [
      { iso_3166_1: "US", release_dates: [{ certification: "R", iso_639_1: "", release_date: "2020-01-01", type: 3, note: "" }] },
      { iso_3166_1: "GB", release_dates: [{ certification: "15", iso_639_1: "", release_date: "2020-01-01", type: 3, note: "" }] },
    ],
  },
};
const tv: TVShowDetails = {
  ...common,
  name: "Example Series",
  original_name: "Example Series",
  first_air_date: "2020-01-01",
  last_air_date: null,
  created_by: [],
  number_of_episodes: 8,
  number_of_seasons: 1,
  episode_run_time: [45],
  status: "Returning Series",
  in_production: true,
  networks: [],
  seasons: [],
  next_episode_to_air: null,
  last_episode_to_air: null,
  content_ratings: {
    id: 1,
    results: [
      { iso_3166_1: "US", rating: "TV-MA" },
      { iso_3166_1: "GB", rating: "15" },
    ],
  },
};

beforeEach(() => {
  window.localStorage.clear();
  refreshSettings();
  setRegion("GB");
  vi.clearAllMocks();
  api.getMovieDetails.mockResolvedValue(movie);
  api.getTVShowDetails.mockResolvedValue(tv);
});
afterEach(cleanup);

function contentRating(type: "Movie" | "TVSeries"): string | undefined {
  return [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => JSON.parse(script.textContent ?? "{}"))
    .find((record) => record["@type"] === type)?.contentRating;
}

describe.each([
  { kind: "Movie" as const, page: <MovieContent />, fetch: api.getMovieDetails, us: "R" },
  { kind: "TVSeries" as const, page: <TVContent />, fetch: api.getTVShowDetails, us: "TV-MA" },
])("$kind age rating", ({ kind, page, fetch, us }) => {
  it("updates the visible and structured rating when the selected country changes", async () => {
    await act(async () => { render(page); });

    expect(screen.getByText("Age Rating (GB):")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(contentRating(kind)).toBe("15");

    act(() => { setRegion("US"); });

    expect(screen.getByText("Age Rating (US):")).toBeTruthy();
    expect(screen.getByText(us)).toBeTruthy();
    expect(contentRating(kind)).toBe(us);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("identifies the US fallback when the selected country's rating is missing", async () => {
    setRegion("CZ");
    await act(async () => { render(page); });

    expect(screen.getByText("Age Rating (US):")).toBeTruthy();
    expect(screen.queryByText("Age Rating (CZ):")).toBeNull();
    expect(screen.getByText(us)).toBeTruthy();
    expect(contentRating(kind)).toBe(us);
  });
});
