import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "../test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import {
  deletedProfileKey,
  PROFILE_STORAGE_OWNER_KEY,
  profileStoreKey,
} from "./profile-storage";
import {
  beginVisit,
  completeVisit,
  describeGap,
  isGapWorthShowing,
  LAST_VISIT_STORAGE_KEY,
  LEGACY_LAST_VISIT_STORAGE_KEY,
  PREVIOUS_VISIT_SESSION_KEY,
  readLastVisit,
  SESSION_MARKER_KEY,
  VISIT_STARTED_SESSION_KEY,
  visitSessionKey,
} from "./last-visit";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const YESTERDAY = "2026-07-31T12:00:00.000Z";
/** The default profile, which owns the live keys in a browser that never switched. */
const ME = "default";

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

/** The default profile's stamp, as its own store writes it. */
function saveStamp(stamp: string) {
  localStorage.setItem(LAST_VISIT_STORAGE_KEY, JSON.stringify(stamp));
}

function storedStamp(): string | null {
  const raw = localStorage.getItem(LAST_VISIT_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

function seedHousehold() {
  localStorage.setItem("profiles", JSON.stringify([
    { id: ME, name: "Alice" }, { id: "bob", name: "Bob" },
  ]));
  localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, ME);
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
    saveStamp(YESTERDAY);

    expect(beginVisit(ME, NOW)).toEqual({ profileId: ME, previous: YESTERDAY, startedAt: NOW.toISOString() });
    expect(storedStamp()).toBe(YESTERDAY);
    expect(sessionStorage.getItem(visitSessionKey(PREVIOUS_VISIT_SESSION_KEY, ME))).toBe(YESTERDAY);
    expect(sessionStorage.getItem(visitSessionKey(VISIT_STARTED_SESSION_KEY, ME))).toBe(NOW.toISOString());
    expect(sessionStorage.getItem(visitSessionKey(SESSION_MARKER_KEY, ME))).toBe("1");
  });

  it("reports a first visit as one", () => {
    expect(beginVisit(ME, NOW)).toEqual({ profileId: ME, previous: null, startedAt: NOW.toISOString() });
    expect(storedStamp()).toBeNull();
  });

  it("retains an unchecked interval when the visitor returns in a new session", () => {
    saveStamp(YESTERDAY);
    beginVisit(ME, NOW);
    startNewSession();
    const later = new Date(NOW.getTime() + 86_400_000);

    expect(beginVisit(ME, later)).toEqual({ profileId: ME, previous: YESTERDAY, startedAt: later.toISOString() });
    expect(storedStamp()).toBe(YESTERDAY);
  });

  it("keeps the same interval on remount after a successful lookup", async () => {
    saveStamp(YESTERDAY);
    const visit = beginVisit(ME, NOW);
    expect(await completeVisit(visit)).toBe(true);

    expect(beginVisit(ME, new Date(NOW.getTime() + 60_000))).toEqual(visit);
    expect(beginVisit(ME, new Date(NOW.getTime() + 3_600_000))).toEqual(visit);
    expect(storedStamp()).toBe(NOW.toISOString());
  });

  it("keeps a first visit a first visit for the whole session after completion", async () => {
    const visit = beginVisit(ME, NOW);
    expect(await completeVisit(visit)).toBe(true);

    expect(beginVisit(ME, new Date(NOW.getTime() + 60_000))).toEqual(visit);
    expect(visit.previous).toBeNull();
  });

  it("returns the captured interval even when session storage refuses the write", () => {
    saveStamp(YESTERDAY);
    sessionStorage.refuseWrites = true;

    expect(beginVisit(ME, NOW)).toEqual({ profileId: ME, previous: YESTERDAY, startedAt: NOW.toISOString() });
    expect(storedStamp()).toBe(YESTERDAY);
  });

  it("ignores a stored stamp it cannot read", () => {
    saveStamp("not a date");
    expect(beginVisit(ME, NOW).previous).toBeNull();

    startNewSession();
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, "{not json");
    expect(beginVisit(ME, NOW).previous).toBeNull();
  });

  it("keeps a separate session interval for each profile", async () => {
    seedHousehold();
    saveStamp(YESTERDAY);
    const alice = beginVisit(ME, NOW);
    expect(await completeVisit(alice)).toBe(true);

    // A switch reloads into the same session. Bob must not inherit Alice's
    // stashed interval, and Alice must get hers back after switching again.
    const later = new Date(NOW.getTime() + 60_000);
    expect(beginVisit("bob", later)).toEqual({ profileId: "bob", previous: null, startedAt: later.toISOString() });
    expect(beginVisit(ME, later)).toEqual(alice);
  });
});

