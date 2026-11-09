import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "../test/profile-locks";
import { restoreProfileRoster } from "../test/profile-restore";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE_ID,
  MAX_PROFILES,
  PROFILES_STORAGE_KEY,
  createProfile,
  deleteProfile,
  getActiveProfileId,
  getProfiles,
  inspectProfileSlot,
  renameProfile,
  readProfileSlot,
  sanitizeProfiles,
  subscribeProfiles,
  switchProfile,
  switchProfileWithResult,
} from "./profiles";
import { subscribeToCollections } from "./collections";
import { subscribeToGameState } from "./daily-game";
import { GOAL_STORAGE_KEY, getGoalSnapshot, subscribeToGoal } from "./goal";
import { subscribeToRatings } from "./ratings";
import { WATCHLIST_STORAGE_KEY, getWatchlist } from "./watchlist";
import { LEGACY_LAST_VISIT_STORAGE_KEY, readLastVisit } from "./last-visit";
import {
  PROFILE_STORAGE_OWNER_KEY,
  deletedProfileKey,
  getProfileStorageOwner,
  isProfileStorageOwnerAvailable,
  profileStoreKey,
  readProfileStore,
  withProfileStorage,
  writeProfileStore,
} from "./profile-storage";

/**
 * A localStorage good enough for these tests, with a seam for making one
 * particular write fail – which is the whole point of the switch tests below.
 */
class FakeStorage {
  private data = new Map<string, string>();
  /** Keys whose next `setItem` throws, as a quota failure would. */
  failOn = new Set<string>();
  byteLimit = Number.POSITIVE_INFINITY;

