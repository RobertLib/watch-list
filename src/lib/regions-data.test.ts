import { describe, expect, it } from "vitest";
import {
  getAllRegionCodes,
  getPopularRegions,
  getRegionDataByCode,
  getSortedRegions,
  isValidRegionCode,
  REGIONS_DATA,
} from "./regions-data";

/**
 * The region table itself, and the four lookups over it.
 *
 * Most of this is a data file, and a data file does not need a test. Two things
 * here do. The table feeds `regionParam()` in `tmdb-cache.ts`, which refuses to
 * build a URL out of anything that is not two capital letters – so a typo in a
 * code is not a wrong list, it is a thrown error on every listing page for
 * whoever picked that country. And `getSortedRegions` pins its locale on
 * purpose: the default one is the runtime's, Node and the browser disagree about
 * where "Chad" sorts against "Colombia", and React reports the whole `<select>`
 * as a hydration mismatch when they do.
 */

describe("REGIONS_DATA", () => {
  it("is a substantial table rather than a stub", () => {
    expect(REGIONS_DATA.length).toBeGreaterThan(100);
  });

  /** What `regionParam()` will accept. Anything else throws at request time. */
  it("holds only two-letter uppercase codes", () => {
    const malformed = REGIONS_DATA.filter(
      (region) => !/^[A-Z]{2}$/.test(region.code),
    );

    expect(malformed).toEqual([]);
  });

  it("names every region", () => {
    const unnamed = REGIONS_DATA.filter((region) => !region.name?.trim());

    expect(unnamed).toEqual([]);
  });

  it("lists no code twice", () => {
    const codes = REGIONS_DATA.map((region) => region.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes the default region the app falls back to", () => {
    expect(isValidRegionCode("US")).toBe(true);
  });
});

describe("getAllRegionCodes", () => {
  it("returns one code per row, in table order", () => {
    const codes = getAllRegionCodes();

    expect(codes).toHaveLength(REGIONS_DATA.length);
    expect(codes[0]).toBe(REGIONS_DATA[0].code);
  });
});

describe("isValidRegionCode", () => {
  it("accepts a listed code", () => {
    expect(isValidRegionCode("GB")).toBe(true);
    expect(isValidRegionCode("CZ")).toBe(true);
  });

  it("rejects anything not in the table", () => {
    expect(isValidRegionCode("ZZ")).toBe(false);
    expect(isValidRegionCode("")).toBe(false);
    expect(isValidRegionCode("USA")).toBe(false);
  });

  /** The table is uppercase, and the comparison is exact rather than folded. */
  it("is case sensitive", () => {
    expect(isValidRegionCode("us")).toBe(false);
  });
});

describe("getRegionDataByCode", () => {
  it("finds a region", () => {
    expect(getRegionDataByCode("US")?.code).toBe("US");
  });

  it("answers undefined for a code it does not know", () => {
    expect(getRegionDataByCode("ZZ")).toBeUndefined();
  });
});

describe("getSortedRegions", () => {
  it("orders by name under a pinned locale, whatever the runtime default is", () => {
    const names = getSortedRegions().map((region) => region.name);
    const expected = [...names].sort((a, b) => a.localeCompare(b, "en"));

    expect(names).toEqual(expected);
  });

  it("leaves the source table alone", () => {
    const before = REGIONS_DATA.map((region) => region.code);
    getSortedRegions();

    expect(REGIONS_DATA.map((region) => region.code)).toEqual(before);
  });

  it("loses nothing", () => {
    expect(getSortedRegions()).toHaveLength(REGIONS_DATA.length);
  });
});

describe("getPopularRegions", () => {
  it("keeps the curated order rather than sorting it", () => {
    const codes = getPopularRegions().map((region) => region.code);

    expect(codes.slice(0, 3)).toEqual(["US", "GB", "DE"]);
  });

  /**
   * The filter is what makes a mistyped code in the shortlist a missing row
   * rather than an `undefined` handed to a `<select>`. If this shrinks, one of
   * the curated codes is no longer in the table.
   */
  it("resolves every code it names", () => {
    const popular = getPopularRegions();

    expect(popular.every((region) => region !== undefined)).toBe(true);
    expect(popular).toHaveLength(14);
  });

  it("returns only regions that are in the full table", () => {
    for (const region of getPopularRegions()) {
      expect(isValidRegionCode(region.code)).toBe(true);
    }
  });
});
