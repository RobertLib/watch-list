import { describe, expect, it } from "vitest";
import {
  getAllValidRegions,
  getRegionCode,
  getRegionName,
  isValidRegion,
} from "./region";

/**
 * The region reaches TMDB in a URL and comes out of storage, which means it also
 * comes out of anything a visitor can hand-edit. Every function here has to
 * answer something usable for a value that is not a region at all.
 */
describe("getRegionCode", () => {
  it("passes a supported code through", () => {
    expect(getRegionCode("GB")).toBe("GB");
    expect(getRegionCode("CZ")).toBe("CZ");
  });

  it("falls back to US for anything it does not recognise", () => {
    expect(getRegionCode("XX")).toBe("US");
    expect(getRegionCode("")).toBe("US");
    expect(getRegionCode("gb")).toBe("US");
  });
});

describe("getRegionName", () => {
  it("names a supported region", () => {
    expect(getRegionName("US")).toBe("United States of America");
    expect(getRegionName("GB").length).toBeGreaterThan(0);
  });

  // These two used to disagree: the fallback was its own string literal, so an
  // unknown code named a country the code "US" did not.
  it("falls back to the same name the default code resolves to", () => {
    expect(getRegionName("XX")).toBe(getRegionName("US"));
  });
});

describe("getAllValidRegions", () => {
  const regions = getAllValidRegions();

  it("offers a non-trivial list", () => {
    expect(regions.length).toBeGreaterThan(10);
  });

  it("lists the default region among them", () => {
    // `getRegionCode` falls back to US, so a list without it would leave the
    // selector unable to show what is actually in effect.
    expect(regions).toContain("US");
  });

  it("lists nothing twice", () => {
    expect(new Set(regions).size).toBe(regions.length);
  });

  it("agrees with isValidRegion about every entry", () => {
    expect(regions.every((region) => isValidRegion(region))).toBe(true);
  });

  // The codes are interpolated into a TMDB query, and `tmdb-cache.ts` refuses
  // anything that is not two uppercase letters outright.
  it("is all two-letter uppercase codes", () => {
    expect(regions.every((region) => /^[A-Z]{2}$/.test(region))).toBe(true);
  });
});

describe("isValidRegion", () => {
  it("accepts a supported code and rejects everything else", () => {
    expect(isValidRegion("US")).toBe(true);
    expect(isValidRegion("ZZ")).toBe(false);
    expect(isValidRegion("")).toBe(false);
  });
});
