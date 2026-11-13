// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { LikePageData, LikeTitle } from "@/lib/like-titles";
import {
  encodeLikePageIds,
  encodePrerenderedTitles,
} from "@/lib/prerendered-titles";
import { SITE_URL } from "@/lib/routes";

const snapshots = vi.hoisted(() => ({
  movie: vi.fn(),
  tv: vi.fn(),
}));

vi.mock("@/lib/build-time-tmdb", () => ({
  getMovieLikeSnapshot: snapshots.movie,
  getTVLikeSnapshot: snapshots.tv,
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid="image" data-alt={alt} data-src={src} />
  ),
}));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("./WatchlistButton", () => ({
  WatchlistButton: ({ item }: { item: { title: string; media_type: string } }) => (
    <button>{`Save ${item.title} (${item.media_type})`}</button>
  ),
}));

const { LikeTitlesPage, likePageMetadata } = await import("./LikeTitlesPage");

function row(id: number, title: string, overrides: Partial<LikeTitle> = {}): LikeTitle {
  return {
    id,
    title,
    slug: `${title.toLowerCase().replace(/\s+/g, "-")}-${id}`,
    year: 2016,
    releaseDate: "2016-11-10",
    posterPath: `/p${id}.jpg`,
    overview: `About ${title}.`,
    voteAverage: 7.6,
    voteCount: 1000,
    sharedGenres: ["Drama", "Science Fiction"],
    ...overrides,
  };
}

function likePage(items: LikeTitle[]): LikePageData {
  return {
    mediaType: "movie",
    id: 157336,
    title: "Interstellar",
    slug: "interstellar-157336",
    year: 2014,
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    genres: [{ id: 18, name: "Drama" }, { id: 878, name: "Science Fiction" }],
    keywords: ["space travel"],
    items,
  };
}

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => row(i + 1, `Film ${i + 1}`));

