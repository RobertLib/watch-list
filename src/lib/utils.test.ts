import { describe, expect, it } from "vitest";
import { cn, createSlug, extractIdFromSlug, releaseYearSuffix } from "./utils";

describe("createSlug", () => {
  it("lowercases and dash-joins a title", () => {
    expect(createSlug("The Dark Knight", 155)).toBe("the-dark-knight-155");
  });

  it("strips punctuation rather than encoding it", () => {
    expect(createSlug("Amélie: A Story?!", 194)).toBe("amlie-a-story-194");
    expect(createSlug("Star Wars (1977)", 11)).toBe("star-wars-1977-11");
  });

  it("collapses runs of whitespace and dashes into one dash", () => {
    expect(createSlug("Mad   Max --- Fury Road", 76341)).toBe(
      "mad-max-fury-road-76341",
    );
  });

  it("leaves no leading or trailing dash", () => {
    expect(createSlug("  ...Spirited Away...  ", 129)).toBe(
      "spirited-away-129",
    );
  });

  // A title in a non-Latin script loses every character, and the id is all the
  // detail pages actually need to resolve the URL.
  it("falls back to the bare id when nothing survives", () => {
    expect(createSlug("千と千尋の神隠し", 129)).toBe("-129");
  });

  it("handles a missing title without throwing", () => {
    expect(createSlug("", 42)).toBe("item-42");
    expect(createSlug(undefined as unknown as string, 42)).toBe("item-42");
    expect(createSlug(null as unknown as string, 42)).toBe("item-42");
  });
});

describe("extractIdFromSlug", () => {
  it("reads a bare numeric slug", () => {
    expect(extractIdFromSlug("1405")).toBe(1405);
  });

  it("reads the id off the end", () => {
    expect(extractIdFromSlug("dexter-1405")).toBe(1405);
    expect(extractIdFromSlug("the-dark-knight-155")).toBe(155);
  });

  it("reads the id off the front", () => {
    expect(extractIdFromSlug("1405-dexter")).toBe(1405);
  });

  it("prefers the trailing id when both ends carry a number", () => {
    expect(extractIdFromSlug("2012-movie-1234")).toBe(1234);
  });

  it("returns null when there is no id to find", () => {
    expect(extractIdFromSlug("dexter")).toBeNull();
    expect(extractIdFromSlug("")).toBeNull();
    expect(extractIdFromSlug("-")).toBeNull();
  });

  it("round-trips whatever createSlug produced", () => {
    for (const [title, id] of [
      ["The Dark Knight", 155],
      ["Amélie: A Story?!", 194],
      ["千と千尋の神隠し", 129],
      ["", 42],
    ] as const) {
      expect(extractIdFromSlug(createSlug(title, id))).toBe(id);
    }
  });
});

describe("releaseYearSuffix", () => {
  it("wraps the year of a release date", () => {
    expect(releaseYearSuffix("2026-07-28")).toBe(" (2026)");
  });

  it("is empty for a missing date rather than yielding (N/A)", () => {
    expect(releaseYearSuffix(null)).toBe("");
    expect(releaseYearSuffix(undefined)).toBe("");
    expect(releaseYearSuffix("")).toBe("");
  });

  it("is empty for a date TMDB sent in a shape Date cannot read", () => {
    expect(releaseYearSuffix("coming soon")).toBe("");
  });
});

describe("cn", () => {
  it("joins truthy class names and drops the rest", () => {
    expect(cn("a", false, undefined, null, "b", 0)).toBe("a b");
  });

  it("flattens nested arrays", () => {
    expect(cn("a", ["b", ["c", false]])).toBe("a b c");
  });

  it("returns an empty string when nothing applies", () => {
    expect(cn(false, undefined)).toBe("");
  });
});
