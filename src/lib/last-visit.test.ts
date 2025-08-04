import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeGap,
  isGapWorthShowing,
  LAST_VISIT_STORAGE_KEY,
  recordVisit,
  SESSION_MARKER_KEY,
} from "./last-visit";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const YESTERDAY = "2026-07-31T12:00:00.000Z";

/** A storage that remembers, with a switch for refusing every write. */
class FakeStorage {
  private data = new Map<string, string>();
  refuseWrites = false;

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.refuseWrites) throw new DOMException("QuotaExceededError");
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

let localStorage: FakeStorage;
let sessionStorage: FakeStorage;

beforeEach(() => {
  localStorage = new FakeStorage();
  sessionStorage = new FakeStorage();
  vi.stubGlobal("window", { localStorage, sessionStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordVisit", () => {
  it("stamps the visit and hands back the previous one", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(recordVisit(NOW)).toBe(YESTERDAY);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
    expect(sessionStorage.getItem(SESSION_MARKER_KEY)).toBe("1");
  });

  it("reports a first visit as one", () => {
    expect(recordVisit(NOW)).toBeNull();
  });

  /**
   * The regression. The first call overwrites the stored stamp, so a second
   * call that re-read it got this session's own stamp back – minutes old at
   * most, which read as "nothing to say" – and the welcome-back strip vanished
   * the moment someone navigated away from the home page and returned.
   */
  it("keeps answering with the visit before this session on later calls", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(recordVisit(NOW)).toBe(YESTERDAY);
    expect(recordVisit(new Date(NOW.getTime() + 60_000))).toBe(YESTERDAY);
    expect(recordVisit(new Date(NOW.getTime() + 3_600_000))).toBe(YESTERDAY);
  });

  it("keeps a first visit a first visit for the whole session", () => {
    expect(recordVisit(NOW)).toBeNull();
    expect(recordVisit(new Date(NOW.getTime() + 60_000))).toBeNull();
  });

  it("does not move the stamp forward on later calls", () => {
    recordVisit(NOW);
    recordVisit(new Date(NOW.getTime() + 3_600_000));

    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("still hands back the previous visit when storage refuses the write", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    localStorage.refuseWrites = true;
    sessionStorage.refuseWrites = true;

    expect(recordVisit(NOW)).toBe(YESTERDAY);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
  });

  it("ignores a stored stamp it cannot read", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, "not a date");

    expect(recordVisit(NOW)).toBeNull();
  });
});

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
