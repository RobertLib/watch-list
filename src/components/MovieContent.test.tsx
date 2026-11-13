// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MovieContent } from "./MovieContent";
import { getMovieWikipediaContent } from "@/lib/wikipedia";
import type { WikipediaContent } from "@/lib/wikipedia";
import type { CastMember, MovieDetails, Video } from "@/types/tmdb";

// No `getMovieVideos` on purpose: the trailer button must not need it.
const api = vi.hoisted(() => ({
  getMovieDetails: vi.fn(),
  getImageUrl: vi.fn(() => "/poster.jpg"),
}));

// Where the visitor is. The build's snapshot knows only its own region.
const settings = vi.hoisted(() => ({ region: "US" }));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => settings }));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("@/lib/wikipedia", () => ({ getMovieWikipediaContent: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("id=dr-strangelove-935"),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
// Marked, so a test can tell a client-side Link from a plain <a>.
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a href={href} data-next-link="" data-prefetch={String(prefetch)}>{children}</a>
  ),
}));
vi.mock("@/components/DetailPageWatchlistButton", () => ({ DetailPageWatchlistButton: () => null }));
vi.mock("@/components/DetailPageWatchedButton", () => ({ DetailPageWatchedButton: () => null }));
vi.mock("@/components/UserRating", () => ({ UserRating: () => null }));
vi.mock("@/components/GenreTags", () => ({ GenreTags: () => null }));

function cast(id: number, name: string, character: string, order: number): CastMember {
  return { id, name, character, order, profile_path: null };
}

function video(key: string, official: boolean): Video {
  return {
    id: key, key, name: `Trailer ${key}`, site: "YouTube", type: "Trailer",
    official, published_at: "2026-01-01T00:00:00.000Z",
  };
}

function film(wikidataId?: string | null): MovieDetails {
  return {
    id: 935,
    title: "Dr. Strangelove",
    original_title: "Dr. Strangelove",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "1964-01-29",
    vote_average: 8,
    vote_count: 1000,
    adult: false,
    original_language: "en",
    popularity: 20,
    video: false,
    genres: [],
    runtime: 95,
    budget: 0,
    revenue: 0,
    production_companies: [],
    production_countries: [],
    spoken_languages: [],
    status: "Released",
    tagline: null,
    imdb_id: null,
    homepage: null,
    belongs_to_collection: null,
    credits: {
      cast: [
        cast(12446, "Peter Sellers", "Group Capt. Lionel Mandrake", 0),
        cast(12446, "Peter Sellers", "President Merkin Muffley", 1),
        cast(12446, "Peter Sellers", "Dr. Strangelove", 2),
        cast(862, "George C. Scott", "Gen. 'Buck' Turgidson", 3),
      ],
      crew: [
        { id: 240, name: "Stanley Kubrick", job: "Director", department: "Directing", profile_path: null },
        { id: 240, name: "Stanley Kubrick", job: "Screenplay", department: "Writing", profile_path: null },
        { id: 3355, name: "Terry Southern", job: "Screenplay", department: "Writing", profile_path: null },
      ],
    },
    videos: { id: 935, results: [video("k-fan-cut", false), video("k-official", true)] },
    external_ids: { wikidata_id: wikidataId },
  };
}

const wiki = vi.mocked(getMovieWikipediaContent);
const article: WikipediaContent = {
  pageTitle: "Dr. Strangelove",
  pageUrl: "https://en.wikipedia.org/wiki/Dr._Strangelove",
  intro: "Dr. Strangelove is a 1964 political satire black comedy film.",
  sections: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  settings.region = "US";
  wiki.mockReset().mockResolvedValue(null);
  api.getMovieDetails.mockResolvedValue(film("Q105702"));
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("MovieContent key crew", () => {
  /**
   * These were plain <a href>s. In a static export that is a full document
   * load per click: the app boots again and the in-memory TMDB cache is gone.
   */
  it("links the director and writers client-side, without prefetching", async () => {
    await act(async () => { render(<MovieContent />); });

    const director = screen.getAllByRole("link", { name: "Stanley Kubrick" })[0];
    expect(director.getAttribute("href")).toBe("/person?id=stanley-kubrick-240");
    for (const name of ["Stanley Kubrick", "Terry Southern"]) {
      for (const link of screen.getAllByRole("link", { name })) {
        expect(link.hasAttribute("data-next-link")).toBe(true);
        expect(link.getAttribute("data-prefetch")).toBe("false");
      }
    }
  });
});

describe("MovieContent cast", () => {
  // TMDB bills Peter Sellers three times here – one card per billing, all
  // three keyed by the same id.
  it("shows an actor with several roles once, with every role", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => { render(<MovieContent />); });

    const castSection = screen.getByRole("heading", { name: "Main Cast" }).parentElement!;
    const names = [...castSection.querySelectorAll("h3")].map((heading) => heading.textContent);
    expect(names).toEqual(["Peter Sellers", "George C. Scott"]);
    expect(castSection.textContent).toContain(
      "Group Capt. Lionel Mandrake / President Merkin Muffley / Dr. Strangelove",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    consoleError.mockRestore();
  });
});