  get usedBytes(): number {
    return [...this.data].reduce(
      (total, [key, value]) => total + 2 * (key.length + value.length),
      0,
    );
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    const previousBytes = this.data.has(key)
      ? 2 * (key.length + this.data.get(key)!.length)
      : 0;
    const nextBytes =
      this.usedBytes - previousBytes + 2 * (key.length + value.length);
    if (this.failOn.has(key) || nextBytes > this.byteLimit) {
      throw new DOMException("QuotaExceededError");
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
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
  storage.setItem(PROFILE_STORAGE_OWNER_KEY, DEFAULT_PROFILE_ID);
  storage.setItem(WATCHLIST_STORAGE_KEY, '["mine"]');
  storage.setItem(GOAL_STORAGE_KEY, '{"year":"2026","target":52}');
  storage.setItem(
    "profile-data:p2",
    JSON.stringify({ [WATCHLIST_STORAGE_KEY]: '["theirs"]' }),
  );
}

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("switchProfile", () => {
  it("does not publish a refused pointer change or alter either profile's stores", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();
    storage.failOn.add(ACTIVE_PROFILE_STORAGE_KEY);
    const listener = vi.fn();
    const stop = [subscribeProfiles(listener), subscribeToRatings(listener),
      subscribeToCollections(listener), subscribeToGameState(listener), subscribeToGoal(listener)];

    expect(await switchProfileWithResult("p2")).toEqual({
      ok: false, key: ACTIVE_PROFILE_STORAGE_KEY, rolledBack: true,
    });
    expect(storage.snapshot()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
    stop.forEach((unsubscribe) => unsubscribe());
  });

  it("publishes the incoming goal to subscribers in this tab", async () => {
    seedTwoProfiles();
    const listener = vi.fn(() => getGoalSnapshot());
    const stop = subscribeToGoal(listener);

    expect(await switchProfile("p2")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toBeNull();
    stop();
  });

  it("changes only the active pointer and retains each profile's original stores", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();

    expect(await switchProfile("p2")).toBe(true);
    expect(getActiveProfileId()).toBe("p2");
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["mine"]');
    expect(storage.snapshot()).toEqual({ ...before, [ACTIVE_PROFILE_STORAGE_KEY]: "p2" });
  });

  it("switches large profiles without duplicating their data or consuming their quota", async () => {
    seedTwoProfiles();
    const large = JSON.stringify(Array.from({ length: 20 }, (_, index) => ({
      id: index + 1, title: "Title ".repeat(25), mediaType: "movie",
      posterPath: null, voteAverage: 5, releaseDate: "2026-01-01",
      addedAt: "2026-10-05T00:00:00.000Z",
    })));
    storage.setItem(WATCHLIST_STORAGE_KEY, large);
    storage.setItem("profile-data:p2", JSON.stringify({ [WATCHLIST_STORAGE_KEY]: large }));
    storage.byteLimit = storage.usedBytes;

    expect(await switchProfile("p2")).toBe(true);
    expect(getWatchlist()).toHaveLength(20);
    expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(getWatchlist()).toHaveLength(20);
    expect(storage.usedBytes).toBe(storage.byteLimit);
  });

  it("keeps the yearly goal with the profile that set it", async () => {
    seedTwoProfiles();
    expect(await switchProfile("p2")).toBe(true);
    expect(getGoalSnapshot()).toBeNull();
    expect(storage.getItem(GOAL_STORAGE_KEY)).toBe('{"year":"2026","target":52}');
    expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(getGoalSnapshot()).toEqual({ year: "2026", target: 52 });
  });

  it.each([
    ["an invalid slot value", JSON.stringify({ [WATCHLIST_STORAGE_KEY]: { not: "a string" } })],
    ["malformed slot JSON", "{not json"],
    ["malformed store JSON", JSON.stringify({ [WATCHLIST_STORAGE_KEY]: "[not json" })],
  ])("switches to a profile whose slot has %s and treats that store as the active profile would", async (_label, raw) => {
    seedTwoProfiles();
    storage.setItem("profile-data:p2", raw);
    const before = storage.snapshot();

    expect(await switchProfileWithResult("p2")).toEqual({ ok: true });

    // Only the pointer moved; the unreadable copy is still there to recover.
    expect(storage.snapshot()).toEqual({ ...before, [ACTIVE_PROFILE_STORAGE_KEY]: "p2" });
    // It renders empty, and an edit derived from that empty fallback is refused…
    expect(getWatchlist()).toEqual([]);
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["derived"]')).toThrow();
    expect(storage.getItem("profile-data:p2")).toBe(raw);
    // …while an explicit clear replaces it, leaving the older copy recoverable.
    writeProfileStore(WATCHLIST_STORAGE_KEY, null);
    expect(getWatchlist({ strict: true })).toEqual([]);
    expect(storage.getItem("profile-data:p2")).toBe(raw);
  });

  it("switches without reading the incoming profile's stores", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();
    const read = storage.getItem.bind(storage);
    vi.spyOn(storage, "getItem").mockImplementation((key) => {
      if (key === "profile-data:p2") throw new DOMException("Read denied", "SecurityError");
      return read(key);
    });

    expect(await switchProfile("p2")).toBe(true);
    expect(storage.snapshot()).toEqual({ ...before, [ACTIVE_PROFILE_STORAGE_KEY]: "p2" });
    vi.mocked(storage.getItem).mockRestore();
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
  });

  it("succeeds for the profile another tab already switched to, and tells this tab", async () => {
    seedTwoProfiles();
    // The other tab's switch has been saved; this tab has not heard about it.
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    const before = storage.snapshot();
    const listener = vi.fn();
    const stop = subscribeProfiles(listener);

    expect(await switchProfileWithResult("p2")).toEqual({ ok: true });
    expect(storage.snapshot()).toEqual(before);
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it("refuses to switch to a profile that does not exist", async () => {
    seedTwoProfiles();
    expect(await switchProfile("nope")).toBe(false);
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["mine"]');
  });

  it("can switch without writing or deleting either profile's stored data", async () => {
    seedTwoProfiles();
    storage.failOn.add(WATCHLIST_STORAGE_KEY);
    storage.failOn.add("profile-data:p2");
    const remove = vi.spyOn(storage, "removeItem");
    expect(await switchProfile("p2")).toBe(true);
    expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["mine"]');
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
  });

  it("keeps both sets of data when two tab switches interleave", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: DEFAULT_PROFILE_ID, name: "A" },
      { id: "p2", name: "B" },
      { id: "p3", name: "C" },
    ]));
    storage.setItem("profile-data:p3", JSON.stringify({ [WATCHLIST_STORAGE_KEY]: '["third"]' }));
    const before = storage.snapshot();
    const write = storage.setItem.bind(storage);
    let second: Promise<boolean> | undefined;
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      write(key, value);
      if (key === ACTIVE_PROFILE_STORAGE_KEY && value === "p2" && !second) {
        second = switchProfile("p3");
      }
    });

    expect(await switchProfile("p2")).toBe(true);
    expect(await second).toBe(true);
    expect(getActiveProfileId()).toBe("p3");
    expect(storage.snapshot()).toEqual({ ...before, [ACTIVE_PROFILE_STORAGE_KEY]: "p3" });
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
    expect(readProfileSlot("p3")[WATCHLIST_STORAGE_KEY]).toBe('["third"]');
    expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["mine"]');
  });

  it("preserves the current nondefault profile's live data on the first upgrade", async () => {
    seedTwoProfiles();
    storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    storage.setItem(WATCHLIST_STORAGE_KEY, '["current p2"]');
    storage.setItem("profile-data:default", JSON.stringify({ [WATCHLIST_STORAGE_KEY]: '["parked default"]' }));
    // An older implementation could leave the active profile's stale parked copy.
    storage.setItem("profile-data:p2", JSON.stringify({ [WATCHLIST_STORAGE_KEY]: '["stale p2"]' }));

    expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe("p2");
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["parked default"]');
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["current p2"]');
    expect(await switchProfile("p2")).toBe(true);
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["current p2"]');
  });

  it("refuses the first switch if stable legacy ownership cannot be recorded", async () => {
    seedTwoProfiles();
    storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
    storage.failOn.add(PROFILE_STORAGE_OWNER_KEY);
    const before = storage.snapshot();
    expect(await switchProfile("p2")).toBe(false);
    expect(storage.snapshot()).toEqual(before);
  });

  it.each(["", "x".repeat(65)])(
    "refuses a switch and strict backup read when the legacy owner marker is corrupt (%j)",
    async (marker) => {
      seedTwoProfiles();
      storage.setItem(PROFILE_STORAGE_OWNER_KEY, marker);
      const before = storage.snapshot();

      expect(await switchProfile("p2")).toBe(false);
      expect(() => readProfileSlot(DEFAULT_PROFILE_ID, { strict: true })).toThrow();
      expect(storage.snapshot()).toEqual(before);
    },
  );

  it("keeps a bound mutation attached to its owner when an older tab switches midway", () => {
    seedTwoProfiles();
    withProfileStorage(DEFAULT_PROFILE_ID, () => {
      const existing = JSON.parse(readProfileStore(WATCHLIST_STORAGE_KEY)!);
      storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
      writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify([...existing, "added to mine"]));
    });
    expect(getActiveProfileId()).toBe("p2");
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["mine","added to mine"]');
  });
});

describe("sanitizeProfiles", () => {
  it("keeps the list at the cap when the default profile has to be put back", () => {
    // A stored list that is full and has lost its default entry – corrupt
    // storage, or a hand edit. Repairing it used to return MAX_PROFILES + 1,
    // which let the UI's "one browser holds up to five" check be walked past.
    const full = Array.from({ length: MAX_PROFILES }, (_, index) => ({
      id: `p${index}`,
      name: `Person ${index}`,
    }));

    const repaired = sanitizeProfiles(full);

    expect(repaired).toHaveLength(MAX_PROFILES);
    expect(repaired[0].id).toBe(DEFAULT_PROFILE_ID);
  });

  it("leaves a list that already names the default profile alone", () => {
    const full = [
      { id: DEFAULT_PROFILE_ID, name: "Me" },
      ...Array.from({ length: MAX_PROFILES - 1 }, (_, index) => ({
        id: `p${index}`,
        name: `Person ${index}`,
      })),
    ];

    expect(sanitizeProfiles(full)).toHaveLength(MAX_PROFILES);
  });
});

