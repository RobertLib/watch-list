import { afterEach, describe, expect, it } from "vitest";
import {
  dayOfYear,
  daysInYear,
  goalProgress,
  MAX_GOAL,
  sanitizeGoal,
} from "./goal";

/**
 * The day of the year is the visitor's, so it is checked from several places
 * at once – two of them west of Greenwich, where midnight UTC is still the
 * previous evening. Node re-reads `process.env.TZ` on the next `Date` it
 * builds, so changing it mid-test is enough; see `dates.test.ts`.
 */
const ZONES = [
  "UTC",
  "Europe/Prague",
  "America/New_York",
  "America/Los_Angeles",
  "Pacific/Auckland",
];

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function inEveryZone(assert: (zone: string) => void): void {
  for (const zone of ZONES) {
    process.env.TZ = zone;
    assert(zone);
  }
}

describe("sanitizeGoal", () => {
  it("keeps a well-formed goal", () => {
    expect(sanitizeGoal({ year: "2026", target: 52 })).toEqual({
      year: "2026",
      target: 52,
    });
  });

  it("refuses a target outside the allowed range", () => {
    expect(sanitizeGoal({ year: "2026", target: 0 })).toBeNull();
    expect(sanitizeGoal({ year: "2026", target: MAX_GOAL + 1 })).toBeNull();
  });

  it("refuses a target that is not a whole number of titles", () => {
    expect(sanitizeGoal({ year: "2026", target: 12.5 })).toBeNull();
  });

  it("refuses anything that is not a year", () => {
    expect(sanitizeGoal({ year: "26", target: 10 })).toBeNull();
    expect(sanitizeGoal({ target: 10 })).toBeNull();
  });

  it("refuses a non-object", () => {
    expect(sanitizeGoal(null)).toBeNull();
    expect(sanitizeGoal([{ year: "2026", target: 5 }])).toBeNull();
  });
});

describe("goalProgress", () => {
  const goal = { year: "2026", target: 50 };

  it("reports the fraction done", () => {
    const progress = goalProgress(goal, 25, {
      dayOfYear: 100,
      daysInYear: 365,
    });

    expect(progress.fraction).toBe(0.5);
    expect(progress.remaining).toBe(25);
  });

  it("caps the bar at complete rather than overflowing it", () => {
    const progress = goalProgress(goal, 80, {
      dayOfYear: 200,
      daysInYear: 365,
    });

    expect(progress.fraction).toBe(1);
    expect(progress.remaining).toBe(0);
  });

  it("works out what being on track would look like today", () => {
    const progress = goalProgress(goal, 10, {
      dayOfYear: 183,
      daysInYear: 365,
    });

    // Half the year gone, so half the target.
    expect(progress.expectedByNow).toBe(25);
  });

  it("has no pace to report for a year that is not the current one", () => {
    expect(
      goalProgress(goal, 10, { dayOfYear: null, daysInYear: 365 })
        .expectedByNow,
    ).toBeNull();
  });
});

describe("dayOfYear", () => {
  // The dates are built with the local constructor, so each one is "this day
  // where the visitor is" – which is the day the count is about.
  it("counts the first of January as day one", () => {
    inEveryZone((zone) => {
      expect(dayOfYear(new Date(2026, 0, 1, 12)), zone).toBe(1);
    });
  });

  it("counts the last day of a common year as 365", () => {
    inEveryZone((zone) => {
      expect(dayOfYear(new Date(2026, 11, 31, 0, 0)), zone).toBe(365);
    });
  });

  it("counts the leap day", () => {
    inEveryZone((zone) => {
      expect(dayOfYear(new Date(2028, 2, 1)), zone).toBe(61);
    });
  });

  /**
   * The hours either side of midnight are where a UTC count went wrong: at one
   * in the morning on New Year's Day in Auckland, Greenwich is still on the
   * 31st and the count said 365 for a day the visitor knew was the 1st.
   */
  it("reads the day off the visitor's clock, not Greenwich's", () => {
    inEveryZone((zone) => {
      expect(dayOfYear(new Date(2026, 0, 1, 1, 0)), zone).toBe(1);
      expect(dayOfYear(new Date(2025, 11, 31, 23, 0)), zone).toBe(365);
    });
  });

  // A daylight-saving change makes one local day 23 hours long; dividing
  // elapsed local milliseconds by 24 hours would then land a day short.
  it("is not thrown off by a daylight-saving change", () => {
    process.env.TZ = "Europe/Prague";
    // The last Sunday of March 2026 is the 29th; clocks go forward that morning.
    expect(dayOfYear(new Date(2026, 2, 30, 0, 30))).toBe(89);
  });
});

describe("daysInYear", () => {
  it("knows the leap rule, including the century exceptions", () => {
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
  });
});
