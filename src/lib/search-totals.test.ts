import { describe, expect, it } from "vitest";
import { countTitleResults } from "./search-totals";

/**
 * The heading over the search grid. It used to print `/search/multi`'s own
 * `total_results`, which counts people alongside titles while the grid shows
 * only titles – so any query naming an actor promised far more than the page
 * delivered.
 */
describe("countTitleResults", () => {
  it("subtracts the people from the multi-search total", () => {
    expect(countTitleResults(1204, 1193)).toBe(11);
  });

  it("leaves a total with no people in it alone", () => {
    expect(countTitleResults(42, 0)).toBe(42);
  });

  /**
   * The degradation path. `/search/person` is fetched through `allSettled`
   * precisely so losing it does not cost the titles, so a failed people lookup
   * has to leave a usable heading rather than none.
   */
  it("falls back to the raw total when there is no people count", () => {
    expect(countTitleResults(42, undefined)).toBe(42);
    expect(countTitleResults(42, Number.NaN)).toBe(42);
  });

  /**
   * Two endpoints are being subtracted from one another, and nothing guarantees
   * they agree to the row. "-3 titles" is a worse heading than "no titles".
   */
  it("never reports a negative count", () => {
    expect(countTitleResults(5, 9)).toBe(0);
    expect(countTitleResults(0, 12)).toBe(0);
  });

  it("treats a missing multi total as nothing found", () => {
    expect(countTitleResults(undefined, undefined)).toBe(0);
    expect(countTitleResults(undefined, 4)).toBe(0);
  });

  /**
   * A query matching only people: the count has to reach zero so the heading
   * says "No titles matched" rather than naming a number the grid cannot show.
   */
  it("reaches zero when every match was a person", () => {
    expect(countTitleResults(18, 18)).toBe(0);
  });
});