describe("readProfileSlot", () => {
  it("exports canonical edits together with untouched parked stores", () => {
    seedTwoProfiles();
    storage.setItem("profile-data:p2", JSON.stringify({
      watchlist: '["parked list"]',
      [GOAL_STORAGE_KEY]: '{"year":"2026","target":52}',
    }));
    writeProfileStore(WATCHLIST_STORAGE_KEY, '["edited list"]', "p2");

    expect(readProfileSlot("p2", { strict: true })).toEqual({
      watchlist: '["edited list"]',
      [GOAL_STORAGE_KEY]: '{"year":"2026","target":52}',
    });
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
  });

  it("exports explicit clears without resurrecting a parked value", () => {
    seedTwoProfiles();
    writeProfileStore(WATCHLIST_STORAGE_KEY, null, "p2");
    expect(readProfileSlot("p2", { strict: true })).toEqual({});
  });

  it("rejects corrupt canonical JSON rather than exporting an empty store", () => {
    seedTwoProfiles();
    storage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"), "[not json");
    expect(() => readProfileSlot("p2", { strict: true })).toThrow();
  });

  it("reads a parked profile's stores without switching to it", () => {
    seedTwoProfiles();

    // The whole reason this exists: a backup has to see the profiles that are
    // not loaded, and switching to each one to read it would be absurd.
    expect(readProfileSlot("p2")).toEqual({
      [WATCHLIST_STORAGE_KEY]: '["theirs"]',
    });
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
  });

  it("is empty for a profile that has never been parked", () => {
    seedTwoProfiles();
    expect(readProfileSlot("never-seen")).toEqual({});
    expect(readProfileSlot("never-seen", { strict: true })).toEqual({});
  });

  it("ignores anything in a slot that a profile does not own", () => {
    seedTwoProfiles();
    storage.setItem(
      "profile-data:p2",
      JSON.stringify({
        [WATCHLIST_STORAGE_KEY]: '["theirs"]',
        [ACTIVE_PROFILE_STORAGE_KEY]: "p2",
        rubbish: 42,
      }),
    );

    expect(readProfileSlot("p2")).toEqual({
      [WATCHLIST_STORAGE_KEY]: '["theirs"]',
    });
  });

  it("survives a corrupt slot", () => {
    seedTwoProfiles();
    storage.setItem("profile-data:p2", "{not json");

    expect(readProfileSlot("p2")).toEqual({});
  });

  it.each(["", "{not json", "null", "[]", '{"watchlist":"[not json"}'])(
    "strict reads reject corrupt data instead of returning an empty profile (%s)",
    (raw) => {
      seedTwoProfiles();
      storage.setItem("profile-data:p2", raw);
      expect(() => readProfileSlot("p2", { strict: true })).toThrow();
      expect(storage.getItem("profile-data:p2")).toBe(raw);
    },
  );
});

describe("inspectProfileSlot", () => {
  it("keeps every readable store and the exact text of each unreadable one", () => {
    seedTwoProfiles();
    storage.setItem("profile-data:p2", JSON.stringify({
      [WATCHLIST_STORAGE_KEY]: '["theirs"]',
      [GOAL_STORAGE_KEY]: "{not json",
      ratings: { not: "a string" },
    }));

    expect(inspectProfileSlot("p2")).toEqual({
      slot: { [WATCHLIST_STORAGE_KEY]: '["theirs"]' },
      unreadable: { [GOAL_STORAGE_KEY]: "{not json", ratings: '{"not":"a string"}' },
    });
  });

  it("keeps a whole unparseable slot for each store that falls back to it", () => {
    seedTwoProfiles();
    writeProfileStore(WATCHLIST_STORAGE_KEY, '["edited"]', "p2");
    storage.setItem("profile-data:p2", "{not json");

    const { slot, unreadable } = inspectProfileSlot("p2");
    expect(slot).toEqual({ [WATCHLIST_STORAGE_KEY]: '["edited"]' });
    expect(Object.values(unreadable).every((raw) => raw === "{not json")).toBe(true);
    expect(unreadable).not.toHaveProperty(WATCHLIST_STORAGE_KEY);
  });

  it("reports a refused read without text to keep", () => {
    seedTwoProfiles();
    const read = storage.getItem.bind(storage);
    vi.spyOn(storage, "getItem").mockImplementation((key) => {
      if (key === "profile-data:p2") throw new DOMException("Read denied", "SecurityError");
      return read(key);
    });

    expect(inspectProfileSlot("p2").unreadable[WATCHLIST_STORAGE_KEY]).toBeNull();
  });
});

describe("a roster the app has to repair", () => {
  // Each of these used to resolve as an available owner while missing from
  // the list, so the switcher showed nobody active and every export failed.
  const sixth = { id: "p6", name: "Sixth" };
  const rosters: [string, { id: string; name: string }[], string][] = [
    ["an entry past the cap", [
      { id: DEFAULT_PROFILE_ID, name: "Me" }, { id: "p2", name: "Two" },
      { id: "p3", name: "Three" }, { id: "p4", name: "Four" }, { id: "p5", name: "Five" }, sixth,
    ], "p6"],
    ["an over-long id", [{ id: DEFAULT_PROFILE_ID, name: "Me" }, { id: "x".repeat(65), name: "Long" }], "x".repeat(65)],
    ["a zero-width name", [{ id: DEFAULT_PROFILE_ID, name: "Me" }, { id: "zw", name: "\u200b\u200b" }], "zw"],
  ];

  it.each(rosters)("neither lists nor reads and writes a profile with %s", async (_label, roster, id) => {
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(roster));
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, DEFAULT_PROFILE_ID);
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);

    expect(getProfiles().some((profile) => profile.id === id)).toBe(false);
    expect(isProfileStorageOwnerAvailable(id)).toBe(false);
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(getProfiles().map((profile) => profile.id)).toContain(getActiveProfileId());
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["late"]', id)).toThrow("removed");
  });

  it("keeps every profile it lists available", () => {
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(rosters[0][1]));
    for (const profile of getProfiles()) {
      expect(isProfileStorageOwnerAvailable(profile.id)).toBe(true);
    }
  });
});

