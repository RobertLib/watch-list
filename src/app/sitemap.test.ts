import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/routes";
import sitemap from "./sitemap";

/**
 * One rule, checked against the filesystem rather than against a list.
 *
 * A sitemap entry is a request to index that URL, so a route that answers
 * `noindex` must not appear in one – Search Console reports the pairing as
 * "Submitted URL marked 'noindex'" and the submission buys nothing either way.
 * The eleven moods were listed here for exactly that reason and nobody noticed:
 * both halves read correctly on their own, and only the two together are wrong.
 *
 * So the assertion goes and reads the page, rather than restating what the
 * sitemap already says. Adding `noindex: true` to a route that is listed here
 * fails this test, which is the moment the contradiction is cheapest to see.
 */

const appDir = fileURLToPath(new URL(".", import.meta.url));

/** The `page.tsx` behind a sitemap URL, read straight off disk. */
function pageSourceFor(pathname: string): string {
  const segment = pathname === "/" ? "" : `${pathname.slice(1)}/`;
  return readFileSync(`${appDir}${segment}page.tsx`, "utf8");
}

describe("sitemap", () => {
  const entries = sitemap();

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

  it("lists no route twice", () => {
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
