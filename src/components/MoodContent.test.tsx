// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MediaItem, Movie, TMDBResponse, TVShow } from "@/types/tmdb";
import { MoodContent } from "./MoodContent";
import { findMood } from "@/lib/moods";
import { findStreamingPlatform } from "@/lib/streaming-landing";
import type { MoodPicksPage } from "@/lib/mood-data";

const api = vi.hoisted(() => ({
  discoverMovies: vi.fn(),
  discoverTVShows: vi.fn(),
}));
const navigation = vi.hoisted(() => ({
  /** The path segment: `/mood/easy-watch`. */
  mood: "easy-watch",
  query: "",
  settingsKey: "CZ|all|",
  suspend: false,
}));
const replace = vi.hoisted(() => vi.fn());
const router = { replace };

vi.mock("@/lib/tmdb-discover", () => ({ tmdbDiscoverApi: api }));
vi.mock("next/navigation", () => ({
  // Suspending forever renders the Suspense fallback – what the prerender shows.
  useSearchParams: () => {
    if (navigation.suspend) throw new Promise(() => {});
    return new URLSearchParams(navigation.query);
  },
  useRouter: () => router,
}));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => navigation.settingsKey }));
vi.mock("./MediaSection", () => ({
  MediaSection: ({ title, items, emptyMessage }: {
    title: string; items: MediaItem[]; emptyMessage: string;
  }) => <section>
    {title && <h2>{title}</h2>}
    {items.length === 0 ? <p>{emptyMessage}</p> : <ul>
      {items.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>}
  </section>,
}));
vi.mock("./LoadingSpinner", () => ({
  LoadingSection: () => <div role="status">Loading picks</div>,
}));

function page(totalPages: number, name: string): TMDBResponse<Movie & TVShow> {
  return {
    page: 1,
    total_pages: totalPages,
    total_results: totalPages * 20,
    results: [{
      id: totalPages,
      title: name,
      name,
      overview: "",
      poster_path: null,
      backdrop_path: null,
      release_date: "2020-01-01",
      first_air_date: "2020-01-01",
      vote_average: 8,
      vote_count: 100,
      genre_ids: [],
      adult: false,
      original_language: "en",
      original_title: name,
      original_name: name,
      popularity: 10,
      video: false,
    }],
  };
}

beforeEach(() => {
  navigation.mood = "easy-watch";
  navigation.query = "";
  navigation.settingsKey = "CZ|all|";
  navigation.suspend = false;
  replace.mockReset();
  api.discoverMovies.mockReset().mockResolvedValue(page(1, "A film"));
  api.discoverTVShows.mockReset().mockResolvedValue(page(1, "A series"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The mood as its route renders it: the path has already named the mood. */
function moodContent(snapshot: MoodPicksPage | null = null) {
  return <MoodContent mood={findMood(navigation.mood)!} snapshot={snapshot} />;
}

async function renderMood(snapshot: MoodPicksPage | null = null) {
  await act(async () => { render(moodContent(snapshot)); });
}

async function followReplacement(view: ReturnType<typeof render>) {
  navigation.query = new URL(replace.mock.calls.at(-1)![0], "https://example.com").search;
  await act(async () => { view.rerender(moodContent()); });
}

describe("MoodContent", () => {
  it("keeps later series pages accessible after films run out", async () => {
    api.discoverTVShows.mockResolvedValue(page(4, "A series"));
    await renderMood();

    expect(screen.getByText("Page 1 of 4")).toBeDefined();
    expect(screen.getByRole("link", { name: "Next →" }).getAttribute("href"))
      .toBe("/mood/easy-watch?page=2");
  });

  it("shows series on a later page where the film response is empty", async () => {
    navigation.query = "page=2";
    api.discoverMovies.mockResolvedValue({ ...page(1, ""), page: 2, results: [] });
    api.discoverTVShows.mockResolvedValue({ ...page(4, "Later series"), page: 2 });
    await renderMood();

    expect(screen.getByText("Later series")).toBeDefined();
    expect(screen.getByText("No films on this page.")).toBeDefined();
    expect(screen.getByText("Page 2 of 4")).toBeDefined();
    expect(screen.getByRole("link", { name: "Next →" })).toBeDefined();
  });

  it.each([[15, 2], [2, 15]])("caps the combined pagination at ten pages (%s films, %s series)", async (movies, shows) => {
    api.discoverMovies.mockResolvedValue(page(movies, "A film"));
    api.discoverTVShows.mockResolvedValue(page(shows, "A series"));
    await renderMood();

    expect(screen.getByText("Page 1 of 10")).toBeDefined();
  });

  it("retains series pagination when films fail and retries the failed section", async () => {
    api.discoverMovies.mockRejectedValueOnce(new Error("offline"));
    api.discoverTVShows.mockResolvedValue(page(4, "A series"));
    await renderMood();

    expect(screen.getByText("Could not load films")).toBeDefined();
    expect(screen.getByText("A series")).toBeDefined();
    expect(screen.getByText("Page 1 of 4")).toBeDefined();
    expect(screen.queryByText("Nothing came back for this one. Try another mood.")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(api.discoverMovies).toHaveBeenCalledTimes(2);
    expect(screen.getByText("A film")).toBeDefined();
    expect(screen.queryByText("Could not load films")).toBeNull();
  });

  it("retains films and exposes a series failure", async () => {
    api.discoverMovies.mockResolvedValue(page(3, "A film"));
    api.discoverTVShows.mockRejectedValue(new Error("offline"));
    await renderMood();

    expect(screen.getByText("A film")).toBeDefined();
    expect(screen.getByText("Could not load series")).toBeDefined();
    expect(screen.getByText("Page 1 of 3")).toBeDefined();
  });

  it("reports an outage for both sections without presenting an empty mood", async () => {
    api.discoverMovies.mockRejectedValue(new Error("offline"));
    api.discoverTVShows.mockRejectedValue(new Error("offline"));
    await renderMood();

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByText("Nothing came back for this one. Try another mood.")).toBeNull();
  });

  it("only requests films for a film-only mood", async () => {
    navigation.mood = "mind-bending";
    api.discoverMovies.mockResolvedValue(page(2, "A film"));
    await renderMood();

    expect(api.discoverTVShows).not.toHaveBeenCalled();
    expect(screen.getByText("Page 1 of 2")).toBeDefined();
    expect(screen.queryByText("Could not load series")).toBeNull();
  });

  // `discoverMovies` with no filters is every film on TMDB: a mood with no film
  // half must not ask for one, and must not report its absence as "nothing
  // came back".
  it("only requests series for a series-only mood", async () => {
    navigation.mood = "limited-series";
    api.discoverTVShows.mockResolvedValue(page(2, "A series"));
    await renderMood();

    expect(api.discoverMovies).not.toHaveBeenCalled();
    expect(screen.getByText("A series")).toBeDefined();
    expect(screen.getByText("Page 1 of 2")).toBeDefined();
    expect(screen.queryByText("Nothing came back for this one. Try another mood.")).toBeNull();
    expect(screen.queryByText("Could not load films")).toBeNull();
  });

  it("links to the moods beside it, not to all of them", async () => {
    navigation.mood = "under-90-minutes";
    await renderMood();

    // The same section of `/moods`, and the way back to the rest.
    expect(screen.getByRole("link", { name: /All evening/ }).getAttribute("href"))
      .toBe("/mood/long-epics");
    expect(screen.queryByRole("link", { name: /Whodunit/ })).toBeNull();
    expect(screen.getByRole("link", { name: "All moods →" }).getAttribute("href")).toBe("/moods");
  });

  it("loads an available page when settings shrink the mood catalogue", async () => {
    navigation.query = "page=4";
    navigation.settingsKey = "US|all|";
    for (const discover of [api.discoverMovies, api.discoverTVShows]) {
      discover.mockImplementation(async (requestedPage: number) => ({
        ...page(navigation.settingsKey.startsWith("US") ? 4 : 1, "Available pick"),
        page: requestedPage,
        results: navigation.settingsKey.startsWith("US") || requestedPage === 1
          ? page(1, "Available pick").results
          : [],
      }));
    }
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(moodContent()); });
    expect(screen.getByText("Page 4 of 4")).toBeDefined();

    navigation.settingsKey = "CZ|streaming-only|8";
    await act(async () => { view.rerender(moodContent()); });

    expect(replace).toHaveBeenCalledExactlyOnceWith("/mood/easy-watch", { scroll: false });
    expect(screen.getByText("Loading picks")).toBeDefined();
    expect(screen.queryByText("Nothing came back for this one. Try another mood.")).toBeNull();
    await followReplacement(view);
    expect(screen.getAllByText("Available pick")).toHaveLength(2);
    expect(api.discoverMovies.mock.calls.map((call) => call[0])).toEqual([4, 4, 1]);
    expect(api.discoverTVShows.mock.calls.map((call) => call[0])).toEqual([4, 4, 1]);
  });

  it("recovers a shared link using the last page of the combined film and series catalogues", async () => {
    navigation.query = "page=10";
    api.discoverMovies.mockImplementation(async (requestedPage: number) => ({
      ...page(1, "A film"), page: requestedPage, results: [],
    }));
    api.discoverTVShows.mockImplementation(async (requestedPage: number) => ({
      ...page(3, "Last-page series"),
      page: requestedPage,
      results: requestedPage === 3 ? page(3, "Last-page series").results : [],
    }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(moodContent()); });

    expect(replace).toHaveBeenCalledExactlyOnceWith("/mood/easy-watch?page=3", { scroll: false });
    expect(screen.queryByText("Page 10 of 3")).toBeNull();
    await followReplacement(view);
    expect(screen.getByText("Last-page series")).toBeDefined();
    expect(screen.getByText("Page 3 of 3")).toBeDefined();
    expect(api.discoverTVShows.mock.calls.map((call) => call[0])).toEqual([10, 3]);
  });

  it("confirms page one before showing that a mood has no results", async () => {
    navigation.mood = "mind-bending";
    navigation.query = "page=4";
    api.discoverMovies.mockResolvedValue({ ...page(0, ""), results: [] });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(moodContent()); });

    expect(replace).toHaveBeenCalledExactlyOnceWith("/mood/mind-bending", { scroll: false });
    expect(screen.queryByText("Nothing came back for this one. Try another mood.")).toBeNull();
    await followReplacement(view);
    expect(screen.getByText("Nothing came back for this one. Try another mood.")).toBeDefined();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(api.discoverMovies.mock.calls.map((call) => call[0])).toEqual([4, 1]);
  });

  it("does not infer the last page while one catalogue has failed", async () => {
    navigation.query = "page=4";
    api.discoverMovies.mockResolvedValue({ ...page(1, ""), page: 4, results: [] });
    api.discoverTVShows.mockRejectedValue(new Error("offline"));

    await renderMood();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("Could not load series")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});

describe("MoodContent build snapshot", () => {
  const snapshot: MoodPicksPage = {
    movies: page(1, "Snapshot film").results as unknown as MediaItem[],
    shows: page(1, "Snapshot series").results as unknown as MediaItem[],
    moviesFailed: false,
    showsFailed: false,
    totalPages: 10,
    totalResults: 400,
  };

  it("prerenders page one from the snapshot", async () => {
    navigation.suspend = true;
    await renderMood(snapshot);

    // The heading says what is listed; the mood's own name is the line above.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Feel-Good Movies & TV Shows");
    expect(screen.getByText("Something easy")).toBeDefined();
    expect(screen.getByText("Snapshot film")).toBeDefined();
    expect(screen.getByText("Snapshot series")).toBeDefined();
    expect(screen.getByRole("link", { name: "Next →" }).getAttribute("href"))
      .toBe("/mood/easy-watch?page=2");
    expect(api.discoverMovies).not.toHaveBeenCalled();
  });

  it("starts the browser from the snapshot and swaps in the visitor's own picks", async () => {
    let resolve!: (value: TMDBResponse<Movie & TVShow>) => void;
    api.discoverMovies.mockReturnValueOnce(new Promise((res) => { resolve = res; }));
    await renderMood(snapshot);

    expect(screen.getByText("Snapshot film")).toBeDefined();
    expect(screen.queryByText("Loading picks")).toBeNull();

    await act(async () => { resolve(page(1, "Live film")); });
    expect(screen.getByText("Live film")).toBeDefined();
    expect(screen.queryByText("Snapshot film")).toBeNull();
  });

  it("does not stand the snapshot in for a later page", async () => {
    navigation.query = "page=2";
    api.discoverMovies.mockReturnValueOnce(new Promise(() => {}));
    await renderMood(snapshot);

    expect(screen.queryByText("Snapshot film")).toBeNull();
    expect(screen.getByText("Loading picks")).toBeDefined();
  });
});

describe("MoodContent on one platform", () => {
  const netflix = findStreamingPlatform("netflix")!;

  async function renderLanding(snapshot: MoodPicksPage | null = null) {
    await act(async () => {
      render(
        <MoodContent
          mood={findMood(navigation.mood)!}
          platform={netflix}
          snapshot={snapshot}
        />,
      );
    });
  }

  it("asks for the mood's picks on that platform only", async () => {
    await renderLanding();

    // The platform's provider id, by the filter bar's own key – which is what
    // wins over the visitor's saved services.
    expect(api.discoverMovies.mock.calls[0][1]).toMatchObject({
      genre: "35|10751|10749",
      watchProviders: "8",
    });
    expect(api.discoverTVShows.mock.calls[0][1]).toMatchObject({ watchProviders: "8" });
  });

  it("heads the page with the platform and pages within it", async () => {
    api.discoverMovies.mockResolvedValue(page(3, "A film"));
    await renderLanding();

    expect(screen.getByRole("heading", { level: 1 }).textContent)
      .toBe("Feel-Good Movies & TV Shows on Netflix");
    expect(screen.getByRole("link", { name: "Next →" }).getAttribute("href"))
      .toBe("/mood/easy-watch/netflix?page=2");
    // Back to the mood itself, and sideways to the other platforms.
    expect(screen.getByRole("link", { name: /on every service/ }).getAttribute("href"))
      .toBe("/mood/easy-watch");
    expect(screen.getByRole("link", { name: "Hulu" }).getAttribute("href"))
      .toBe("/mood/easy-watch/hulu");
    expect(screen.queryByRole("link", { name: "Netflix" })).toBeNull();
  });

  it("says the platform has nothing, rather than that the mood is empty", async () => {
    navigation.mood = "mind-bending";
    api.discoverMovies.mockResolvedValue({ ...page(1, "x"), results: [], total_results: 0 });
    await renderLanding();

    expect(
      screen.getByText("Nothing in this mood is streaming on Netflix in your region right now."),
    ).toBeDefined();
  });
});

describe("MoodContent without platform pages", () => {
  // Only some moods have a page per platform; a link from one that does not
  // would be a 404.
  it("offers no platform links for a mood that has none", async () => {
    navigation.mood = "heist";
    await renderMood();

    expect(screen.queryByRole("link", { name: "Netflix" })).toBeNull();
  });
});
