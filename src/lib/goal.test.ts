import { describe, expect, it } from "vitest";
import {
  dayOfYear,
  daysInYear,
  goalProgress,
  MAX_GOAL,
  sanitizeGoal,
} from "./goal";

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
  it("counts the first of January as day one", () => {
    expect(dayOfYear(new Date("2026-01-01T12:00:00.000Z"))).toBe(1);
  });

  it("counts the last day of a common year as 365", () => {
    expect(dayOfYear(new Date("2026-12-31T00:00:00.000Z"))).toBe(365);
  });

  it("counts the leap day", () => {
    expect(dayOfYear(new Date("2028-03-01T00:00:00.000Z"))).toBe(61);
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
