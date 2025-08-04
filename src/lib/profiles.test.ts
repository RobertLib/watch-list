import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE_ID,
  MAX_PROFILES,
  PROFILES_STORAGE_KEY,
  createProfile,
  getActiveProfileId,
  getProfiles,
  renameProfile,
  readProfileSlot,
  restoreProfiles,
  sanitizeProfiles,
  switchProfile,
} from "./profiles";
import { GOAL_STORAGE_KEY } from "./goal";
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
  storage.setItem(GOAL_STORAGE_KEY, '{"year":"2026","target":52}');
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

  it("carries the yearly goal with the profile that set it", () => {
    seedTwoProfiles();

    expect(switchProfile("p2")).toBe(true);
    // p2 never set a target. Leaving the old one behind made the stats page
    // measure this person's year against somebody else's goal.
    expect(storage.getItem(GOAL_STORAGE_KEY)).toBeNull();

    expect(switchProfile(DEFAULT_PROFILE_ID)).toBe(true);
    expect(storage.getItem(GOAL_STORAGE_KEY)).toBe(
      '{"year":"2026","target":52}',
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
});

describe("restoreProfiles", () => {
  it("parks the other profiles and makes the backup's profile active", () => {
    seedTwoProfiles();

    const restored = restoreProfiles({ id: "p9", name: "Restored" }, [
      {
        profile: { id: "p8", name: "Also restored" },
        slot: { [WATCHLIST_STORAGE_KEY]: '["theirs, restored"]' },
      },
    ]);

    expect(restored).toBe(true);
    expect(getActiveProfileId()).toBe("p9");
    expect(storage.getItem("profile-data:p8")).toContain("theirs, restored");
    expect(getProfiles().map((profile) => profile.id)).toContain("p9");
    expect(getProfiles().map((profile) => profile.id)).toContain("p8");
  });

  it("clears the slot of a profile the backup does not have", () => {
    seedTwoProfiles();

    // p2 is not in the backup, so its parked watchlist must not survive as data
    // under an id nothing points at any more.
    restoreProfiles({ id: DEFAULT_PROFILE_ID, name: "Me" }, []);

    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(getProfiles().map((profile) => profile.id)).toEqual([
      DEFAULT_PROFILE_ID,
    ]);
  });

  it("keeps a slot the backup still names", () => {
    seedTwoProfiles();

    restoreProfiles({ id: DEFAULT_PROFILE_ID, name: "Me" }, [
      {
        profile: { id: "p2", name: "Someone else" },
        slot: { [WATCHLIST_STORAGE_KEY]: '["theirs, restored"]' },
      },
    ]);

    expect(storage.getItem("profile-data:p2")).toContain("theirs, restored");
  });

  it("leaves the roster alone for a file that names no profile", () => {
    seedTwoProfiles();

    // A version 1 or 2 backup carries one set of stores and no claim about
    // whose they are. It replaces the live keys and nothing else.
    expect(restoreProfiles(null, [])).toBe(false);
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(getProfiles().map((profile) => profile.id)).toEqual([
      DEFAULT_PROFILE_ID,
      "p2",
    ]);
    expect(storage.getItem("profile-data:p2")).toContain("theirs");
  });

  it("keeps the active profile when the file is over the cap", () => {
    seedTwoProfiles();

    const others = Array.from({ length: MAX_PROFILES + 2 }, (_, i) => ({
      profile: { id: `x${i}`, name: `Person ${i}` },
      slot: {},
    }));

    restoreProfiles({ id: "active-one", name: "Active" }, others);

    const ids = getProfiles().map((profile) => profile.id);
    expect(ids).toHaveLength(MAX_PROFILES);
    expect(ids).toContain("active-one");
    expect(getActiveProfileId()).toBe("active-one");
  });
});

describe("createProfile", () => {
  it("adds a profile without switching to it", () => {
    seedTwoProfiles();

    const created = createProfile("Third");

    expect(created).not.toBeNull();
    expect(getProfiles().map((profile) => profile.name)).toContain("Third");
    // The new profile starts empty, and the live keys still belong to whoever
    // was active.
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe('["mine"]');
  });

  it("refuses a name that is blank once sanitised", () => {
    seedTwoProfiles();

    expect(createProfile("   ")).toBeNull();
    expect(createProfile("\u0000")).toBeNull();
  });

  // A name is all the switcher shows, so two profiles sharing one are two
  // indistinguishable rows over two different watchlists – and picking the
  // wrong one parks your data under the other person's id.
  it("refuses a name another profile already has", () => {
    seedTwoProfiles();

    expect(createProfile("Someone else")).toBeNull();
    expect(getProfiles()).toHaveLength(2);
  });

  it("refuses a duplicate that differs only in case or spacing", () => {
    seedTwoProfiles();

    expect(createProfile("  someone   ELSE  ")).toBeNull();
    expect(getProfiles()).toHaveLength(2);
  });

  it("refuses to go past the cap", () => {
    seedTwoProfiles();

    for (let i = getProfiles().length; i < MAX_PROFILES; i++) {
      expect(createProfile(`Person ${i}`)).not.toBeNull();
    }

    expect(getProfiles()).toHaveLength(MAX_PROFILES);
    expect(createProfile("One too many")).toBeNull();
  });
});

describe("renameProfile", () => {
  it("renames a profile", () => {
    seedTwoProfiles();

    expect(renameProfile("p2", "Renamed")).toBe(true);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "Renamed",
    );
  });

  it("refuses to rename one profile onto another", () => {
    seedTwoProfiles();

    expect(renameProfile("p2", "Me")).toBe(false);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "Someone else",
    );
  });

  it("allows a profile to change its own capitalisation", () => {
    // The duplicate check has to exclude the profile being renamed, or a
    // correction to your own name reads as a collision with yourself.
    seedTwoProfiles();

    expect(renameProfile("p2", "SOMEONE ELSE")).toBe(true);
    expect(getProfiles().find((profile) => profile.id === "p2")?.name).toBe(
      "SOMEONE ELSE",
    );
  });

  it("refuses a blank name", () => {
    seedTwoProfiles();

    expect(renameProfile("p2", "   ")).toBe(false);
  });
});
