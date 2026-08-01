import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE_ID,
  PROFILES_STORAGE_KEY,
  getActiveProfileId,
  switchProfile,
} from "./profiles";
import { WATCHLIST_STORAGE_KEY } from "./watchlist";

/**
 * A localStorage good enough for these tests, with a seam for making one
 * particular write fail – which is the whole point of the switch tests below.
 */
class FakeStorage {
  private data = new Map<string, string>();
  /** Keys whose next `setItem` throws, as a quota failure would. */
  failOn = new Set<string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.failOn.has(key)) {
      throw new DOMException("QuotaExceededError");
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

let storage: FakeStorage;

/** Two profiles, "default" active, each with a watchlist of its own. */
function seedTwoProfiles() {
  storage.setItem(
    PROFILES_STORAGE_KEY,
    JSON.stringify([
      { id: DEFAULT_PROFILE_ID, name: "Me" },
      { id: "p2", name: "Someone else" },
    ]),
  );
  storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, DEFAULT_PROFILE_ID);
  storage.setItem(WATCHLIST_STORAGE_KEY, '["mine"]');
  storage.setItem(
    "profile-data:p2",
    JSON.stringify({ [WATCHLIST_STORAGE_KEY]: '["theirs"]' }),
  );
}

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("switchProfile", () => {
  it("swaps the live data and records the new profile", () => {
    seedTwoProfiles();

    expect(switchProfile("p2")).toBe(true);
    expect(getActiveProfileId()).toBe("p2");
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["theirs"]');
    // The outgoing profile's data is parked, not lost.
    expect(storage.getItem(`profile-data:${DEFAULT_PROFILE_ID}`)).toContain(
      "mine",
    );
  });

  it("refuses to switch to a profile that does not exist", () => {
    seedTwoProfiles();

    expect(switchProfile("nope")).toBe(false);
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["mine"]');
  });

  it("leaves the id and the data agreeing when recording the switch fails", () => {
    seedTwoProfiles();
    storage.failOn.add(ACTIVE_PROFILE_STORAGE_KEY);

    expect(switchProfile("p2")).toBe(false);

    // Nothing moved: the outgoing profile is still active and still on screen.
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["mine"]');
  });

  it("rolls the id back when the data cannot be loaded", () => {
    seedTwoProfiles();
    // The switch writes the id, then the incoming watchlist. Fail the second.
    storage.failOn.add(WATCHLIST_STORAGE_KEY);

    expect(switchProfile("p2")).toBe(false);

    // The critical invariant: the active id must never name a profile whose data
    // is not the data in the live keys, or the next switch parks one person's
    // watchlist into the other's slot.
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
  });

  it("does not park one profile's data into another's slot after a failure", () => {
    seedTwoProfiles();
    storage.failOn.add(ACTIVE_PROFILE_STORAGE_KEY);
    switchProfile("p2");
    storage.failOn.clear();

    // A second, working switch must not carry the first failure forward.
    expect(switchProfile("p2")).toBe(true);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["theirs"]');
    expect(storage.getItem(`profile-data:${DEFAULT_PROFILE_ID}`)).toContain(
      "mine",
    );
    expect(storage.getItem(`profile-data:${DEFAULT_PROFILE_ID}`)).not.toContain(
      "theirs",
    );
  });
});