describe("the last-visit stamp shared before profiles had their own", () => {
  it("is deleted with the original owner it belongs to", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, "p2");
    storage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, "2026-10-01T12:00:00.000Z");

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBeNull();
  });

  it("is kept when somebody else is deleted", async () => {
    seedTwoProfiles();
    storage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, "2026-10-01T12:00:00.000Z");

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBe("2026-10-01T12:00:00.000Z");
  });

  it("is replaced by a restore of its owner, which cannot fall back to it afterwards", async () => {
    seedTwoProfiles();
    storage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, "2026-10-01T12:00:00.000Z");

    expect(await restoreProfileRoster({ id: DEFAULT_PROFILE_ID, name: "Me" }, [])).toBe(true);
    expect(storage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBeNull();
    expect(readLastVisit(DEFAULT_PROFILE_ID)).toBeNull();
  });
});

describe("restoring the profile roster", () => {
  it("restores dormant stores at stable profile addresses and selects the incoming profile", async () => {
    seedTwoProfiles();
    expect(await restoreProfileRoster({ id: "p9", name: "Restored" }, [
      { profile: { id: "p8", name: "Also restored" },
        slot: { [WATCHLIST_STORAGE_KEY]: '["theirs, restored"]' } },
    ])).toBe(true);
    expect(getActiveProfileId()).toBe("p9");
    expect(readProfileSlot("p8")[WATCHLIST_STORAGE_KEY]).toBe('["theirs, restored"]');
    expect(getProfiles().map(({ id }) => id)).toEqual([DEFAULT_PROFILE_ID, "p9", "p8"]);
  });

  it("replaces dormant canonical data as well as old parked fallback data", async () => {
    seedTwoProfiles();
    writeProfileStore(WATCHLIST_STORAGE_KEY, '["newer than parked"]', "p2");
    expect(await restoreProfileRoster({ id: DEFAULT_PROFILE_ID, name: "Me" }, [
      { profile: { id: "p2", name: "Someone else" },
        slot: { [WATCHLIST_STORAGE_KEY]: '["restored"]' } },
    ])).toBe(true);
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["restored"]');
  });

  it("suppresses an old dormant store when the restored slot omitted it", async () => {
    seedTwoProfiles();
    storage.setItem("profile-data:p2", JSON.stringify({
      watchlist: '["old list"]', [GOAL_STORAGE_KEY]: '{"year":"2026","target":52}',
    }));
    writeProfileStore(GOAL_STORAGE_KEY, '{"year":"2026","target":12}', "p2");
    expect(await restoreProfileRoster({ id: DEFAULT_PROFILE_ID, name: "Me" }, [
      { profile: { id: "p2", name: "Someone else" }, slot: {} },
    ])).toBe(true);
    expect(readProfileSlot("p2")).toEqual({});
    expect(await switchProfile("p2")).toBe(true);
    expect(getGoalSnapshot()).toBeNull();
  });

  it("empties the implicit default profile when it was absent from the backup", async () => {
    seedTwoProfiles();
    storage.setItem("profile-data:default", JSON.stringify({ watchlist: '["older default"]' }));
    expect(await restoreProfileRoster({ id: "incoming", name: "Incoming" }, [])).toBe(true);
    expect(readProfileSlot(DEFAULT_PROFILE_ID)).toEqual({});
  });

  it("removes every representation of a profile absent from the restored roster", async () => {
    seedTwoProfiles();
    writeProfileStore(WATCHLIST_STORAGE_KEY, '["canonical p2"]', "p2");
    expect(await restoreProfileRoster({ id: DEFAULT_PROFILE_ID, name: "Me" }, [])).toBe(true);
    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(storage.getItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"))).toBeNull();
    expect(readProfileSlot("p2")).toEqual({});
    expect(getProfiles().map(({ id }) => id)).toEqual([DEFAULT_PROFILE_ID]);
  });

  it("leaves profile metadata and stores intact for a file that names no profile", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();
    expect(await restoreProfileRoster(null, [])).toBe(false);
    expect(storage.snapshot()).toEqual(before);
  });

  it("keeps the active profile and writes no data for profiles removed by the cap", async () => {
    seedTwoProfiles();
    const others = Array.from({ length: MAX_PROFILES + 2 }, (_, index) => ({
      profile: { id: `x${index}`, name: `Person ${index}` },
      slot: { [WATCHLIST_STORAGE_KEY]: `["list ${index}"]` },
    }));
    expect(await restoreProfileRoster({ id: "active-one", name: "Active" }, others)).toBe(true);
    const ids = getProfiles().map(({ id }) => id);
    expect(ids).toHaveLength(MAX_PROFILES);
    expect(ids).toContain("active-one");
    expect(getActiveProfileId()).toBe("active-one");
    for (const { profile, slot } of others) {
      expect(readProfileSlot(profile.id)).toEqual(ids.includes(profile.id) ? slot : {});
    }
  });

  it("does not let the active profile take a seat twice", async () => {
    seedTwoProfiles();
    expect(await restoreProfileRoster({ id: "active-one", name: "Active" }, [
      { profile: { id: "active-one", name: "Active again" }, slot: {} },
      { profile: { id: "x1", name: "Person 1" }, slot: {} },
    ])).toBe(true);
    expect(getProfiles().map(({ id }) => id)).toEqual([DEFAULT_PROFILE_ID, "active-one", "x1"]);
  });

  it.each([ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY, "profile-store:p8:watchlist"])(
    "preserves original metadata, parked data and canonical data when %s is refused",
    async (refusedKey) => {
      seedTwoProfiles();
      writeProfileStore(WATCHLIST_STORAGE_KEY, '["canonical p2"]', "p2");
      const before = storage.snapshot();
      storage.failOn.add(refusedKey);
      expect(await restoreProfileRoster({ id: "p9", name: "Restored" }, [
        { profile: { id: "p2", name: "Someone else" }, slot: { watchlist: '["replacement"]' } },
        { profile: { id: "p8", name: "Also restored" }, slot: { watchlist: '["replacement p8"]' } },
      ])).toBe(false);
      expect(storage.snapshot()).toEqual(before);
      expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["canonical p2"]');
    },
  );

  it("restores the exact original data when a replacement exceeds the available quota", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();
    storage.byteLimit = storage.usedBytes;
    expect(await restoreProfileRoster({ id: "incoming", name: "Incoming" }, [
      { profile: { id: "other", name: "Other" },
        slot: { [WATCHLIST_STORAGE_KEY]: JSON.stringify(["L".repeat(2000)]) } },
    ])).toBe(false);
    expect(storage.snapshot()).toEqual(before);
  });
});