describe("completeVisit", () => {
  it("preserves an old interval when a refused initial read becomes readable", async () => {
    saveStamp(YESTERDAY);
    localStorage.refuseReads = true;
    const visit = beginVisit(ME, NOW);
    expect(visit.previous).toBeNull();
    localStorage.refuseReads = false;

    expect(await completeVisit(visit)).toBe(false);
    expect(storedStamp()).toBe(YESTERDAY);
    startNewSession();
    expect(beginVisit(ME, NOW).previous).toBe(YESTERDAY);
  });

  it("acknowledges a successful lookup at its captured start time", async () => {
    saveStamp(YESTERDAY);
    const visit = beginVisit(ME, NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(storedStamp()).toBe(NOW.toISOString());
    startNewSession();
    expect(beginVisit(ME, new Date(NOW.getTime() + 86_400_000)).previous).toBe(NOW.toISOString());
  });

  it("initializes the baseline after a first visit with nothing to check", async () => {
    const visit = beginVisit(ME, NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(storedStamp()).toBe(NOW.toISOString());
  });

  it("replaces a stamp that cannot be read, as the first visit it was treated as", async () => {
    localStorage.setItem(LAST_VISIT_STORAGE_KEY, "{not json");
    const visit = beginVisit(ME, NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(storedStamp()).toBe(NOW.toISOString());
  });

  it("does not advance repeatedly after the same session is remounted", async () => {
    const visit = beginVisit(ME, NOW);
    expect(await completeVisit(visit)).toBe(true);
    const write = vi.spyOn(localStorage, "setItem");

    expect(await completeVisit(beginVisit(ME, new Date(NOW.getTime() + 3_600_000)))).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(storedStamp()).toBe(NOW.toISOString());
  });

  it("retains the old interval across sessions when persistent storage refuses completion", async () => {
    saveStamp(YESTERDAY);
    const visit = beginVisit(ME, NOW);
    localStorage.refuseWrites = true;

    expect(await completeVisit(visit)).toBe(false);
    expect(storedStamp()).toBe(YESTERDAY);
    startNewSession();
    localStorage.refuseWrites = false;
    expect(beginVisit(ME, new Date(NOW.getTime() + 86_400_000)).previous).toBe(YESTERDAY);
  });

  it("can complete the returned descriptor when only session storage refuses writes", async () => {
    saveStamp(YESTERDAY);
    sessionStorage.refuseWrites = true;
    const visit = beginVisit(ME, NOW);

    expect(await completeVisit(visit)).toBe(true);
    expect(storedStamp()).toBe(NOW.toISOString());
  });

  it("does not rewind a later tab's completed visit when an earlier lookup finishes last", async () => {
    saveStamp(YESTERDAY);
    const earlier = beginVisit(ME, NOW);
    startNewSession();
    const later = beginVisit(ME, new Date(NOW.getTime() + 3_600_000));

    expect(await completeVisit(later)).toBe(true);
    expect(await completeVisit(earlier)).toBe(true);
    expect(storedStamp()).toBe(later.startedAt);
  });

  it("rechecks the request guard after waiting for another writer's lock", async () => {
    saveStamp(YESTERDAY);
    const visit = beginVisit(ME, NOW);
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
    expect(storedStamp()).toBe(YESTERDAY);
  });

  it("acknowledges only the profile whose interval was checked", async () => {
    seedHousehold();
    const monday = "2026-07-27T12:00:00.000Z";
    saveStamp(monday);

    // Bob follows nothing, so his first visit completes at once – for him.
    expect(await completeVisit(beginVisit("bob", NOW))).toBe(true);

    expect(readLastVisit("bob")).toBe(NOW.toISOString());
    expect(localStorage.getItem(profileStoreKey(LAST_VISIT_STORAGE_KEY, "bob"))).toBe(JSON.stringify(NOW.toISOString()));
    expect(storedStamp()).toBe(monday);
    startNewSession();
    expect(beginVisit(ME, new Date(NOW.getTime() + 86_400_000)).previous).toBe(monday);
  });

  it("refuses to write a removed profile's stamp", async () => {
    seedHousehold();
    const visit = beginVisit("bob", NOW);
    localStorage.setItem(deletedProfileKey("bob"), "true");

    expect(await completeVisit(visit)).toBe(false);
    expect(localStorage.getItem(profileStoreKey(LAST_VISIT_STORAGE_KEY, "bob"))).toBeNull();
  });
});

describe("the stamp shared before profiles had their own", () => {
  it("belongs to the original owner and to nobody else", () => {
    seedHousehold();
    localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(beginVisit(ME, NOW).previous).toBe(YESTERDAY);
    expect(beginVisit("bob", NOW).previous).toBeNull();
  });

  it("follows the original owner even when that is not the default profile", () => {
    seedHousehold();
    localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "bob");
    localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(readLastVisit("bob")).toBe(YESTERDAY);
    expect(readLastVisit(ME)).toBeNull();
  });

  it("is replaced by the owner's own stamp in the same transaction", async () => {
    seedHousehold();
    localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(await completeVisit(beginVisit(ME, NOW))).toBe(true);

    expect(storedStamp()).toBe(NOW.toISOString());
    expect(localStorage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it("is left alone by another profile's completion", async () => {
    seedHousehold();
    localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, YESTERDAY);

    expect(await completeVisit(beginVisit("bob", NOW))).toBe(true);

    expect(localStorage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
    expect(readLastVisit(ME)).toBe(YESTERDAY);
  });

  it("survives a refused completion so the interval can be retried", async () => {
    seedHousehold();
    localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, YESTERDAY);
    const visit = beginVisit(ME, NOW);
    localStorage.refuseWrites = true;

    expect(await completeVisit(visit)).toBe(false);
    localStorage.refuseWrites = false;
    expect(localStorage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBe(YESTERDAY);
    expect(storedStamp()).toBeNull();
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
