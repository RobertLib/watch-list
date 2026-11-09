import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodePrerenderedIds,
  encodePrerenderedIds,
  hasPrerenderedPage,
} from "./prerendered-titles";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * The list of prerendered titles ships in the bundle, so it is encoded small –
 * and `routes.ts` asks it about every title link, in the build and in the
 * browser alike. A decode that disagreed with the encode would point links at
 * pages that do not exist.
 */
describe("prerendered title ids", () => {
  it("round-trips, deduplicated and in any order", () => {
    const ids = { movie: [550, 13, 1_234_567, 13], tv: [1396], person: [] };
    const decoded = decodePrerenderedIds(encodePrerenderedIds(ids));

    expect([...decoded.movie].sort((a, b) => a - b)).toEqual([13, 550, 1_234_567]);
    expect([...decoded.tv]).toEqual([1396]);
    expect(decoded.person.size).toBe(0);
  });

  it("is compact", () => {
    const movie = Array.from({ length: 1000 }, (_, i) => 1000 + i * 997);
    // Base-36 gaps of about a thousand are two characters and a separator.
    expect(encodePrerenderedIds({ movie, tv: [], person: [] }).length).toBeLessThan(3500);
  });

  it("decodes nothing from an empty or absent list", () => {
    const decoded = decodePrerenderedIds("");
    expect([decoded.movie.size, decoded.tv.size, decoded.person.size]).toEqual([0, 0, 0]);
  });

  it("answers from the list the build inlined", () => {
    vi.stubEnv("PRERENDERED_TITLE_IDS", encodePrerenderedIds({ movie: [550], tv: [1396], person: [31] }));

    expect(hasPrerenderedPage("movie", 550)).toBe(true);
    expect(hasPrerenderedPage("tv", 550)).toBe(false);
    expect(hasPrerenderedPage("person", 31)).toBe(true);

    vi.stubEnv("PRERENDERED_TITLE_IDS", "");
    expect(hasPrerenderedPage("movie", 550)).toBe(false);
  });
});