describe("subscribeProfiles", () => {
  it("notifies after a restore with both the incoming roster and active id", async () => {
    seedTwoProfiles();
    const listener = vi.fn(() => ({
      active: getActiveProfileId(),
      ids: getProfiles().map(({ id }) => id),
    }));
    const unsubscribe = subscribeProfiles(listener);

    await restoreProfileRoster({ id: "p9", name: "Restored" }, []);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toEqual({
      active: "p9",
      ids: [DEFAULT_PROFILE_ID, "p9"],
    });
    unsubscribe();
    await renameProfile("p9", "Renamed");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refreshes profile storage changes from another tab and removes its listener", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProfiles(listener);
    const onStorage = vi.mocked(window.addEventListener).mock.calls[0][1] as (
      event: StorageEvent,
    ) => void;

    onStorage({ key: WATCHLIST_STORAGE_KEY } as StorageEvent);
    expect(listener).not.toHaveBeenCalled();
    for (const key of [PROFILES_STORAGE_KEY, ACTIVE_PROFILE_STORAGE_KEY, null]) {
      onStorage({ key } as StorageEvent);
    }
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    expect(window.removeEventListener).toHaveBeenCalledWith("storage", onStorage);
  });
});

describe("createProfile", () => {
  it("stores a name cut through an emoji so the roster stays editable", async () => {
    const cut = (await createProfile("a".repeat(23) + "😀"))!;
    expect(cut.name).toBe("a".repeat(23));

    expect(() => getProfiles({ strict: true })).not.toThrow();
    expect(await createProfile("Second")).not.toBeNull();
    expect(await renameProfile(cut.id, "b".repeat(23) + "😀")).toBe(true);
    expect(await deleteProfile(cut.id)).toBe(true);
  });

  it("adds a profile without switching to it", async () => {
    seedTwoProfiles();

    const created = await createProfile("Third");

    expect(created).not.toBeNull();
    expect(getProfiles().map((profile) => profile.name)).toContain("Third");
    // The new profile starts empty, and the live keys still belong to whoever
    // was active.
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["mine"]');
  });

  it("refuses a name that is blank once sanitised", async () => {
    seedTwoProfiles();

    expect(await createProfile("   ")).toBeNull();
    expect(await createProfile("\u0000")).toBeNull();
  });

  // The switcher identifies profiles by name, so duplicates make their separate
  // watchlists indistinguishable to the visitor.
  it("refuses a name another profile already has", async () => {
    seedTwoProfiles();

    expect(await createProfile("Someone else")).toBeNull();
    expect(getProfiles()).toHaveLength(2);
  });

  it("refuses a duplicate that differs only in case or spacing", async () => {
    seedTwoProfiles();

    expect(await createProfile("  someone   ELSE  ")).toBeNull();
    expect(getProfiles()).toHaveLength(2);
  });

  it("refuses to go past the cap", async () => {
    seedTwoProfiles();

    for (let i = getProfiles().length; i < MAX_PROFILES; i++) {
      expect(await createProfile(`Person ${i}`)).not.toBeNull();
    }

    expect(getProfiles()).toHaveLength(MAX_PROFILES);
    expect(await createProfile("One too many")).toBeNull();
  });
});

/** Reload the module graph so these are two tabs, not one module's own queue. */
async function independentProfileTabs() {
  vi.resetModules();
  const first = await import("./profiles");
  vi.resetModules();
  const second = await import("./profiles");
  expect(first.createProfile).not.toBe(second.createProfile);
  return [first, second] as const;
}

