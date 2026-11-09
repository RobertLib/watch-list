import { afterEach, describe, expect, it } from "vitest";
import {
  formatTmdbDate,
  isCalendarDate,
  releaseYear,
  releaseYearSuffix,
  shiftDate,
  shiftYears,
  todayLocal,
  yearsBetween,
} from "./dates";

/**
 * The whole point of this module is that its answers do not depend on where the
 * visitor is, so every assertion about a date is made from several places at
 * once. Two of these are west of Greenwich, which is where the bug this module
 * replaced actually showed: there, midnight UTC is still the previous evening.
 *
 * Node re-reads `process.env.TZ` on the next `Date` it builds, so changing it
 * mid-test is enough – no child process needed.
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

describe("releaseYear", () => {
  it("reads the year off the date rather than out of the local calendar", () => {
    inEveryZone((zone) => {
      expect(releaseYear("2011-04-17"), zone).toBe(2011);
    });
  });

  // TMDB stores a title it only knows the year of as the 1st of January, which
  // is a large share of the catalogue – and the exact date that used to come
  // back a year early anywhere west of Greenwich.
  it("keeps the year of a 1 January release in every timezone", () => {
    inEveryZone((zone) => {
      expect(releaseYear("2020-01-01"), zone).toBe(2020);
      expect(releaseYear("1994-01-01"), zone).toBe(1994);
    });
  });

  it("is null for a missing date rather than NaN", () => {
    expect(releaseYear(null)).toBeNull();
    expect(releaseYear(undefined)).toBeNull();
    expect(releaseYear("")).toBeNull();
    expect(releaseYear("   ")).toBeNull();
  });

  it("is null for a date TMDB sent in a shape Date cannot read", () => {
    expect(releaseYear("coming soon")).toBeNull();
  });

  it("reads a full timestamp in UTC", () => {
    inEveryZone((zone) => {
      expect(releaseYear("2021-01-01T02:30:00.000Z"), zone).toBe(2021);
    });
  });
});

describe("releaseYearSuffix", () => {
  it("wraps the year of a release date", () => {
    expect(releaseYearSuffix("2026-07-28")).toBe(" (2026)");
  });

  // This one reaches the document title and every share preview, so a year off
  // by one is visible well outside the page.
  it("wraps the right year on 1 January, wherever it is read", () => {
    inEveryZone((zone) => {
      expect(releaseYearSuffix("2020-01-01"), zone).toBe(" (2020)");
    });
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

describe("formatTmdbDate", () => {
  it("shows the day that went in, not the one the local clock is on", () => {
    inEveryZone((zone) => {
      expect(formatTmdbDate("2011-04-17"), zone).toBe("April 17, 2011");
      expect(formatTmdbDate("1963-12-18"), zone).toBe("December 18, 1963");
    });
  });

  it("honours the caller's format", () => {
    inEveryZone((zone) => {
      expect(
        formatTmdbDate("2011-04-17", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
        }),
        zone,
      ).toBe("4/17/2011");
    });
  });

  it("is null for a missing date", () => {
    expect(formatTmdbDate(null)).toBeNull();
    expect(formatTmdbDate(undefined)).toBeNull();
    expect(formatTmdbDate("")).toBeNull();
  });

  it("is null for a day that does not exist", () => {
    expect(formatTmdbDate("2020-13-45")).toBeNull();
    expect(formatTmdbDate("2020-00-10")).toBeNull();
    expect(formatTmdbDate("2020-01-00")).toBeNull();
  });

  // The month is in range and the day is under 32, so the pattern lets these
  // through – and `Date` rolls the overflow into the next month instead of
  // refusing it, which showed "2021-02-29" as "March 1, 2021".
  it("is null for a day the month does not have", () => {
    inEveryZone((zone) => {
      expect(formatTmdbDate("2021-02-29"), zone).toBeNull();
      expect(formatTmdbDate("2020-02-30"), zone).toBeNull();
      expect(formatTmdbDate("2026-04-31"), zone).toBeNull();
      expect(formatTmdbDate("1900-02-29"), zone).toBeNull();
    });
  });

  it("shows the 29th of February in a leap year", () => {
    inEveryZone((zone) => {
      expect(formatTmdbDate("2020-02-29"), zone).toBe("February 29, 2020");
      expect(formatTmdbDate("2000-02-29"), zone).toBe("February 29, 2000");
    });
  });

  // A timestamp is a real instant, and pinning one to UTC would be the same
  // mistake in the other direction – so it is refused rather than mangled.
  it("refuses a full timestamp", () => {
    expect(formatTmdbDate("2021-04-19T18:09:17.411Z")).toBeNull();
  });
});

describe("isCalendarDate", () => {
  it("accepts a real day", () => {
    expect(isCalendarDate("2011-04-17")).toBe(true);
    expect(isCalendarDate("2026-12-31")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2000-02-29")).toBe(true);
  });

  it("follows the Gregorian leap rule, centuries included", () => {
    expect(isCalendarDate("2023-02-29")).toBe(false);
    expect(isCalendarDate("1900-02-29")).toBe(false);
    expect(isCalendarDate("2100-02-29")).toBe(false);
  });

  // `Date.UTC` maps years 0–99 onto 1900–1999, which is why the days are counted
  // by hand rather than by building a Date and reading it back.
  it("counts years below 100 as themselves", () => {
    expect(isCalendarDate("0004-02-29")).toBe(true);
    expect(isCalendarDate("0003-02-29")).toBe(false);
  });

  it("refuses days the month does not have", () => {
    for (const date of ["2026-04-31", "2026-06-31", "2026-09-31", "2026-11-31", "2026-01-32"]) {
      expect(isCalendarDate(date), date).toBe(false);
    }
  });

  it("refuses anything but a bare zero-padded date", () => {
    for (const date of ["", "2026-1-05", "2026-01-5", "2026-13-01", "2026-00-01", "2026-01-00", "2026-01-05T00:00:00Z", " 2026-01-05"]) {
      expect(isCalendarDate(date), date).toBe(false);
    }
  });

  it("agrees with Date for every day of a leap year and a common one", () => {
    for (const year of [2023, 2024]) {
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 1; day <= 31; day += 1) {
          const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const real = new Date(`${date}T00:00:00.000Z`).toISOString().startsWith(date);
          expect(isCalendarDate(date), date).toBe(real);
        }
      }
    }
  });
});

describe("yearsBetween", () => {
  it("counts whole years", () => {
    expect(yearsBetween("2000-06-15", "2026-06-15")).toBe(26);
  });

  it("does not count the year until the day arrives", () => {
    expect(yearsBetween("2000-06-15", "2026-06-14")).toBe(25);
    expect(yearsBetween("2000-06-15", "2026-06-16")).toBe(26);
  });

  // Dividing elapsed milliseconds by an average 365.25-day year drifts against
  // the real leap pattern, and landed a year short on the birthday itself.
  it("is right on the birthday of someone born a long time ago", () => {
    expect(yearsBetween("1920-09-13", "2026-09-13")).toBe(106);
    expect(yearsBetween("1924-09-13", "2026-09-13")).toBe(102);
  });

  it("handles a birthday on 29 February", () => {
    expect(yearsBetween("2000-02-29", "2026-02-28")).toBe(25);
    expect(yearsBetween("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("is null without a birthday", () => {
    expect(yearsBetween(null)).toBeNull();
    expect(yearsBetween(undefined)).toBeNull();
    expect(yearsBetween("unknown")).toBeNull();
  });

  it("agrees with calendar arithmetic across a century of birthdays", () => {
    const to = "2026-09-13";

    for (let year = 1920; year <= 2020; year++) {
      for (const monthDay of ["01-01", "06-15", "09-12", "09-13", "12-31"]) {
        const from = `${year}-${monthDay}`;
        const [, month, day] = from.split("-");

        let expected = 2026 - year;
        if (month > "09" || (month === "09" && day > "13")) expected -= 1;

        expect(yearsBetween(from, to), from).toBe(expected);
      }
    }
  });
});

describe("todayLocal", () => {
  it("formats the local day as YYYY-MM-DD", () => {
    expect(todayLocal(new Date(2026, 8, 13, 14, 30))).toBe("2026-09-13");
  });

  it("zero-pads a single-digit month and day", () => {
    expect(todayLocal(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });
});

describe("shiftDate", () => {
  it("moves by whole days", () => {
    expect(shiftDate("2026-08-01", 7)).toBe("2026-08-08");
    expect(shiftDate("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("is a no-op for zero", () => {
    expect(shiftDate("2026-08-01", 0)).toBe("2026-08-01");
  });
});

describe("shiftYears", () => {
  it("moves by whole calendar years", () => {
    expect(shiftYears("2026-08-01", -10)).toBe("2016-08-01");
    expect(shiftYears("2026-08-01", 1)).toBe("2027-08-01");
  });

  // The form this replaced – `Date.now() - n * 365 * DAY` – lands short by one
  // day per leap year in the span, which is what put a "last 15 years" floor on
  // the 28th of July rather than the 1st of August.
  it("does not drift the way multiplying by 365 days does", () => {
    expect(shiftYears("2026-08-01", -15)).toBe("2011-08-01");
    expect(shiftDate("2026-08-01", -15 * 365)).toBe("2011-08-05");
  });

  it("rolls the 29th of February into March in a year without one", () => {
    expect(shiftYears("2028-02-29", -1)).toBe("2027-03-01");
  });
});
