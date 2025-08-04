import { describe, expect, it } from "vitest";
import { getRegionCode, getRegionName, isValidRegion } from "./region";

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

describe("isValidRegion", () => {
  it("accepts a supported code and rejects everything else", () => {
    expect(isValidRegion("US")).toBe(true);
    expect(isValidRegion("ZZ")).toBe(false);
    expect(isValidRegion("")).toBe(false);
  });
});