describe("profile roster writes in independent tabs", () => {
  it("reads only after acquiring the shared lock and retains both newly created profiles and their data", async () => {
    seedTwoProfiles();
    const [first, second] = await independentProfileTabs();
    let release!: () => void;
    let acquired!: () => void;
    const entered = new Promise<void>((resolve) => { acquired = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      acquired();
      return blocked;
    });
    await entered;
    const read = vi.spyOn(storage, "getItem");
    const pending = [first.createProfile("Alice"), second.createProfile("Bob")];
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();

    release();
    await holding;
    const created = await Promise.all(pending);
    expect(created.every((profile) => profile !== null)).toBe(true);
    expect(first.getProfiles().map((profile) => profile.name)).toEqual([
      "Me", "Someone else", "Alice", "Bob",
    ]);
    for (const profile of created) {
      writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify([profile!.name]), profile!.id);
      expect(second.readProfileSlot(profile!.id, { strict: true })[WATCHLIST_STORAGE_KEY])
        .toBe(JSON.stringify([profile!.name]));
    }
  });

  it("rechecks the cap and duplicate names inside the lock before reporting success", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      ...getProfiles(), { id: "p3", name: "Third" }, { id: "p4", name: "Fourth" },
    ]));
    const [first, second] = await independentProfileTabs();
    const capped = await Promise.all([first.createProfile("Alice"), second.createProfile("Bob")]);
    expect(capped.filter((profile) => profile !== null)).toHaveLength(1);
    expect(first.getProfiles()).toHaveLength(MAX_PROFILES);

    seedTwoProfiles();
    const duplicate = await Promise.all([
      first.createProfile("Alice"), second.createProfile(" ALICE "),
    ]);
    expect(duplicate.filter((profile) => profile !== null)).toHaveLength(1);
    expect(first.getProfiles()).toHaveLength(3);
  });

  it("keeps fallback ids unique across tab-local counters in the same millisecond", async () => {
    seedTwoProfiles();
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const [first, second] = await independentProfileTabs();
    const [alice, bob] = await Promise.all([
      first.createProfile("Alice"), second.createProfile("Bob"),
    ]);
    expect(alice).not.toBeNull();
    expect(bob).not.toBeNull();
    expect(alice!.id).not.toBe(bob!.id);
    expect(second.getProfiles({ strict: true })).toHaveLength(4);
  });

  it("preserves a concurrent create when another tab renames an existing profile", async () => {
    seedTwoProfiles();
    const [first, second] = await independentProfileTabs();
    const [renamed, created] = await Promise.all([
      first.renameProfile("p2", "Renamed"), second.createProfile("Third"),
    ]);
    expect(renamed).toBe(true);
    expect(created).not.toBeNull();
    expect(second.getProfiles().map((profile) => profile.name)).toEqual(["Me", "Renamed", "Third"]);
  });

  it("preserves a concurrent create and does not revive a deleted profile", async () => {
    seedTwoProfiles();
    const [first, second] = await independentProfileTabs();
    const [deleted, created] = await Promise.all([
      first.deleteProfile("p2"), second.createProfile("Third"),
    ]);
    expect(deleted).toBe(true);
    expect(created).not.toBeNull();
    expect(second.getProfiles().map((profile) => profile.name)).toEqual(["Me", "Third"]);
    expect(second.readProfileSlot("p2")).toEqual({});
    expect(await second.renameProfile("p2", "Revived")).toBe(false);
  });

  it("coordinates a profile restore with a concurrent create", async () => {
    seedTwoProfiles();
    const [first, second] = await independentProfileTabs();
    const [restored, created] = await Promise.all([
      restoreProfileRoster({ id: "default", name: "Restored default" }, [
        { profile: { id: "restored", name: "Restored" }, slot: { watchlist: '["restored list"]' } },
      ], first),
      second.createProfile("Third"),
    ]);
    expect(restored).toBe(true);
    expect(created).not.toBeNull();
    expect(second.getProfiles().map((profile) => profile.name)).toEqual(["Restored default", "Restored", "Third"]);
    expect(second.readProfileSlot("restored").watchlist).toBe('["restored list"]');
  });

  it("retains the current nondefault profile when deletion queues before a switch to its target", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      ...getProfiles(), { id: "p3", name: "Third" },
    ]));
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p3");
    const [first, second] = await independentProfileTabs();

    const [deleted, switched] = await Promise.all([
      first.deleteProfile("p2"), second.switchProfileWithResult("p2"),
    ]);

    expect(deleted).toBe(true);
    expect(switched).toEqual({ ok: false, key: null, rolledBack: true });
    expect(storage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p3");
    expect(second.getActiveProfileId()).toBe("p3");
  });

  it("refuses deletion of the profile selected by the switch queued before it", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      ...getProfiles(), { id: "p3", name: "Third" },
    ]));
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p3");
    const [first, second] = await independentProfileTabs();

    const [switched, deleted] = await Promise.all([
      first.switchProfileWithResult("p2"), second.deleteProfile("p2"),
    ]);

    expect(switched).toEqual({ ok: true });
    expect(deleted).toBe(false);
    expect(second.getActiveProfileId()).toBe("p2");
    expect(second.readProfileSlot("p2").watchlist).toBe('["theirs"]');
    expect(storage.getItem(deletedProfileKey("p2"))).toBeNull();
  });

  it("leaves the roster and personal data intact when browser locking is unavailable or refused", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();
    for (const locks of [undefined, { request: () => Promise.reject(new Error("Denied")) }]) {
      vi.stubGlobal("navigator", { locks });
      expect(await createProfile("Third")).toBeNull();
      expect(await renameProfile("p2", "Renamed")).toBe(false);
      expect(await deleteProfile("p2")).toBe(false);
      expect(await restoreProfileRoster({ id: "incoming", name: "Incoming" }, [])).toBe(false);
      expect(await switchProfileWithResult("p2")).toEqual({
        ok: false, key: PROFILES_STORAGE_KEY, rolledBack: true,
      });
      expect(storage.snapshot()).toEqual(before);
    }
  });

  it("refuses to replace an unreadable roster with a repaired roster", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, "{not JSON");
    const before = storage.snapshot();
    expect(await createProfile("Third")).toBeNull();
    expect(await renameProfile("p2", "Renamed")).toBe(false);
    expect(await deleteProfile("p2")).toBe(false);
    expect(storage.snapshot()).toEqual(before);
  });
});

describe("renameProfile", () => {
  it("renames a profile", async () => {
    seedTwoProfiles();

    expect(await renameProfile("p2", "Renamed")).toBe(true);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "Renamed",
    );
  });

  it("refuses to rename one profile onto another", async () => {
    seedTwoProfiles();

    expect(await renameProfile("p2", "Me")).toBe(false);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "Someone else",
    );
  });

  it("allows a profile to change its own capitalisation", async () => {
    // The duplicate check has to exclude the profile being renamed, or a
    // correction to your own name reads as a collision with yourself.
    seedTwoProfiles();

    expect(await renameProfile("p2", "SOMEONE ELSE")).toBe(true);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "SOMEONE ELSE",
    );
  });

  it("refuses a blank name", async () => {
    seedTwoProfiles();

    expect(await renameProfile("p2", "   ")).toBe(false);
  });
});

/**
 * What happens when the browser says no.
 *
 * Creation, rename and restore require the new roster to persist. Deletion
 * commits through its authoritative marker; cleaning the roster is optional.
 */
