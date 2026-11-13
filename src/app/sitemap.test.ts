import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SITE_URL, genreHref, moodHref } from "@/lib/routes";
import { MOVIE_GENRES, TV_GENRES, genreSlug } from "@/lib/genre-catalog";
import { MOODS } from "@/lib/moods";
import sitemap from "./sitemap";

/**
 * One rule, checked against the filesystem rather than against a list.
 *
 * A sitemap entry is a request to index that URL, so a route that answers
 * `noindex` must not appear in one – Search Console reports the pairing as
 * "Submitted URL marked 'noindex'" and the submission buys nothing either way.
 * The moods were once listed here while their route was `noindex`, and nobody
 * noticed: both halves read correctly on their own, and only the two together
 * are wrong.
 *
 * So the assertion goes and reads the page, rather than restating what the
 * sitemap already says. Adding `noindex: true` to a route that is listed here
 * fails this test, which is the moment the contradiction is cheapest to see.
 */

// A build without TMDB access, whatever the shell running the suite holds: the
// sitemap must not go to the network from a test.
vi.stubEnv("NEXT_PUBLIC_TMDB_API_TOKEN", "");

// The prerendered titles are whatever `scripts/prebuild.mjs` last wrote into
// `.next/cache` – a fixed list here, so the suite does not depend on a build.
vi.mock("@/lib/prerendered-titles-server", () => ({
  prerenderedTitles: (kind: string) =>
    ({
      movie: [{ id: 550, slug: "fight-club-550" }],
      tv: [{ id: 1396, slug: "breaking-bad-1396" }],
      person: [{ id: 31, slug: "tom-hanks-31" }],
    })[kind] ?? [],
  likePageTitles: (kind: string) =>
    ({ movie: [{ id: 550, slug: "fight-club-550" }] })[kind] ?? [],
}));

const appDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * The `page.tsx` behind a sitemap URL, read straight off disk – following a
 * dynamic segment (`[genre]`) wherever no folder has the segment's own name,
 * the way the router does.
 */
function pageSourceFor(pathname: string): string {
  let dir = appDir;
  for (const segment of pathname.split("/").filter(Boolean)) {
    if (existsSync(`${dir}${segment}/`)) {
      dir = `${dir}${segment}/`;
      continue;
    }
    const dynamic = readdirSync(dir).find((name) => /^\[[^.\]]+\]$/.test(name));
    if (!dynamic) throw new Error(`No route serves ${pathname}`);
    dir = `${dir}${dynamic}/`;
  }
  return readFileSync(`${dir}page.tsx`, "utf8");
}

describe("sitemap", async () => {
  const entries = await sitemap();
  const paths = entries.map((entry) => new URL(entry.url).pathname);

  it("lists something", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("only lists this origin", () => {
    for (const entry of entries) {
      expect(entry.url.startsWith(SITE_URL)).toBe(true);
    }
  });

  it("never lists a URL carrying a query string", () => {
    // A static export serves one prerendered file per route, so `?id=` variants
    // are byte-identical markup under different URLs – which is why every
    // query-addressed route is `noindex` to begin with.
    for (const entry of entries) {
      expect(entry.url).not.toContain("?");
    }
  });

  it("lists no route that serves noindex", () => {
    const offenders = entries
      .map((entry) => new URL(entry.url).pathname)
      .filter((pathname) => /noindex:\s*true/.test(pageSourceFor(pathname)));

    expect(offenders).toEqual([]);
  });

  /**
   * `lastModified` used to be `new Date()` – the build time, stamped on every
   * URL on every build, which is a date that carries no information about the
   * page. A sitemap that says nothing is more truthful than one that says that.
   */
  it("stamps no lastModified", () => {
    for (const entry of entries) {
      expect(entry).not.toHaveProperty("lastModified");
    }
  });

  it("lists every genre page and every mood", () => {
    for (const genre of MOVIE_GENRES) {
      expect(paths).toContain(genreHref("movie", genreSlug(genre)));
    }
    for (const genre of TV_GENRES) {
      expect(paths).toContain(genreHref("tv", genreSlug(genre)));
    }
    for (const mood of MOODS) {
      expect(paths).toContain(moodHref(mood.slug));
    }
  });

  /**
   * A landing is `noindex` until the build has counted its titles, and this
   * suite builds nothing – so none may be listed. (With TMDB access the build
   * lists exactly the ones `isIndexableLanding` passes, from the same snapshot
   * the page's own metadata reads.)
   */
  it("lists no platform landing it could not count", () => {
    expect(paths.filter((path) => path.split("/").length > 4)).toEqual([]);
  });

  // The same for a mood's landings, which sit one segment shallower:
  // `/mood/christmas/netflix`.
  it("lists no mood landing it could not count", () => {
    expect(paths.filter((path) => /^\/mood\/[^/]+\/[^/]+$/.test(path))).toEqual([]);
  });

  // And a "like this" page is `noindex` until its list has been counted.
  it("lists no like page it could not count", () => {
    expect(paths.filter((path) => /^\/(movies|shows)-like\//.test(path))).toEqual([]);
  });

  it("lists every prerendered film, series and person at its path", () => {
    expect(paths).toEqual(
      expect.arrayContaining(["/movie/fight-club-550", "/tv/breaking-bad-1396", "/person/tom-hanks-31"]),
    );
  });

  it("lists no route twice", () => {
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
