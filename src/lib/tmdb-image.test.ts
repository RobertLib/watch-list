import { describe, expect, it } from "vitest";
import { getImageUrl, getImageUrlOrNull } from "./tmdb-image";

/**
 * `next.config.ts` sets `unoptimized`, so there is no optimiser between these
 * strings and the network: the size named here is the size the browser
 * downloads. That makes a wrong segment a bandwidth bug rather than a cosmetic
 * one, and it is why the two functions are pinned separately – they differ in
 * exactly the way their callers depend on, which is what a missing path
 * produces.
 */
describe("getImageUrlOrNull", () => {
  it("builds a CDN URL at the size it was asked for", () => {
    expect(getImageUrlOrNull("/poster.jpg", "w92")).toBe(
      "https://image.tmdb.org/t/p/w92/poster.jpg",
    );
    expect(getImageUrlOrNull("/poster.jpg", "original")).toBe(
      "https://image.tmdb.org/t/p/original/poster.jpg",
    );
  });

  it("defaults to w500", () => {
    expect(getImageUrlOrNull("/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg",
    );
  });

  // The daily puzzle steps up through the narrow sizes to sharpen its still, so
  // a size quietly dropped from the union would break the game rather than just
  // serve a larger file.
  it("serves every size the puzzle steps through", () => {
    for (const size of ["w92", "w154", "w185", "w300", "w500"] as const) {
      expect(getImageUrlOrNull("/still.jpg", size)).toBe(
        `https://image.tmdb.org/t/p/${size}/still.jpg`,
      );
    }
  });

  it("answers null for a missing path, so a caller can omit the field", () => {
    expect(getImageUrlOrNull(null)).toBeNull();
    expect(getImageUrlOrNull(undefined)).toBeNull();
    expect(getImageUrlOrNull("")).toBeNull();
  });
});

describe("getImageUrl", () => {
  it("agrees with getImageUrlOrNull whenever there is a path", () => {
    expect(getImageUrl("/poster.jpg", "w780")).toBe(
      getImageUrlOrNull("/poster.jpg", "w780"),
    );
  });

  /**
   * The whole reason both exist. Structured data and the puzzle board have to
   * leave the image out rather than stand a placeholder in for it – a `data:`
   * URI in a JSON-LD `image` field is worse than no field at all – so the
   * substitution must stay on this side of the pair only.
   */
  it("substitutes an inline placeholder where the other returns null", () => {
    const placeholder = getImageUrl(null);

    expect(placeholder.startsWith("data:image/svg+xml,")).toBe(true);
    expect(getImageUrl("")).toBe(placeholder);
    expect(getImageUrlOrNull(null)).toBeNull();
  });
});