describe("a refused roster write", () => {
  it("reports a profile as not created", async () => {
    seedTwoProfiles();
    storage.failOn.add(PROFILES_STORAGE_KEY);

    expect(await createProfile("Third")).toBeNull();
    expect(getProfiles().map((profile) => profile.name)).not.toContain("Third");
  });

  it("reports a rename as not applied", async () => {
    seedTwoProfiles();
    storage.failOn.add(PROFILES_STORAGE_KEY);

    expect(await renameProfile("p2", "Renamed")).toBe(false);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "Someone else",
    );
  });

  it("publishes a committed deletion even when cleaning the roster is refused", async () => {
    seedTwoProfiles();
    const originalRoster = storage.getItem(PROFILES_STORAGE_KEY);
    const listener = vi.fn();
    const unsubscribe = subscribeProfiles(listener);
    storage.failOn.add(PROFILES_STORAGE_KEY);

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.getItem(PROFILES_STORAGE_KEY)).toBe(originalRoster);
    expect(storage.getItem(deletedProfileKey("p2"))).toBe("true");
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(readProfileSlot("p2")).toEqual({});
    expect(listener).toHaveBeenCalledOnce();
    expect(await switchProfile("p2")).toBe(false);
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["late write"]', "p2")).toThrow("removed");
    unsubscribe();
  });

  it("fails a restore rather than leaving names pointing at the wrong slots", async () => {
    seedTwoProfiles();
    storage.failOn.add(PROFILES_STORAGE_KEY);

    expect(
      await restoreProfileRoster({ id: "p9", name: "Restored" }, [
        {
          profile: { id: "p8", name: "Also restored" },
          slot: { [WATCHLIST_STORAGE_KEY]: '["restored"]' },
        },
      ]),
    ).toBe(false);

    // The roster never moved, so the active id must not have moved either.
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
    expect(storage.getItem("profile-data:p8")).toBeNull();
  });
});