describe("MovieContent trailer", () => {
  // The page already has `videos`; the button plays from them – and plays the
  // same official-first pick the poster's play button would.
  it("plays the official trailer from the page's own videos", async () => {
    await act(async () => { render(<MovieContent />); });

    fireEvent.click(screen.getByRole("button", { name: "Play movie trailer" }));

    const player = screen.getByTitle("Trailer k-official");
    expect(player.getAttribute("src")).toContain("/embed/k-official?");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("MovieContent Wikipedia identity", () => {
  it("asks TMDB for the film's external ids and finds the article by Wikidata id", async () => {
    wiki.mockResolvedValue(article);
    await act(async () => { render(<MovieContent />); });

    await screen.findByText(article.intro!);
    expect(api.getMovieDetails.mock.calls[0][1].split(",")).toContain("external_ids");
    expect(wiki).toHaveBeenCalledWith("Q105702");
    expect(wiki.mock.calls.flat()).not.toContain("Dr. Strangelove");
  });

  // Without an identity the panel is left out, not filled by a title search
  // that could land on a namesake.
  it.each([undefined, null])("passes on a missing Wikidata id (%s) and shows no panel", async (id) => {
    api.getMovieDetails.mockResolvedValue(film(id));
    await act(async () => { render(<MovieContent />); });

    await waitFor(() => expect(wiki).toHaveBeenCalledWith(id));
    expect(screen.queryByText("Editorial Insights")).toBeNull();
  });
});

describe("MovieContent snapshot", () => {
  // A prerendered film page starts from the build's snapshot. When the
  // browser's own request fails – offline with the saved page, or TMDB refusing
  // it – the film the visitor is reading must stay on screen.
  it("keeps the snapshot when the live load fails, with a retry beside it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.getMovieDetails
      .mockRejectedValueOnce(new Error("TMDB API error: 503 Service Unavailable"))
      .mockResolvedValueOnce({ ...film(null), title: "Dr. Strangelove (live)" });

    await act(async () => {
      render(<MovieContent slug="dr-strangelove-935" snapshot={film(null)} />);
    });

    expect(screen.getByRole("heading", { level: 1, name: "Dr. Strangelove" })).toBeTruthy();
    expect(screen.queryByText("Could not load this film")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("saved copy");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByRole("heading", { level: 1, name: "Dr. Strangelove (live)" })).toBeTruthy();
    expect(screen.queryByText(/saved copy/)).toBeNull();
  });

  it("says the film is gone when TMDB answers 404 behind the snapshot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.getMovieDetails.mockRejectedValueOnce(new Error("TMDB API error: 404 Not Found"));

    await act(async () => {
      render(<MovieContent slug="dr-strangelove-935" snapshot={film(null)} />);
    });

    expect(screen.getByText("Movie not found")).toBeTruthy();
  });
});

describe("MovieContent where to watch", () => {
  const netflix = { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg", display_priority: 1 };
  /** A build's snapshot: one region's providers, and the day it was taken. */
  const snapshot = (): MovieDetails => ({
    ...film(null),
    snapshot_date: "2026-11-13",
    "watch/providers": { id: 935, results: { US: { link: "", flatrate: [netflix] } } },
  });

  it("answers from the snapshot for a visitor in the build's region, dated as taken", async () => {
    api.getMovieDetails.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      render(<MovieContent slug="dr-strangelove-935" snapshot={snapshot()} />);
    });

    expect(screen.getByRole("heading", { level: 2, name: "Where to watch Dr. Strangelove" })).toBeTruthy();
    expect(screen.getByText("Dr. Strangelove is streaming on Netflix.")).toBeTruthy();
    expect(screen.getByText(/Checked November 13, 2026/)).toBeTruthy();
  });

  // The snapshot says nothing about any other country. Before the visitor's
  // own providers load – and for as long as that load fails – "not available
  // here" would be a claim with nothing behind it.
  it("does not call a title unavailable in a region the snapshot knows nothing about", async () => {
    settings.region = "CZ";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.getMovieDetails.mockRejectedValue(new Error("TMDB API error: 503 Service Unavailable"));
    await act(async () => {
      render(<MovieContent slug="dr-strangelove-935" snapshot={snapshot()} />);
    });

    expect(screen.getByRole("heading", { level: 2, name: "Where to watch Dr. Strangelove" })).toBeTruthy();
    expect(screen.getByText("Checking where it is available in your region…")).toBeTruthy();
    expect(screen.queryByText(/not available/)).toBeNull();
    expect(screen.queryByText(/streaming on Netflix/)).toBeNull();
  });

  it("says so once the visitor's own answer shows the title is not available there", async () => {
    settings.region = "CZ";
    // The browser's own answer carries every region that has the title: CZ is
    // not among them.
    api.getMovieDetails.mockResolvedValue({
      ...film(null),
      "watch/providers": { id: 935, results: { US: { link: "", flatrate: [netflix] } } },
    });
    await act(async () => {
      render(<MovieContent slug="dr-strangelove-935" snapshot={snapshot()} />);
    });

    expect(
      screen.getByText("Dr. Strangelove is not available to stream, rent or buy here right now."),
    ).toBeTruthy();
    expect(screen.getByText(/Region: Czech/)).toBeTruthy();
  });
});
