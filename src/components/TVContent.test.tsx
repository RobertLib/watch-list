// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { TVContent } from "./TVContent";
import { getTVWikipediaContent } from "@/lib/wikipedia";
import type { WikipediaContent } from "@/lib/wikipedia";
import type { TVShowDetails } from "@/types/tmdb";

const api = vi.hoisted(() => ({
  getTVShowDetails: vi.fn(),
  getImageUrl: vi.fn(() => "/poster.jpg"),
}));
const navigation = vi.hoisted(() => ({ id: "series-1" }));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("@/lib/wikipedia", () => ({ getTVWikipediaContent: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ id: navigation.id }),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/DetailPageWatchlistButton", () => ({ DetailPageWatchlistButton: () => null }));
vi.mock("@/components/DetailPageWatchedButton", () => ({ DetailPageWatchedButton: () => null }));
vi.mock("@/components/UserRating", () => ({ UserRating: () => null }));
vi.mock("@/components/GenreTags", () => ({ GenreTags: () => null }));

function series(id: number, wikidataId?: string | null): TVShowDetails {
  return {
    id,
    name: "The Office",
    original_name: "The Office",
    overview: "",
    first_air_date: "2001-07-09",
    last_air_date: null,
    poster_path: null,
    backdrop_path: null,
    vote_average: 8,
    vote_count: 1000,
    adult: false,
    original_language: "en",
    popularity: 20,
    genres: [],
    created_by: [],
    number_of_episodes: 8,
    number_of_seasons: 1,
    episode_run_time: [30],
    production_companies: [],
    production_countries: [],
    spoken_languages: [],
    status: "Ended",
    tagline: null,
    homepage: null,
    in_production: false,
    networks: [],
    seasons: [],
    next_episode_to_air: null,
    last_episode_to_air: null,
    external_ids: { wikidata_id: wikidataId },
  };
}

function article(country: string): WikipediaContent {
  return {
    pageTitle: `The Office (${country} TV series)`,
    pageUrl: `https://en.wikipedia.org/wiki/The_Office_(${country}_TV_series)`,
    intro: `${country} series editorial overview.`,
    sections: [],
  };
}

const wiki = vi.mocked(getTVWikipediaContent);

beforeEach(() => {
  navigation.id = "series-1";
  vi.clearAllMocks();
  wiki.mockReset().mockResolvedValue(null);
  api.getTVShowDetails.mockImplementation(async (id: number) =>
    series(id, id === 1 ? "Q123" : "Q456"),
  );
});
afterEach(cleanup);

describe("TVContent Wikipedia identity", () => {
  it("uses separate identities and clears the previous article for identically named series", async () => {
    let finish!: (content: WikipediaContent) => void;
    wiki
      .mockResolvedValueOnce(article("British"))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<TVContent />);
    await screen.findByText("British series editorial overview.");
    expect(wiki).toHaveBeenLastCalledWith("Q123");
    expect(api.getTVShowDetails.mock.calls[0][1].split(",")).toContain("external_ids");

    navigation.id = "series-2";
    view.rerender(<TVContent />);
    await waitFor(() => expect(wiki).toHaveBeenLastCalledWith("Q456"));
    expect(screen.queryByText("British series editorial overview.")).toBeNull();

    await act(async () => { finish(article("American")); });
    expect(screen.getByText("American series editorial overview.")).toBeTruthy();
  });

  it.each([undefined, null])("omits the previous article when the next series has Wikidata ID %s", async (wikidataId) => {
    wiki.mockImplementation(async (id) => id === "Q123" ? article("British") : null);
    api.getTVShowDetails.mockImplementation(async (id: number) =>
      series(id, id === 1 ? "Q123" : wikidataId),
    );
    const view = render(<TVContent />);
    await screen.findByText("British series editorial overview.");

    navigation.id = "series-2";
    view.rerender(<TVContent />);
    await waitFor(() => expect(wiki).toHaveBeenLastCalledWith(wikidataId));

    expect(screen.queryByText("British series editorial overview.")).toBeNull();
    expect(screen.queryByText("Editorial Insights")).toBeNull();
    expect(wiki.mock.calls.some(([id]) => id === "The Office")).toBe(false);
  });

  it("ignores an old article that arrives after navigating to another version", async () => {
    let finishOld!: (content: WikipediaContent) => void;
    wiki
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce(article("American"));
    const view = render(<TVContent />);
    await waitFor(() => expect(wiki).toHaveBeenCalledWith("Q123"));

    navigation.id = "series-2";
    view.rerender(<TVContent />);
    await screen.findByText("American series editorial overview.");

    await act(async () => { finishOld(article("British")); });
    expect(screen.queryByText("British series editorial overview.")).toBeNull();
    expect(screen.getByText("American series editorial overview.")).toBeTruthy();
  });
});