describe("deleteProfile", () => {
  it("reports recovery when older code invalidates a saved pointer instead of claiming rollback", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      ...getProfiles(), { id: "p3", name: "Third" },
    ]));
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p3");
    const write = storage.setItem.bind(storage);
    let deleted = false;
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === ACTIVE_PROFILE_STORAGE_KEY && value === "p2" && !deleted) {
        deleted = true;
        // A separate tab can finish the deletion between the pointer's final
        // availability check and write. Simulate its committed tombstone here;
        // public deletion now queues asynchronously behind roster writers.
        write(deletedProfileKey("p2"), "true");
      }
      write(key, value);
    });

    expect(await switchProfileWithResult("p2")).toEqual({
      ok: false, key: ACTIVE_PROFILE_STORAGE_KEY, rolledBack: false,
    });
    // The late raw pointer is harmless even when its repair write is refused.
    storage.failOn.add(ACTIVE_PROFILE_STORAGE_KEY);
    expect(storage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p2");
    expect(getActiveProfileId({ strict: true })).toBe(DEFAULT_PROFILE_ID);
    expect(getProfileStorageOwner()).toBe(DEFAULT_PROFILE_ID);
    const roster = getProfiles({ strict: true });
    expect(roster.some((profile) => profile.id === getActiveProfileId({ strict: true }))).toBe(true);
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
    expect(() => withProfileStorage("p2", () =>
      writeProfileStore(WATCHLIST_STORAGE_KEY, '["late write"]'),
    )).toThrow("removed");
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["mine"]');
  });

  it("preserves a newer raw switch when the saved target becomes unavailable", async () => {
    seedTwoProfiles();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      ...getProfiles(), { id: "p3", name: "Third" },
    ]));
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p3");
    const write = storage.setItem.bind(storage);
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      write(key, value);
      if (key === ACTIVE_PROFILE_STORAGE_KEY && value === "p2") {
        write(deletedProfileKey("p2"), "true");
        write(ACTIVE_PROFILE_STORAGE_KEY, DEFAULT_PROFILE_ID);
      }
    });

    expect(await switchProfileWithResult("p2")).toEqual({
      ok: false, key: ACTIVE_PROFILE_STORAGE_KEY, rolledBack: false,
    });
    expect(storage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe(DEFAULT_PROFILE_ID);
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
  });

  it("does not revive a deleted owner when another tab writes its stale roster and pointer", async () => {
    seedTwoProfiles();
    const staleRoster = storage.getItem(PROFILES_STORAGE_KEY)!;
    expect(await deleteProfile("p2")).toBe(true);
    storage.setItem(PROFILES_STORAGE_KEY, staleRoster);
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");

    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(getActiveProfileId({ strict: true })).toBe(DEFAULT_PROFILE_ID);
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["revived"]', "p2")).toThrow("removed");
    expect(readProfileSlot("p2")).toEqual({});
  });

  it("commits through the shortened roster when only the deletion marker is refused", async () => {
    seedTwoProfiles();
    storage.failOn.add(deletedProfileKey("p2"));

    expect(await deleteProfile("p2")).toBe(true);
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(storage.getItem(deletedProfileKey("p2"))).toBeNull();
    expect(await switchProfile("p2")).toBe(false);
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["late write"]', "p2")).toThrow("removed");
  });

  it("keeps the profile and its only saved data when the marker and the shortened roster are both refused", async () => {
    seedTwoProfiles();
    const before = storage.snapshot();
    const write = storage.setItem.bind(storage);
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === deletedProfileKey("p2") || key === PROFILES_STORAGE_KEY) {
        throw new DOMException("Storage write refused", "QuotaExceededError");
      }
      write(key, value);
    });
    const listener = vi.fn();
    const unsubscribe = subscribeProfiles(listener);

    expect(await deleteProfile("p2")).toBe(false);
    expect(storage.snapshot()).toEqual(before);
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toContain("p2");
    expect(readProfileSlot("p2", { strict: true })[WATCHLIST_STORAGE_KEY]).toBe('["theirs"]');
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("frees space at full quota, then writes the deletion marker into the room it made", async () => {
    seedTwoProfiles();
    storage.byteLimit = storage.usedBytes;
    const used = storage.usedBytes;

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.usedBytes).toBeLessThan(used);
    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(storage.getItem(deletedProfileKey("p2"))).toBe("true");
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_ID]);
  });

  it("deletes at full quota even before the owner marker exists, and adds the marker afterwards", async () => {
    seedTwoProfiles();
    storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
    storage.byteLimit = storage.usedBytes;

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe(DEFAULT_PROFILE_ID);
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["mine"]');
  });

  it("clears a store at full quota even before the owner marker exists", () => {
    seedTwoProfiles();
    // Large enough that clearing it makes room for the marker as well.
    storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(Array(20).fill("a title")));
    storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
    storage.byteLimit = storage.usedBytes;

    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, null, DEFAULT_PROFILE_ID)).not.toThrow();
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe(DEFAULT_PROFILE_ID);
  });

  it("still refuses an ordinary edit at full quota before the owner marker exists", () => {
    seedTwoProfiles();
    storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
    storage.byteLimit = storage.usedBytes;

    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["more"]', DEFAULT_PROFILE_ID)).toThrow();
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["mine"]');
  });

  it("keeps a committed deletion authoritative when physical cleanup fails", async () => {
    seedTwoProfiles();
    storage.failOn.add(PROFILES_STORAGE_KEY);
    vi.spyOn(storage, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage removal refused", "SecurityError");
    });

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.getItem("profile-data:p2")).not.toBeNull();
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_ID]);
    expect(await switchProfile("p2")).toBe(false);
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["late write"]', "p2")).toThrow("removed");
  });

  it("permits a deleted profile to be explicitly restored after roster cleanup failed", async () => {
    seedTwoProfiles();
    storage.failOn.add(PROFILES_STORAGE_KEY);
    expect(await deleteProfile("p2")).toBe(true);
    storage.failOn.clear();
    expect(await restoreProfileRoster({ id: DEFAULT_PROFILE_ID, name: "Me" }, [
      { profile: { id: "p2", name: "Restored" }, slot: { watchlist: '["restored"]' } },
    ])).toBe(true);

    expect(storage.getItem(deletedProfileKey("p2"))).toBeNull();
    expect(await switchProfile("p2")).toBe(true);
    expect(readProfileSlot("p2")[WATCHLIST_STORAGE_KEY]).toBe('["restored"]');
    expect(() => writeProfileStore(WATCHLIST_STORAGE_KEY, '["edited restore"]', "p2")).not.toThrow();
  });

  it("deletes an upgraded nondefault legacy owner without deleting the default's stores", async () => {
    seedTwoProfiles();
    storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
    storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    storage.setItem(WATCHLIST_STORAGE_KEY, '["legacy p2"]');
    storage.setItem("profile-data:default", JSON.stringify({ watchlist: '["default fallback"]' }));
    expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    writeProfileStore(WATCHLIST_STORAGE_KEY, '["edited default"]', DEFAULT_PROFILE_ID);

    expect(await deleteProfile("p2")).toBe(true);
    expect(readProfileSlot("p2")).toEqual({});
    expect(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY]).toBe('["edited default"]');
    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe("p2");
  });

  it.each([false, true])(
    "can still switch after deleting an upgraded legacy owner (remaining cookie: %s)",
    async (remainingCookie) => {
      seedTwoProfiles();
      storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        ...getProfiles(), { id: "p3", name: "Third" },
      ]));
      storage.removeItem(PROFILE_STORAGE_OWNER_KEY);
      storage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
      storage.setItem(WATCHLIST_STORAGE_KEY, '["legacy p2"]');
      storage.setItem("profile-data:default", JSON.stringify({ watchlist: '["default fallback"]' }));
      expect(await switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
      expect(await deleteProfile("p2")).toBe(true);

      const cookie = remainingCookie
        ? `watchlist=${encodeURIComponent(JSON.stringify([{ id: 99, title: "Deleted owner's cookie", mediaType: "movie" }]))}`
        : "";
      vi.stubGlobal("document", {
        get cookie() { return cookie; },
        // A domain cookie can remain readable while a path cookie deletion is
        // refused. It still belongs to the removed owner and cannot block us.
        set cookie(_value: string) {},
      });

      expect(await switchProfileWithResult("p3")).toEqual({ ok: true });
      expect(getActiveProfileId()).toBe("p3");
      expect(readProfileSlot("p3")).toEqual({});
      expect(readProfileSlot(DEFAULT_PROFILE_ID).watchlist).toBe('["default fallback"]');
      expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
      expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe("p2");
    },
  );

  it("removes canonical edits as well as the parked fallback", async () => {
    seedTwoProfiles();
    writeProfileStore(WATCHLIST_STORAGE_KEY, '["edited p2"]', "p2");

    expect(await deleteProfile("p2")).toBe(true);
    expect(storage.getItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"))).toBeNull();
    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(readProfileSlot("p2")).toEqual({});
  });

  it("removes the profile and its parked data", async () => {
    seedTwoProfiles();

    expect(await deleteProfile("p2")).toBe(true);
    expect(getProfiles().map((profile) => profile.id)).not.toContain("p2");
    expect(readProfileSlot("p2")).toEqual({});
  });

  // The roster always retains its default profile.
  it("refuses the default profile", async () => {
    seedTwoProfiles();

    expect(await deleteProfile(DEFAULT_PROFILE_ID)).toBe(false);
    expect(getProfiles().map((profile) => profile.id)).toContain(
      DEFAULT_PROFILE_ID,
    );
  });

  it("refuses the active profile", async () => {
    seedTwoProfiles();
    expect(await switchProfile("p2")).toBe(true);

    expect(await deleteProfile("p2")).toBe(false);
    expect(getProfiles().map((profile) => profile.id)).toContain("p2");
  });
});
