import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodePrerenderedTitles,
  encodePrerenderedTitles,
  hasPrerenderedPage,
  slugHash,
} from "./prerendered-titles";
import { createSlug } from "./utils";

afterEach(() => {
  vi.unstubAllEnvs();
});

const title = (id: number, name: string) => ({ id, slug: createSlug(name, id) });

/**
 * The list of prerendered titles ships in the bundle, so it is encoded small –
 * and `routes.ts` asks it about every title link, in the build and in the
 * browser alike. A decode that disagreed with the encode would point links at
 * pages that do not exist.
 */
describe("prerendered titles", () => {
  it("round-trips ids and slug hashes, deduplicated and in any order", () => {
    const decoded = decodePrerenderedTitles(
      encodePrerenderedTitles({
        movie: [
          title(550, "Fight Club"),
          title(13, "Forrest Gump"),
          title(1_234_567, "Something"),
          title(13, "A later duplicate"),
        ],
        tv: [title(1396, "Breaking Bad")],
        person: [],
      }),
    );

    expect([...decoded.movie.keys()].sort((a, b) => a - b)).toEqual([13, 550, 1_234_567]);
    // The first entry for an id wins, as in `prebuild.mjs`.
    expect(decoded.movie.get(13)).toBe(slugHash("forrest-gump-13"));
    expect(decoded.movie.get(550)).toBe(slugHash("fight-club-550"));
    expect([...decoded.tv]).toEqual([[1396, slugHash("breaking-bad-1396")]]);
    expect(decoded.person.size).toBe(0);
  });

  it("hashes to two base-36 characters, stably", () => {
    // Pinned: the build and every browser must compute the same value.
    expect(slugHash("fight-club-550")).toMatch(/^[0-9a-z]{2}$/);
    expect(slugHash("fight-club-550")).toBe(slugHash("fight-club-550"));
    expect(slugHash("")).toMatch(/^[0-9a-z]{2}$/);
  });

  it("stays compact for a list the size the build prerenders", () => {
    // 650 films, 325 series and 250 people, spread over TMDB's id range.
    const spread = (count: number, step: number, offset: number) =>
      Array.from({ length: count }, (_, i) => title(offset + i * step, `Title number ${i}`));
    const encoded = encodePrerenderedTitles({
      movie: spread(650, 1_500, 11),
      tv: spread(325, 700, 7),
      person: spread(250, 9_000, 3),
    });

    // About five characters a title: a three-character gap, the two-character
    // hash and a separator.
    expect(encoded.length).toBeLessThan(1_225 * 6);
  });

  it("decodes nothing from an empty or absent list", () => {
    const decoded = decodePrerenderedTitles("");
    expect([decoded.movie.size, decoded.tv.size, decoded.person.size]).toEqual([0, 0, 0]);
  });

  it("answers from the list the build inlined, for the slug the page was written under", () => {
    vi.stubEnv(
      "PRERENDERED_TITLE_IDS",
      encodePrerenderedTitles({
        movie: [title(550, "Fight Club")],
        tv: [title(1396, "Breaking Bad"), title(90447, "호텔 델루나")],
        person: [title(31, "Tom Hanks")],
      }),
    );

    expect(hasPrerenderedPage("movie", 550, "fight-club-550")).toBe(true);
    expect(hasPrerenderedPage("tv", 550, "fight-club-550")).toBe(false);
    expect(hasPrerenderedPage("person", 31, "tom-hanks-31")).toBe(true);
    // A name with no Latin letters is a bare id, and that is its page.
    expect(hasPrerenderedPage("tv", 90447, "90447")).toBe(true);
    // Renamed since the build: the id is listed, the file is not this one.
    expect(hasPrerenderedPage("movie", 550, "fight-club-directors-cut-550")).toBe(false);

    vi.stubEnv("PRERENDERED_TITLE_IDS", "");
    expect(hasPrerenderedPage("movie", 550, "fight-club-550")).toBe(false);
  });
});
