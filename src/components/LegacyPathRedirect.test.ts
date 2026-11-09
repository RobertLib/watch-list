import { describe, expect, it, vi } from "vitest";
import {
  ambiguousLeadingId,
  legacyPathTarget,
  resolveLegacyTarget,
  slugNamesTitle,
} from "./LegacyPathRedirect";

/**
 * The server-rendered site addressed titles by path, and its sitemaps submitted
 * them that way – the shapes below are the ones it published. GitHub Pages
 * answers all of them with 404.html, which is where this runs.
 */
describe("legacyPathTarget", () => {
  it.each([
    // Both slug orders the old site used: id first, then title first.
    ["/movie/550-fight-club", "/movie?id=550-fight-club"],
    ["/movie/send-help-1198994", "/movie?id=send-help-1198994"],
    ["/movie/send-help-1198994/", "/movie?id=send-help-1198994"],
    ["/tv/1399-game-of-thrones", "/tv?id=1399-game-of-thrones"],
    ["/tv/hotel-del-luna-90447", "/tv?id=hotel-del-luna-90447"],
    ["/person/anne-hathaway-1813", "/person?id=anne-hathaway-1813"],
    ["/collection/the-dark-knight-collection-263", "/collection?id=the-dark-knight-collection-263"],
    ["/movie/550", "/movie?id=550"],
  ])("sends the title page %s to %s", (path, target) => {
    expect(legacyPathTarget(path)).toBe(target);
  });

  it.each([
    ["/genres/movie/28", "/genres/movie?genre=28"],
    ["/genres/movie/action-28", "/genres/movie?genre=action-28"],
    ["/genres/tv/action-adventure-10759/", "/genres/tv?genre=action-adventure-10759"],
  ])("sends the genre page %s to %s", (path, target) => {
    expect(legacyPathTarget(path)).toBe(target);
  });

  it.each([
    ["/movies/top-rated", "/movies"],
    ["/movies/now-playing", "/movies"],
    ["/movies/upcoming/", "/movies"],
    ["/tv-shows/top-rated", "/tv-shows"],
    ["/tv-shows/on-the-air", "/tv-shows"],
    ["/trending", "/"],
  ])("sends the listing %s to the page it became, %s", (path, target) => {
    expect(legacyPathTarget(path)).toBe(target);
  });

  it.each([
    "/",
    "/movie",
    "/movie/",
    "/movie/fight-club",
    "/movie/550/cast",
    "/movie/550_fight_club",
    "/movies/popular",
    "/genres/movie",
    "/genres/anime/16",
    "/nonexistent",
    `/movie/${"a-".repeat(150)}550`,
  ])("leaves %s to the ordinary 404", (path) => {
    expect(legacyPathTarget(path)).toBeNull();
  });

  it.each([
    "//evil.example/movie/550",
    "/movie/%2F%2Fevil.example%2F550",
    "/movie/550-%0D%0ALocation:%20https:%2F%2Fevil.example",
    "/movie/https:%2F%2Fevil.example-550",
    "/movie/..%2F..%2Fevil-550",
  ])("never builds a destination off the site from %s", (path) => {
    const target = legacyPathTarget(path);
    if (target === null) return;
    expect(target.startsWith("/") && !target.startsWith("//")).toBe(true);
    expect(new URL(target, "https://www.watch-list.me").origin).toBe("https://www.watch-list.me");
  });

  it("refuses every encoded or punctuated slug outright", () => {
    for (const path of [
      "/movie/%2F%2Fevil.example%2F550",
      "/movie/https:%2F%2Fevil.example-550",
      "/movie/..%2F..%2Fevil-550",
    ]) {
      expect(legacyPathTarget(path)).toBeNull();
    }
  });
});

/**
 * A slug that starts and ends with a number reads either way: the 2025 sitemap
 * was id-first (`1263256-happy-gilmore-2`), the later one title-first
 * (`1917-530915`). Only TMDB can say which, so that one shape asks it.
 */
describe("resolveLegacyTarget", () => {
  const titles: Record<string, string[]> = {
    "movie:1263256": ["Happy Gilmore 2", "Happy Gilmore 2"],
    "movie:1071585": ["M3GAN 2.0", "M3GAN 2.0"],
    "movie:1917": ["Unrelated Film", "Unrelated Film"],
    "movie:2001": ["Another Film", "Another Film"],
    "tv:1405": ["Dexter", "Dexter"],
    "movie:194": ["Am\u00e9lie 2", "Am\u00e9lie 2"],
  };
  const lookup = vi.fn(async (kind: string, id: number) => {
    const names = titles[`${kind}:${id}`];
    if (!names) throw new Error("404");
    return names;
  });

  it.each([
    ["/movie/1263256-happy-gilmore-2", "/movie?id=1263256"],
    ["/movie/1071585-m3gan-2-0", "/movie?id=1071585"],
    ["/movie/1071585-m3gan-20", "/movie?id=1071585"],
    ["/movie/194-amlie-2", "/movie?id=194"],
    ["/movie/194-amelie-2", "/movie?id=194"],
  ])("keeps the id-first reading of %s when the rest names that title", async (path, target) => {
    await expect(resolveLegacyTarget(path, lookup)).resolves.toBe(target);
  });

  it.each([
    ["/movie/1917-530915", "/movie?id=1917-530915"],
    ["/movie/2001-a-space-odyssey-62", "/movie?id=2001-a-space-odyssey-62"],
    ["/tv/1405-dexter-resurrection-2", "/tv?id=1405-dexter-resurrection-2"],
  ])("keeps the trailing reading of %s when the leading id names something else", async (path, target) => {
    await expect(resolveLegacyTarget(path, lookup)).resolves.toBe(target);
  });

  it("keeps the trailing reading when TMDB has no answer", async () => {
    await expect(resolveLegacyTarget("/movie/999-lost-film-3", lookup)).resolves.toBe(
      "/movie?id=999-lost-film-3",
    );
  });

  it("asks nothing for a slug only one reading fits", async () => {
    lookup.mockClear();
    await expect(resolveLegacyTarget("/movie/550-fight-club", lookup)).resolves.toBe(
      "/movie?id=550-fight-club",
    );
    await expect(resolveLegacyTarget("/movie/send-help-1198994", lookup)).resolves.toBe(
      "/movie?id=send-help-1198994",
    );
    await expect(resolveLegacyTarget("/genres/movie/28-action-28", lookup)).resolves.toBe(
      "/genres/movie?genre=28-action-28",
    );
    await expect(resolveLegacyTarget("/movies/top-rated", lookup)).resolves.toBe("/movies");
    await expect(resolveLegacyTarget("/nonexistent", lookup)).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("recognises only a number at both ends as ambiguous", () => {
    expect(ambiguousLeadingId("1263256-happy-gilmore-2")).toBe(1263256);
    expect(ambiguousLeadingId("1917-530915")).toBe(1917);
    expect(ambiguousLeadingId("550-fight-club")).toBeNull();
    expect(ambiguousLeadingId("send-help-1198994")).toBeNull();
    expect(ambiguousLeadingId("550")).toBeNull();
    expect(ambiguousLeadingId(`${"9".repeat(20)}-x-2`)).toBeNull();
  });

  it("never matches an empty remainder", () => {
    expect(slugNamesTitle("", [""])).toBe(false);
    expect(slugNamesTitle("---", ["!!!"])).toBe(false);
  });
});
