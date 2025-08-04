import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "../test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import {
  beginVisit,
  completeVisit,
  describeGap,
  isGapWorthShowing,
  LAST_VISIT_STORAGE_KEY,
  PREVIOUS_VISIT_SESSION_KEY,
  SESSION_MARKER_KEY,
  VISIT_STARTED_SESSION_KEY,
} from "./last-visit";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const YESTERDAY = "2026-07-31T12:00:00.000Z";

/** A storage that remembers, with a switch for refusing every write. */
class FakeStorage {
  private data = new Map<string, string>();
  refuseWrites = false;
  refuseReads = false;

  getItem(key: string): string | null {
    if (this.refuseReads) throw new DOMException("SecurityError");
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
let locks: ReturnType<typeof createProfileLockManager>;

function startNewSession() {
  sessionStorage = new FakeStorage();
  vi.stubGlobal("window", { localStorage, sessionStorage });
}

beforeEach(() => {
  localStorage = new FakeStorage();
  startNewSession();
  locks = createProfileLockManager();
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("indexedDB", undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("beginVisit", () => {
  it("captures the previous visit without acknowledging unchecked releases", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(beginVisit(NOW)).toEqual({ previous: YESTERDAY, startedAt: NOW.toISOString() });
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
    expect(sessionStorage.getItem(PREVIOUS_VISIT_SESSION_KEY)).toBe(YESTERDAY);
    expect(sessionStorage.getItem(VISIT_STARTED_SESSION_KEY)).toBe(NOW.toISOString());
    expect(sessionStorage.getItem(SESSION_MARKER_KEY)).toBe("1");
  });

  it("reports a first visit as one", () => {
    expect(beginVisit(NOW)).toEqual({ previous: null, startedAt: NOW.toISOString() });
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it("retains an unchecked interval when the visitor returns in a new session", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    beginVisit(NOW);
    startNewSession();
    const later = new Date(NOW.getTime() + 86_400_000);

    expect(beginVisit(later)).toEqual({ previous: YESTERDAY, startedAt: later.toISOString() });
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
  });

  it("keeps the same interval on remount after a successful lookup", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    const visit = beginVisit(NOW);
    expect(await completeVisit(visit)).toBe(true);

    expect(beginVisit(new Date(NOW.getTime() + 60_000))).toEqual(visit);
    expect(beginVisit(new Date(NOW.getTime() + 3_600_000))).toEqual(visit);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("keeps a first visit a first visit for the whole session after completion", async () => {
    const visit = beginVisit(NOW);
    expect(await completeVisit(visit)).toBe(true);

    expect(beginVisit(new Date(NOW.getTime() + 60_000))).toEqual(visit);
    expect(visit.previous).toBeNull();
  });

  it("returns the captured interval even when session storage refuses the write", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    sessionStorage.refuseWrites = true;

    expect(beginVisit(NOW)).toEqual({ previous: YESTERDAY, startedAt: NOW.toISOString() });
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
  });

  it("ignores a stored stamp it cannot read", () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, "not a date");

    expect(beginVisit(NOW).previous).toBeNull();
  });
});

describe("completeVisit", () => {
  it("preserves an old interval when a refused initial read becomes readable", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    localStorage.refuseReads = true;
    const visit = beginVisit(NOW);
    expect(visit.previous).toBeNull();
    localStorage.refuseReads = false;

    expect(await completeVisit(visit)).toBe(false);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
    startNewSession();
    expect(beginVisit(NOW).previous).toBe(YESTERDAY);
  });

  it("acknowledges a successful lookup at its captured start time", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    const visit = beginVisit(NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
    startNewSession();
    expect(beginVisit(new Date(NOW.getTime() + 86_400_000)).previous).toBe(NOW.toISOString());
  });

  it("initializes the baseline after a first visit with nothing to check", async () => {
    const visit = beginVisit(NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("does not advance repeatedly after the same session is remounted", async () => {
    const visit = beginVisit(NOW);
    expect(await completeVisit(visit)).toBe(true);
    const write = vi.spyOn(localStorage, "setItem");

    expect(await completeVisit(beginVisit(new Date(NOW.getTime() + 3_600_000)))).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("retains the old interval across sessions when persistent storage refuses completion", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    const visit = beginVisit(NOW);
    localStorage.refuseWrites = true;

    expect(await completeVisit(visit)).toBe(false);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
    startNewSession();
    expect(beginVisit(new Date(NOW.getTime() + 86_400_000)).previous).toBe(YESTERDAY);
  });

  it("can complete the returned descriptor when only session storage refuses writes", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    sessionStorage.refuseWrites = true;
    const visit = beginVisit(NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(NOW.toISOString());
  });

  it("does not rewind a later tab's completed visit when an earlier lookup finishes last", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    const earlier = beginVisit(NOW);
    startNewSession();
    const later = beginVisit(new Date(NOW.getTime() + 3_600_000));

    expect(await completeVisit(later)).toBe(true);
    expect(await completeVisit(earlier)).toBe(true);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(later.startedAt);
  });

  it("rechecks the request guard after waiting for another writer's lock", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, YESTERDAY);
    const visit = beginVisit(NOW);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const blocker = locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => {
      entered();
      return gate;
    });
    await started;
    let current = true;
    const completion = completeVisit(visit, () => current);
    current = false;
    release();

    await blocker;
    expect(await completion).toBe(false);
    expect(localStorage.getItem(LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
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
