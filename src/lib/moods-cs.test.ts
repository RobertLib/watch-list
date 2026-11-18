import { describe, expect, it } from "vitest";
import { MOODS, MOOD_GROUPS, localizeMood, moodGroupHeading } from "./moods";
import { MOOD_GROUP_HEADINGS_CS, MOOD_TEXT_CS } from "./moods-cs";

describe("MOOD_TEXT_CS", () => {
  it.each(MOODS.map((mood) => [mood.slug]))("has Czech words for %s", (slug) => {
    const text = MOOD_TEXT_CS[slug];
    expect(text).toBeDefined();
    expect(text.label.trim()).not.toBe("");
    expect(text.title.trim()).not.toBe("");
    expect(text.description.trim()).not.toBe("");
  });

  it("names no mood that does not exist", () => {
    const slugs = new Set(MOODS.map((mood) => mood.slug));
    expect(Object.keys(MOOD_TEXT_CS).filter((slug) => !slugs.has(slug))).toEqual([]);
  });

  // The description is also the page's meta description, which a search engine
  // cuts at about this length.
  it("keeps every description short enough for a meta description", () => {
    const tooLong = Object.entries(MOOD_TEXT_CS)
      .filter(([, text]) => text.description.length > 160)
      .map(([slug]) => slug);
    expect(tooLong).toEqual([]);
  });

  it("gives every mood a Czech page of its own words", () => {
    for (const mood of MOODS) {
      const czech = localizeMood(mood, "cs");
      expect(czech.title).not.toBe(mood.title);
      expect(czech.description).not.toBe(mood.description);
      // Only the words change; the query is the same in both languages.
      expect(czech.movie).toBe(mood.movie);
      expect(czech.tv).toBe(mood.tv);
    }
  });

  it("heads every group of /moods in Czech", () => {
    for (const group of MOOD_GROUPS) {
      expect(moodGroupHeading(group.id, "cs")).toBe(MOOD_GROUP_HEADINGS_CS[group.id]);
      expect(moodGroupHeading(group.id, "cs")).not.toBe(group.heading);
    }
  });
});
