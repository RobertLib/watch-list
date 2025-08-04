import { describe, expect, it } from "vitest";
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
  tvHref,
} from "./routes";

/**
 * These build every internal link in the app, and the static export can only
 * serve the handful of paths that existed at build time. A path form no route
 * answers – `/movie/fight-club-550` rather than `/movie?id=…` – is a 404 that
 * type checking cannot see, which is why the shapes are pinned here.
 */

describe("title links", () => {
  it("addresses a title by query string, not by path", () => {
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

describe("moodHref", () => {
  it("leaves page one out of the URL", () => {
    expect(moodHref("cosy-sunday")).toBe("/mood?id=cosy-sunday");
    expect(moodHref("cosy-sunday", 1)).toBe("/mood?id=cosy-sunday");
  });

  it("carries any later page", () => {
    expect(moodHref("cosy-sunday", 3)).toBe("/mood?id=cosy-sunday&page=3");
  });
});

describe("genreHref", () => {
  it("puts the media type in the path and the genre in the query", () => {
    expect(genreHref("movie", "horror")).toBe("/genres/movie?genre=horror");
    expect(genreHref("tv", "drama")).toBe("/genres/tv?genre=drama");
  });

  it("carries a platform", () => {
    expect(genreHref("movie", "horror", { provider: "netflix" })).toBe(
      "/genres/movie?genre=horror&provider=netflix",
    );
  });

  it("merges a filter query rather than appending it", () => {
    // `buildDiscoverFilterQuery` hands back a leading "?", and appending that
    // would put a second question mark in the URL – everything after it is then
    // part of the previous parameter's value rather than a parameter of its own.
    const href = genreHref("movie", "horror", {
      filterQuery: "?year=2026&sort=vote_average.desc",
    });

    expect(href.match(/\?/g)).toHaveLength(1);

    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("genre")).toBe("horror");
    expect(params.get("year")).toBe("2026");
    expect(params.get("sort")).toBe("vote_average.desc");
  });

  it("lets the genre win over one carried in the filter query", () => {
    const href = genreHref("movie", "horror", { filterQuery: "?genre=comedy" });
    const params = new URLSearchParams(href.split("?")[1]);

    expect(params.getAll("genre")).toEqual(["horror"]);
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
