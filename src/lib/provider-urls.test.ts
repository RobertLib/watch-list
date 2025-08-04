import { describe, expect, it } from "vitest";
import { getProviderSearchUrl } from "./provider-urls";

/**
 * TMDB reuses retired provider IDs for unrelated services, so an entry written
 * against older data does not break – it silently starts pointing somewhere
 * else, and the only symptom is a visitor sent to the wrong company's website.
 * The cases below are the ones that have actually gone wrong, pinned so the next
 * edit to the table has to be deliberate about them.
 */
describe("getProviderSearchUrl", () => {
  it("returns undefined for an unmapped provider, so the caller renders text", () => {
    expect(getProviderSearchUrl(999999, "Dune")).toBeUndefined();
  });

  it("escapes the title into the query string", () => {
    expect(getProviderSearchUrl(8, "Fast & Furious")).toBe(
      "https://www.netflix.com/search?q=Fast%20%26%20Furious",
    );
    expect(getProviderSearchUrl(192, "Am%lie")).toBe(
      "https://www.youtube.com/results?search_query=Am%25lie",
    );
  });

  it("ignores the title for platforms whose search needs a login", () => {
    expect(getProviderSearchUrl(337, "Dune")).toBe("https://www.disneyplus.com");
    expect(getProviderSearchUrl(1899, "Dune")).toBe("https://www.max.com");
  });

  // The regression the table's comment is written about: 1796 is "Netflix
  // Standard with Ads", and an entry carried over from older TMDB data sent it
  // to voyo.cz.
  it("sends Netflix's ad tier to Netflix", () => {
    const withAds = getProviderSearchUrl(1796, "Dune");

    expect(withAds).toBe("https://www.netflix.com/search?q=Dune");
    expect(withAds).not.toContain("voyo");
  });

  // 634 is Starz. It is the ID O2 TV was once assumed to hold, and O2 TV is not
  // in TMDB's provider list at all.
  it("keeps 634 on Starz rather than an assumed Czech platform", () => {
    expect(getProviderSearchUrl(634, "Dune")).toBe("https://www.starz.com");
  });

  // Leaving an ID out is the documented way to say "destination unverified":
  // 389 is Sooner, not the Peacock tier its neighbours 386 and 387 are.
  it("leaves an unverified ID unmapped rather than guessing", () => {
    expect(getProviderSearchUrl(389, "Dune")).toBeUndefined();
  });

  /**
   * Every destination is an absolute https URL. A relative or http one would be
   * rendered into an `href` that either leaves the site for nowhere or trips a
   * mixed-content block.
   */
  it("only ever produces absolute https URLs", () => {
    const mapped = [8, 9, 119, 337, 350, 1899, 15, 531, 283, 386, 2, 3, 10, 192, 627, 1928, 2536];

    for (const id of mapped) {
      const url = getProviderSearchUrl(id, "Some Title");

      expect(url, `provider ${id}`).toBeDefined();
      expect(url!.startsWith("https://"), `provider ${id}`).toBe(true);
      expect(url).not.toContain(" ");
    }
  });
});
