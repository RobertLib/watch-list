import { describe, expect, it } from "vitest";
import { releaseYears } from "./filters";

/**
 * The year list used to be a module-level constant, which for a static export
 * means "the year on the build machine, forever". A site built in December
 * offered no January until it was rebuilt. So the list is a function of a clock
 * it is handed, and these pin that the clock is the one that decides.
 */
describe("releaseYears", () => {
  it("runs from the year it is given back to the first film", () => {
    const years = releaseYears(new Date(2026, 8, 14));

    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(1895);
    expect(years).toHaveLength(2026 - 1895 + 1);
  });

  it("is newest first, one year apart, with no gaps", () => {
    const years = releaseYears(new Date(2026, 0, 1));

    for (let i = 1; i < years.length; i++) {
      expect(years[i - 1] - years[i]).toBe(1);
    }
  });

  // The whole point: two calls with two clocks are two different lists, so a
  // visitor in a new year sees it without anyone rebuilding the site.
  it("follows the clock it is handed rather than the one it was loaded under", () => {
    expect(releaseYears(new Date(2025, 11, 31))[0]).toBe(2025);
    expect(releaseYears(new Date(2026, 0, 1))[0]).toBe(2026);
  });

  it("reads the year off the local calendar, like the rest of the app", () => {
    // Local constructor, so this is New Year's Day where the visitor is,
    // whatever Greenwich says.
    expect(releaseYears(new Date(2026, 0, 1, 0, 30))[0]).toBe(2026);
  });

  it("defaults to the current clock", () => {
    expect(releaseYears()[0]).toBe(new Date().getFullYear());
  });
});