async function renderPage(slug = "interstellar-157336") {
  render(await LikeTitlesPage({ mediaType: "movie", slug }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  snapshots.movie.mockReset();
  snapshots.tv.mockReset();
});

describe("LikeTitlesPage", () => {
  it("is headed by the question it answers, and opens with a sentence", async () => {
    snapshots.movie.mockResolvedValue(likePage([row(329865, "Arrival")]));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Movies like Interstellar");
    expect(screen.getByText(/^1 films to watch after Interstellar \(2014\)/)).toBeDefined();
    expect(snapshots.movie).toHaveBeenCalledWith(157336);
  });

  it("lists each title with what it shares and a way to its own page", async () => {
    snapshots.movie.mockResolvedValue(likePage([row(329865, "Arrival")]));
    await renderPage();

    // The ranked list is the page's one <ol>; the genre links are a <ul>.
    const item = within(document.querySelector("ol")!).getAllByRole("listitem")[0];
    expect(within(item).getByRole("heading", { level: 2 }).textContent).toBe("Arrival (2016)");
    expect(within(item).getByText(/Also drama, science fiction/)).toBeDefined();
    expect(within(item).getByText("About Arrival.")).toBeDefined();
    // Not prerendered in this test, so the title is on its query-string page.
    expect(within(item).getByRole("link", { name: "Where to watch" }).getAttribute("href"))
      .toBe("/movie?id=arrival-329865");
    expect(within(item).getByRole("button", { name: "Save Arrival (movie)" })).toBeDefined();
  });

  it("links on to a listed title's own like page only where one was built", async () => {
    vi.stubEnv(
      "PRERENDERED_TITLE_IDS",
      encodePrerenderedTitles({
        movie: [{ id: 329865, slug: "arrival-329865" }, { id: 286217, slug: "the-martian-286217" }],
        tv: [],
        person: [],
      }),
    );
    vi.stubEnv("LIKE_PAGE_TITLE_IDS", encodeLikePageIds({ movie: [329865], tv: [] }));
    snapshots.movie.mockResolvedValue(
      likePage([row(329865, "Arrival"), row(286217, "The Martian")]),
    );
    await renderPage();

    expect(screen.getByRole("link", { name: "Movies like Arrival" }).getAttribute("href"))
      .toBe("/movies-like/arrival-329865");
    expect(screen.queryByRole("link", { name: "Movies like The Martian" })).toBeNull();
  });

  it("sends the visitor back to the title, where its streaming services are", async () => {
    snapshots.movie.mockResolvedValue(likePage([row(329865, "Arrival")]));
    await renderPage();

    expect(
      screen.getByRole("link", { name: /Interstellar \(2014\).*Where to watch it/ }).getAttribute("href"),
    ).toBe("/movie?id=interstellar-157336");
  });

  it("describes the list to a search engine as positions and pages", async () => {
    snapshots.movie.mockResolvedValue(likePage([row(329865, "Arrival")]));
    const { container } = render(
      await LikeTitlesPage({ mediaType: "movie", slug: "interstellar-157336" }),
    );

    const blocks = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => JSON.parse(script.innerHTML),
    );
    expect(blocks.find((block) => block["@type"] === "ItemList")).toMatchObject({
      name: "Movies like Interstellar",
      url: `${SITE_URL}/movies-like/interstellar-157336`,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: `${SITE_URL}/movie?id=arrival-329865` },
      ],
    });
  });

  // A static export needs the page to exist even in a build with no TMDB
  // access; it must not pretend to be a list.
  it("says so when the build had no list to write", async () => {
    snapshots.movie.mockResolvedValue(null);
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Movies like this");
    expect(screen.getByRole("link", { name: /Open the title/ }).getAttribute("href"))
      .toBe("/movie?id=interstellar-157336");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("reads a series from the series snapshot", async () => {
    snapshots.tv.mockResolvedValue({
      ...likePage([row(60059, "Better Call Saul")]),
      mediaType: "tv",
      id: 1396,
      title: "Breaking Bad",
      slug: "breaking-bad-1396",
    });
    render(await LikeTitlesPage({ mediaType: "tv", slug: "breaking-bad-1396" }));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Shows like Breaking Bad");
    expect(screen.getByRole("link", { name: "Where to watch" }).getAttribute("href"))
      .toBe("/tv?id=better-call-saul-60059");
    expect(snapshots.tv).toHaveBeenCalledWith(1396);
    expect(snapshots.movie).not.toHaveBeenCalled();
  });
});

describe("likePageMetadata", () => {
  it("titles the page with the question and the year", async () => {
    snapshots.movie.mockResolvedValue(likePage(many(20)));
    const metadata = await likePageMetadata("movie", "interstellar-157336");

    expect(metadata.title).toBe("Movies Like Interstellar (2014)");
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/movies-like/interstellar-157336`);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.description).toBe(
      "20 movies like Interstellar: Film 1, Film 2, Film 3 and more. See what each shares with it and where to watch.",
    );
  });

  it("keeps the description inside what a search result shows", async () => {
    const long = many(20).map((item) => ({
      ...item,
      title: `${item.title} and the Extraordinarily Long Subtitle That Goes On`,
    }));
    snapshots.movie.mockResolvedValue(likePage(long));
    const metadata = await likePageMetadata("movie", "interstellar-157336");

    expect(String(metadata.description).length).toBeLessThanOrEqual(155);
    expect(metadata.description).toContain("20 movies like Interstellar (2014)");
  });

  // A handful of titles is a thin page; it is still there for whoever follows
  // the link, but it is not offered to a search engine.
  it("keeps a thin list out of the index", async () => {
    snapshots.movie.mockResolvedValue(likePage(many(4)));
    const metadata = await likePageMetadata("movie", "interstellar-157336");

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("keeps a page with no list out of the index", async () => {
    snapshots.movie.mockResolvedValue(null);
    const metadata = await likePageMetadata("movie", "interstellar-157336");

    expect(metadata.title).toBe("Movies Like This");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
