import { describe, expect, it } from "vitest";
import {
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
} from "./streaming-landing";

/**
 * These slugs are URL segments on indexable pages, which makes the table's
 * invariants load-bearing rather than tidy: a duplicate slug is two landing
 * pages competing for one address, and a slug needing escaping is a canonical
 * that disagrees with the link pointing at it.
 */
describe("STREAMING_LANDING_PLATFORMS", () => {
  it("has a unique slug per platform", () => {
    const slugs = STREAMING_LANDING_PLATFORMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has a unique TMDB id per platform", () => {
    const ids = STREAMING_LANDING_PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses slugs that survive a URL unescaped", () => {
    for (const { slug } of STREAMING_LANDING_PLATFORMS) {
      expect(slug, slug).toMatch(/^[a-z0-9-]+$/);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  it("names every platform", () => {
    for (const { name, id } of STREAMING_LANDING_PLATFORMS) {
      expect(name.trim().length, `provider ${id}`).toBeGreaterThan(0);
    }
  });

  /**
   * The set is deliberately small: what keeps "action movies on Netflix" from
   * reading as a doorway page is that only a handful of genuinely distinct
   * combinations exist. A table grown to every provider TMDB returns is the
   * failure mode the module's own comment warns against, so the cap is asserted
   * rather than left to review.
   */
  it("stays small enough not to read as doorway pages", () => {
    expect(STREAMING_LANDING_PLATFORMS.length).toBeLessThanOrEqual(10);
  });
});

describe("findStreamingPlatform", () => {
  it("finds a platform by its slug", () => {
    expect(findStreamingPlatform("netflix")).toEqual({
      id: 8,
      slug: "netflix",
      name: "Netflix",
    });
  });

  it("answers undefined for a slug it does not serve", () => {
    // The static export has no route for these, so the page has to 404 rather
    // than render an empty listing.
    expect(findStreamingPlatform("britbox")).toBeUndefined();
    expect(findStreamingPlatform("")).toBeUndefined();
    expect(findStreamingPlatform("NETFLIX")).toBeUndefined();
  });

  it("resolves every slug in the table", () => {
    for (const platform of STREAMING_LANDING_PLATFORMS) {
      expect(findStreamingPlatform(platform.slug)).toBe(platform);
    }
  });
});
