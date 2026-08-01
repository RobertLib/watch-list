import { describe, expect, it } from "vitest";
import { describeGap, isGapWorthShowing } from "./last-visit";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("isGapWorthShowing", () => {
  it("says nothing on a first visit", () => {
    expect(isGapWorthShowing(null, NOW)).toBe(false);
  });

  it("stays quiet about a gap of minutes", () => {
    expect(isGapWorthShowing("2026-08-01T11:30:00.000Z", NOW)).toBe(false);
  });

  it("speaks up once the gap is most of a day", () => {
    expect(isGapWorthShowing("2026-07-31T12:00:00.000Z", NOW)).toBe(true);
  });

  it("ignores a timestamp it cannot read", () => {
    expect(isGapWorthShowing("not a date", NOW)).toBe(false);
  });
});

describe("describeGap", () => {
  it("uses the words a person would", () => {
    expect(describeGap("2026-08-01T09:00:00.000Z", NOW)).toBe("earlier today");
    expect(describeGap("2026-07-31T10:00:00.000Z", NOW)).toBe("yesterday");
    expect(describeGap("2026-07-29T10:00:00.000Z", NOW)).toBe("3 days ago");
    expect(describeGap("2026-07-25T10:00:00.000Z", NOW)).toBe("last week");
  });

  it("rounds to weeks and then to months", () => {
    expect(describeGap("2026-07-11T12:00:00.000Z", NOW)).toBe("3 weeks ago");
    expect(describeGap("2026-05-01T12:00:00.000Z", NOW)).toBe("3 months ago");
  });
});
