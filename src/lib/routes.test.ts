import { afterEach, describe, expect, it, vi } from "vitest";
import { encodePrerenderedIds } from "./prerendered-titles";
import {
  SITE_URL,
  absoluteMediaUrl,
  absoluteUrl,
  collectionHref,
  dailyHref,
  genreHref,
  matchHref,
  mediaHref,
  moodHref,
  movieHref,
  personHref,
  sharedListHref,
  titleQueryHref,
  tvHref,
} from "./routes";

/**
 * These build every internal link in the app, and the static export can only
 * serve the paths that existed at build time. A path form no route answers – a
 * `/movie/<slug>` the build did not prerender – is a 404 that type checking
 * cannot see, which is why the shapes are pinned here.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("title links", () => {
  it("addresses a title the build did not prerender by query string", () => {
    expect(movieHref("550-fight-club")).toBe("/movie?id=550-fight-club");
    expect(tvHref("1396-breaking-bad")).toBe("/tv?id=1396-breaking-bad");
  });

  it("routes by media type", () => {
    expect(mediaHref("movie", "550")).toBe("/movie?id=550");
    expect(mediaHref("tv", "1396")).toBe("/tv?id=1396");
  });

  it("uses the same shape for people and collections", () => {
    expect(personHref("287-brad-pitt")).toBe("/person?id=287-brad-pitt");
    expect(collectionHref("131-the-bourne-collection")).toBe(
      "/collection?id=131-the-bourne-collection",
    );
  });

  it("escapes anything that would otherwise end the query string", () => {
    expect(movieHref("550 fight&club")).toBe("/movie?id=550+fight%26club");
  });

  it("drops an empty id rather than emitting a bare question mark", () => {
    expect(movieHref("")).toBe("/movie");
  });
});

describe("dailyHref", () => {
  it("is the bare page for today", () => {
    expect(dailyHref()).toBe("/daily");
    expect(dailyHref("")).toBe("/daily");
  });

  it("names an archive day", () => {
    expect(dailyHref("2026-08-01")).toBe("/daily?day=2026-08-01");
  });
});

/**
 * The build prerenders the best-known titles at a path of their own, and a link
 * points there only when that page exists: in the id list the build inlined,
 * and at the slug the build wrote it under – `createSlug(name, id)`, ending in
 * its id. Anything else goes to the query page, which exists for every title.
 */
describe("prerendered title links", () => {
  const prerender = () =>
    vi.stubEnv(
      "PRERENDERED_TITLE_IDS",
      encodePrerenderedIds({ movie: [550], tv: [1396], person: [31] }),
    );

  it("points a prerendered title, series or person at its path", () => {
    prerender();
    expect(movieHref("fight-club-550")).toBe("/movie/fight-club-550");
    expect(tvHref("breaking-bad-1396")).toBe("/tv/breaking-bad-1396");
    expect(personHref("tom-hanks-31")).toBe("/person/tom-hanks-31");
    expect(absoluteMediaUrl("movie", "fight-club-550")).toBe(
      `${SITE_URL}/movie/fight-club-550`,
    );
  });

  it("keeps the query page for a slug the build did not write", () => {
    prerender();
    // A bare id, and the old site's id-first order: neither is a file.
    expect(movieHref("550")).toBe("/movie?id=550");
    expect(movieHref("550-fight-club")).toBe("/movie?id=550-fight-club");
    // The same id under the other kind is not a page either.
    expect(personHref("someone-550")).toBe("/person?id=someone-550");
  });

  it("keeps collections on the query page", () => {
    prerender();
    expect(collectionHref("the-dark-knight-collection-263")).toBe(
      "/collection?id=the-dark-knight-collection-263",
    );
  });

  it("offers the query page explicitly, for redirects that must not land on a path", () => {
    prerender();
    expect(titleQueryHref("movie", "fight-club-550")).toBe("/movie?id=fight-club-550");
  });
});

describe("moodHref", () => {
  it("puts the mood in the path and leaves page one out", () => {
    expect(moodHref("cosy-sunday")).toBe("/mood/cosy-sunday");
    expect(moodHref("cosy-sunday", 1)).toBe("/mood/cosy-sunday");
  });

  it("carries any later page", () => {
    expect(moodHref("cosy-sunday", 3)).toBe("/mood/cosy-sunday?page=3");
  });
});

describe("genreHref", () => {
  it("puts the media type and the genre in the path", () => {
    expect(genreHref("movie", "horror-27")).toBe("/genres/movie/horror-27");
    expect(genreHref("tv", "drama-18")).toBe("/genres/tv/drama-18");
  });

  it("puts a platform in the path too", () => {
    expect(genreHref("movie", "horror-27", { provider: "netflix" })).toBe(
      "/genres/movie/horror-27/netflix",
    );
  });

  it("merges a filter query rather than appending it", () => {
    // `buildDiscoverFilterQuery` hands back a leading "?", and appending that
    // would put a second question mark in the URL – everything after it is then
    // part of the previous parameter's value rather than a parameter of its own.
    const href = genreHref("movie", "horror-27", {
      filterQuery: "?year=2026&sort=vote_average.desc",
    });

    expect(href.match(/\?/g)).toHaveLength(1);
    expect(href.split("?")[0]).toBe("/genres/movie/horror-27");

    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("year")).toBe("2026");
    expect(params.get("sort")).toBe("vote_average.desc");
  });

  it("drops the query-addressed genre and platform the path now carries", () => {
    const href = genreHref("movie", "horror-27", {
      filterQuery: "?genre=comedy-35&provider=hulu&page=2",
    });

    expect(href).toBe("/genres/movie/horror-27?page=2");
  });

  it("leaves no question mark when there is nothing to carry", () => {
    expect(genreHref("tv", "drama-18", { filterQuery: "?" })).toBe(
      "/genres/tv/drama-18",
    );
  });
});

describe("shared lists", () => {
  it("carries the encoded items", () => {
    expect(sharedListHref("m550.t1396")).toBe("/list?items=m550.t1396");
  });

  it("carries the sender's title when there is one", () => {
    expect(sharedListHref("m550", "October horror")).toBe(
      "/list?items=m550&t=October+horror",
    );
  });

  it("compares two lists", () => {
    expect(matchHref("m550", "t1396")).toBe("/match?mine=m550&theirs=t1396");
  });
});

describe("absolute URLs", () => {
  it("has no trailing slash to double up on", () => {
    expect(SITE_URL).not.toMatch(/\/$/);
    expect(absoluteUrl("/about")).toBe(`${SITE_URL}/about`);
  });

  it("builds a title's canonical address from the same function as the link", () => {
    expect(absoluteMediaUrl("movie", "550-fight-club")).toBe(
      `${SITE_URL}/movie?id=550-fight-club`,
    );
  });
});
