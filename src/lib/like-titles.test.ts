import { describe, expect, it } from "vitest";
import {
  LIKE_LIST_LENGTH,
  MIN_INDEXABLE_LIKE_RESULTS,
  isIndexableLikePage,
  likeIntroduction,
  movieLikePage,
  tvLikePage,
} from "./like-titles";
import type { Movie, MovieDetails, TMDBResponse, TVShowDetails } from "@/types/tmdb";

function movie(id: number, overrides: Partial<Movie> = {}): Movie {
  return {
    id,
    title: `Film ${id}`,
    overview: `About film ${id}.`,
    poster_path: `/p${id}.jpg`,
    backdrop_path: null,
    release_date: "2014-11-05",
    vote_average: 7.5,
    vote_count: 1000,
    genre_ids: [12, 878],
    adult: false,
    original_language: "en",
    original_title: `Film ${id}`,
    popularity: 1,
    video: false,
    ...overrides,
  } as Movie;
}

function page<T>(results: T[]): TMDBResponse<T> {
  return { page: 1, results, total_pages: 1, total_results: results.length };
}

function interstellar(overrides: Partial<MovieDetails> = {}): MovieDetails {
  return {
    id: 157336,
    title: "Interstellar",
    release_date: "2014-11-05",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    genres: [
      { id: 12, name: "Adventure" },
      { id: 18, name: "Drama" },
      { id: 878, name: "Science Fiction" },
    ],
    keywords: {
      keywords: [
        { id: 1, name: "space travel" },
        { id: 2, name: "time travel" },
        { id: 3, name: "wormhole" },
        { id: 4, name: "black hole" },
        { id: 5, name: "astronaut" },
      ],
    },
    recommendations: page([movie(1), movie(2)]),
    similar: page([movie(2), movie(3), movie(157336)]),
    ...overrides,
  } as unknown as MovieDetails;
}

describe("movieLikePage", () => {
  it("lists recommendations first, then similar titles, each once and never itself", () => {
    const { items } = movieLikePage(interstellar());

    // 2 is in both lists; 157336 is the film the page is about.
    expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("stops at one page", () => {
    const many = Array.from({ length: 40 }, (_, i) => movie(i + 1));
    const { items } = movieLikePage(interstellar({ recommendations: page(many) }));

    expect(items).toHaveLength(LIKE_LIST_LENGTH);
  });

  it("names the genres each title shares with the page's own, in its order", () => {
    const { items } = movieLikePage(
      interstellar({
        recommendations: page([
          movie(1, { genre_ids: [878, 53, 12] }),
          movie(2, { genre_ids: [35] }),
        ]),
        similar: undefined,
      }),
    );

    // Thriller (53) is not one of Interstellar's, so it is not something shared.
    expect(items[0].sharedGenres).toEqual(["Adventure", "Science Fiction"]);
    expect(items[1].sharedGenres).toEqual([]);
  });

  it("gives each row what its link, its line and a watchlist entry need", () => {
    const [item] = movieLikePage(
      interstellar({ recommendations: page([movie(329865, { title: "Arrival", release_date: "2016-11-10" })]) }),
    ).items;

    expect(item).toMatchObject({
      id: 329865,
      title: "Arrival",
      slug: "arrival-329865",
      year: 2016,
      releaseDate: "2016-11-10",
      posterPath: "/p329865.jpg",
    });
  });

  it("cuts a long overview at a word", () => {
    const long = `${"A very long sentence about a film. ".repeat(20)}`;
    const [item] = movieLikePage(
      interstellar({ recommendations: page([movie(1, { overview: long })]), similar: undefined }),
    ).items;

    expect(item.overview.length).toBeLessThanOrEqual(221);
    expect(item.overview.endsWith("…")).toBe(true);
    expect(item.overview).not.toMatch(/\s…$/);
  });

  it("carries the title's own facts for the heading and introduction", () => {
    const likePage = movieLikePage(interstellar());

    expect(likePage).toMatchObject({
      mediaType: "movie",
      id: 157336,
      title: "Interstellar",
      slug: "interstellar-157336",
      year: 2014,
      backdropPath: "/backdrop.jpg",
    });
    // A few keywords, not the forty TMDB has.
    expect(likePage.keywords).toEqual(["space travel", "time travel", "wormhole", "black hole"]);
  });

  it("lists nothing for a title TMDB has nothing to say about", () => {
    const { items } = movieLikePage(
      interstellar({ recommendations: undefined, similar: undefined }),
    );

    expect(items).toEqual([]);
  });
});

describe("tvLikePage", () => {
  it("reads a series by its own field names", () => {
    const details = {
      id: 1396,
      name: "Breaking Bad",
      first_air_date: "2008-01-20",
      poster_path: null,
      backdrop_path: null,
      genres: [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }],
      keywords: { results: [{ id: 1, name: "drug dealer" }] },
      recommendations: page([
        {
          id: 60059, name: "Better Call Saul", overview: "", poster_path: null, backdrop_path: null,
          first_air_date: "2015-02-08", vote_average: 8.7, vote_count: 5000, genre_ids: [80, 18],
        },
      ]),
    } as unknown as TVShowDetails;

    const likePage = tvLikePage(details);

    expect(likePage).toMatchObject({ mediaType: "tv", title: "Breaking Bad", slug: "breaking-bad-1396", year: 2008 });
    expect(likePage.keywords).toEqual(["drug dealer"]);
    expect(likePage.items[0]).toMatchObject({
      title: "Better Call Saul",
      slug: "better-call-saul-60059",
      year: 2015,
      sharedGenres: ["Drama", "Crime"],
    });
  });
});

describe("isIndexableLikePage", () => {
  const withItems = (count: number) =>
    movieLikePage(
      interstellar({
        recommendations: page(Array.from({ length: count }, (_, i) => movie(i + 1))),
        similar: undefined,
      }),
    );

  it("indexes a page with a real list on it", () => {
    expect(isIndexableLikePage(withItems(MIN_INDEXABLE_LIKE_RESULTS))).toBe(true);
  });

  // A page of four titles is thin, and a few hundred of those is what reads as
  // doorway pages.
  it("keeps a thin page and a page with no snapshot out of the index", () => {
    expect(isIndexableLikePage(withItems(MIN_INDEXABLE_LIKE_RESULTS - 1))).toBe(false);
    expect(isIndexableLikePage(null)).toBe(false);
  });
});

describe("likeIntroduction", () => {
  it("says how many, what they share and what the title is about", () => {
    expect(likeIntroduction(movieLikePage(interstellar()))).toBe(
      "3 films to watch after Interstellar (2014) that share its mix of adventure, drama and science fiction – space travel, time travel, wormhole and black hole – starting with the closest match.",
    );
  });

  it("leaves out what the title does not have", () => {
    const bare = movieLikePage(
      interstellar({ genres: [], keywords: undefined, release_date: "" }),
    );

    expect(likeIntroduction(bare)).toBe(
      "3 films to watch after Interstellar starting with the closest match.",
    );
  });
});
