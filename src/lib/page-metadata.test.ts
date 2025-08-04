import { describe, expect, it } from "vitest";
import { pageMetadata } from "./page-metadata";
import { SITE_URL } from "./routes";

/**
 * This helper exists so that the three things which must not be forgotten – a
 * canonical, a robots directive and an Open Graph title matching the real one –
 * are one call rather than thirty chances to omit one. Which means the omissions
 * are the behaviour worth pinning: each optional field has to be absent, not
 * present-and-empty, because `undefined` and a written-out `null` reach the
 * emitted markup as different things.
 */
describe("pageMetadata", () => {
  const base = { title: "Top rated films", description: "The best of TMDB." };

  it("carries the title and description through", () => {
    const meta = pageMetadata(base);

    expect(meta.title).toBe("Top rated films");
    expect(meta.description).toBe("The best of TMDB.");
  });

  /**
   * The reason Open Graph is repeated rather than inherited: the root layout
   * names the site there, so a page overriding `title` alone would share to
   * social under the wrong headline.
   */
  it("mirrors the title into Open Graph and Twitter", () => {
    const meta = pageMetadata(base);

    expect(meta.openGraph?.title).toBe(base.title);
    expect(meta.openGraph?.description).toBe(base.description);
    expect(meta.twitter?.title).toBe(base.title);
    expect(meta.twitter?.description).toBe(base.description);
  });

  it("makes the canonical absolute against the site's own origin", () => {
    const meta = pageMetadata({ ...base, path: "/movies" });

    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/movies`);
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/movies`);
  });

  /**
   * Pages addressed by query string have no canonical knowable at build time –
   * they set one from `useCanonicalUrl` in the browser instead. Emitting a
   * path-less canonical here would point every one of them at the same URL.
   */
  it("omits the canonical entirely when no path is given", () => {
    const meta = pageMetadata(base);

    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph && "url" in meta.openGraph).toBe(false);
  });

  it("emits a robots directive only when asked to", () => {
    expect(pageMetadata(base).robots).toBeUndefined();
    expect(pageMetadata({ ...base, noindex: true }).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  /**
   * `follow: true` alongside `index: false` is the point of the flag rather than
   * an oversight: a watchlist view should not rank, but the title pages it links
   * to should still be discovered through it.
   */
  it("keeps a noindex page crawlable", () => {
    const robots = pageMetadata({ ...base, noindex: true }).robots;

    expect(robots).toMatchObject({ follow: true });
  });
});
