import { afterEach, describe, expect, it } from "vitest";
import {
  formatTmdbDate,
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
  });

  // A timestamp is a real instant, and pinning one to UTC would be the same
  // mistake in the other direction – so it is refused rather than mangled.
  it("refuses a full timestamp", () => {
    expect(formatTmdbDate("2021-04-19T18:09:17.411Z")).toBeNull();
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
