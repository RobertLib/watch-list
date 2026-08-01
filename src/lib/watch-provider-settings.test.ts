import { describe, expect, it } from "vitest";
import {
  MY_PROVIDERS,
  isWatchProviderFilter,
  parseProviderIdsFromCookie,
  providerIdsToCookieValue,
  sanitizeProviderIds,
  sanitizeWatchProvidersFilter,
} from "./watch-provider-settings";

describe("isWatchProviderFilter", () => {
  it("accepts only the two known values", () => {
    expect(isWatchProviderFilter("all")).toBe(true);
    expect(isWatchProviderFilter("streaming-only")).toBe(true);
    expect(isWatchProviderFilter("streaming")).toBe(false);
    expect(isWatchProviderFilter("")).toBe(false);
    expect(isWatchProviderFilter(undefined)).toBe(false);
    expect(isWatchProviderFilter(null)).toBe(false);
    expect(isWatchProviderFilter(8)).toBe(false);
    expect(isWatchProviderFilter({})).toBe(false);
  });
});

describe("sanitizeProviderIds", () => {
  it("keeps positive integers", () => {
    expect(sanitizeProviderIds([8, 337, 9])).toEqual([8, 337, 9]);
  });

  it("de-duplicates while preserving order", () => {
    expect(sanitizeProviderIds([8, 337, 8, 9, 337])).toEqual([8, 337, 9]);
  });

  it("drops anything that is not a usable id", () => {
    expect(
      sanitizeProviderIds([8, 0, -1, 1.5, NaN, Infinity, "9", null, {}, []]),
    ).toEqual([8]);
  });

  it("rejects a payload that is not an array", () => {
    expect(sanitizeProviderIds("8,9")).toEqual([]);
    expect(sanitizeProviderIds(undefined)).toEqual([]);
    expect(sanitizeProviderIds({ 0: 8 })).toEqual([]);
  });

  // The list rides along in a cookie, so an unbounded payload is refused.
  it("caps the number of stored ids", () => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    expect(sanitizeProviderIds(ids)).toHaveLength(50);
  });
});

describe("sanitizeWatchProvidersFilter", () => {
  it("passes the profile sentinel through untouched", () => {
    expect(sanitizeWatchProvidersFilter(MY_PROVIDERS)).toBe(MY_PROVIDERS);
  });

  it("normalises both separators to the pipe TMDB expects", () => {
    expect(sanitizeWatchProvidersFilter("8,337")).toBe("8|337");
    expect(sanitizeWatchProvidersFilter("8|337")).toBe("8|337");
    expect(sanitizeWatchProvidersFilter(" 8 , 337 ")).toBe("8|337");
  });

  it("drops junk instead of forwarding it to TMDB", () => {
    expect(sanitizeWatchProvidersFilter("8,abc,-3,0")).toBe("8");
    expect(sanitizeWatchProvidersFilter("abc")).toBe("");
    expect(sanitizeWatchProvidersFilter("")).toBe("");
    expect(sanitizeWatchProvidersFilter(undefined)).toBe("");
    expect(sanitizeWatchProvidersFilter(8)).toBe("");
    expect(sanitizeWatchProvidersFilter(["8"])).toBe("");
  });

  it("bounds the result so it cannot inflate a cache tag", () => {
    const many = Array.from({ length: 200 }, (_, i) => i + 1).join(",");
    expect(sanitizeWatchProvidersFilter(many).split("|")).toHaveLength(50);
  });
});

describe("provider id cookie round-trip", () => {
  it("survives the trip through the cookie value", () => {
    const ids = [8, 337, 1899];
    expect(parseProviderIdsFromCookie(providerIdsToCookieValue(ids))).toEqual(
      ids,
    );
  });

  it("treats an absent cookie as no selection rather than as an error", () => {
    expect(parseProviderIdsFromCookie("")).toEqual([]);
  });

  it("skips entries a hand-edited cookie might carry", () => {
    expect(parseProviderIdsFromCookie("8,,abc,-2,0,337")).toEqual([8, 337]);
  });
});
