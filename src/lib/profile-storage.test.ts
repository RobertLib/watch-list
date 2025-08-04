import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_STORAGE_OWNER_KEY,
  deletedProfileKey,
  getProfileStorageOwner,
  initializeProfileStorage,
  isProfileStoreEvent,
  profileStoreChanges,
  profileStoreKey,
  publishProfileStorageChange,
  readProfileStore,
  withProfileStorage,
  writeProfileStore,
} from "./profile-storage";
import { applyStorageTransaction } from "./storage-transaction";

class MemoryStorage {
  private values = new Map<string, string>();
  refuse = new Set<string>();
  byteLimit = Number.POSITIVE_INFINITY;

  get usedBytes(): number {
    return [...this.values].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const previous = this.values.get(key);
    const previousBytes = previous === undefined ? 0 : 2 * (key.length + previous.length);
    if (this.refuse.has(key) || this.usedBytes - previousBytes + 2 * (key.length + value.length) > this.byteLimit) {
      throw new DOMException("QuotaExceededError");
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.values);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("stable profile storage ownership", () => {
  it("preserves legacy stores for the initially active nondefault profile", () => {
    storage.setItem("active-profile", "p2");
    storage.setItem("watchlist", '["live p2"]');
    storage.setItem("profile-data:p2", JSON.stringify({ watchlist: '["stale p2"]' }));
    storage.setItem("profile-data:default", JSON.stringify({ watchlist: '["parked default"]' }));

    initializeProfileStorage();
    storage.setItem("active-profile", "default");

    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe("p2");
    expect(readProfileStore("watchlist", "p2")).toBe('["live p2"]');
    expect(readProfileStore("watchlist", "default")).toBe('["parked default"]');
    expect(profileStoreKey("watchlist", "p2")).toBe("watchlist");
    expect(profileStoreKey("watchlist", "default")).not.toBe("watchlist");
  });

  it("keeps the original owner after later pointer changes and initialization attempts", () => {
    initializeProfileStorage();
    storage.setItem("active-profile", "p2");
    initializeProfileStorage();
    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe("default");
  });

  it("honors a competing initializer before recording a newly observed active owner", () => {
    const read = storage.getItem.bind(storage);
    let competing = false;
    vi.spyOn(storage, "getItem").mockImplementation((key) => {
      if (key === "active-profile" && !competing) {
        competing = true;
        storage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
        storage.setItem("active-profile", "p2");
      }
      return read(key);
    });

    initializeProfileStorage();
    expect(storage.getItem(PROFILE_STORAGE_OWNER_KEY)).toBe("default");
    expect(getProfileStorageOwner()).toBe("p2");
  });

  it("refuses a first namespaced write if the legacy owner cannot be preserved", () => {
    storage.setItem("watchlist", '["original"]');
    storage.refuse.add(PROFILE_STORAGE_OWNER_KEY);
    const before = storage.snapshot();
    expect(() => writeProfileStore("watchlist", '["new p2"]', "p2")).toThrow();
    expect(storage.snapshot()).toEqual(before);
  });

  it.each(["", "x".repeat(65)])(
    "rejects a corrupt legacy owner marker before reading or changing stores (%j)",
    (marker) => {
      storage.setItem(PROFILE_STORAGE_OWNER_KEY, marker);
      storage.setItem("watchlist", '["only saved copy"]');
      const before = storage.snapshot();

      expect(() => initializeProfileStorage()).toThrow("Invalid stored profile owner");
      expect(() => readProfileStore("watchlist", "default", true)).toThrow("Invalid stored profile owner");
      expect(() => writeProfileStore("watchlist", '["replacement"]', "default")).toThrow("Invalid stored profile owner");
      expect(storage.snapshot()).toEqual(before);
    },
  );

  it("accepts a 64-character legacy owner even when it no longer belongs to the roster", () => {
    const owner = "x".repeat(64);
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, owner);
    storage.setItem("watchlist", '["legacy"]');
    expect(() => initializeProfileStorage()).not.toThrow();
    expect(readProfileStore("watchlist", owner, true)).toBe('["legacy"]');
  });

  it("keeps existing addresses distinct for profile IDs containing delimiters", () => {
    initializeProfileStorage();
    const ids = ["p:ratings", "p%3Aratings", "p/ratings", "p%2Fratings"];
    const addresses = ids.map((id) => profileStoreKey("watchlist", id));
    expect(new Set(addresses).size).toBe(ids.length);
    for (const [index, id] of ids.entries()) {
      writeProfileStore("watchlist", JSON.stringify([id]), id);
      expect(readProfileStore("watchlist", id)).toBe(JSON.stringify([id]));
      expect(storage.getItem(addresses[index])).toBe(JSON.stringify([id]));
    }
  });
});

describe("parked fallback and mutations", () => {
  beforeEach(() => {
    initializeProfileStorage();
    storage.setItem("profile-data:p2", JSON.stringify({
      watchlist: '["parked"]', ratings: '{"movie-1":{"rating":6}}',
    }));
  });

  it("uses a canonical edit without discarding an unrelated parked store", () => {
    writeProfileStore("watchlist", '["edited"]', "p2");
    expect(readProfileStore("watchlist", "p2")).toBe('["edited"]');
    expect(readProfileStore("ratings", "p2")).toBe('{"movie-1":{"rating":6}}');
    expect(JSON.parse(storage.getItem("profile-data:p2")!)).toEqual({
      ratings: '{"movie-1":{"rating":6}}',
    });
  });

  it("can make a smaller first edit when there is no quota for a second copy", () => {
    const values = ["first".repeat(400), "second".repeat(400)];
    storage.setItem("profile-data:p2", JSON.stringify({
      watchlist: JSON.stringify(values), ratings: '{"movie-1":{"rating":6}}',
    }));
    storage.byteLimit = storage.usedBytes;
    const before = storage.usedBytes;

    writeProfileStore("watchlist", JSON.stringify(values.slice(1)), "p2");

    expect(readProfileStore("watchlist", "p2")).toBe(JSON.stringify(values.slice(1)));
    expect(readProfileStore("ratings", "p2")).toBe('{"movie-1":{"rating":6}}');
    expect(storage.usedBytes).toBeLessThan(before);
  });

  it("releases an old large field when clearing it and preserves unrelated stores", () => {
    storage.setItem("profile-data:p2", JSON.stringify({
      watchlist: JSON.stringify(["large".repeat(1000)]), ratings: '{"movie-1":{"rating":6}}',
    }));
    storage.byteLimit = storage.usedBytes;
    const before = storage.usedBytes;

    writeProfileStore("watchlist", null, "p2");

    expect(readProfileStore("watchlist", "p2")).toBeNull();
    expect(JSON.parse(storage.getItem("profile-data:p2")!)).toEqual({
      ratings: '{"movie-1":{"rating":6}}',
    });
    expect(storage.usedBytes).toBeLessThan(before / 2);
  });

  it("removes an empty parked slot after its final store is edited", () => {
    writeProfileStore("watchlist", '["edited"]', "p2");
    writeProfileStore("ratings", '{"movie-2":{"rating":8}}', "p2");

    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(readProfileStore("watchlist", "p2")).toBe('["edited"]');
    expect(readProfileStore("ratings", "p2")).toBe('{"movie-2":{"rating":8}}');
  });

  it("reclaims stale parked fields beside an already current store", () => {
    storage.setItem(profileStoreKey("watchlist", "p2"), '["current"]');
    writeProfileStore("watchlist", '["edited"]', "p2");

    expect(JSON.parse(storage.getItem("profile-data:p2")!)).toEqual({ ratings: '{"movie-1":{"rating":6}}' });
    expect(readProfileStore("watchlist", "p2")).toBe('["edited"]');
  });

  it("reclaims the original live owner's stale parked field too", () => {
    storage.setItem("watchlist", '["live"]');
    storage.setItem("profile-data:default", JSON.stringify({ watchlist: '["stale"]', ratings: '{}' }));

    writeProfileStore("watchlist", '["edited live"]', "default");

    expect(storage.getItem("watchlist")).toBe('["edited live"]');
    expect(JSON.parse(storage.getItem("profile-data:default")!)).toEqual({ ratings: '{}' });
  });

  it("does not resurrect a parked store after clearing it", () => {
    writeProfileStore("watchlist", null, "p2");
    expect(readProfileStore("watchlist", "p2")).toBeNull();
    storage.setItem("active-profile", "p2");
    expect(readProfileStore("watchlist")).toBeNull();
    storage.setItem("active-profile", "default");
    storage.setItem("active-profile", "p2");
    expect(readProfileStore("watchlist")).toBeNull();
    expect(readProfileStore("ratings")).toBe('{"movie-1":{"rating":6}}');
  });

  it("retains the fallback when the canonical write is refused", () => {
    storage.setItem("profile-data:p2", '{ "watchlist": "[\\"parked\\"]", "ratings": "{}" }');
    storage.refuse.add(profileStoreKey("watchlist", "p2"));
    const before = storage.snapshot();
    expect(() => writeProfileStore("watchlist", '["edited"]', "p2")).toThrow();
    expect(storage.snapshot()).toEqual(before);
    expect(readProfileStore("watchlist", "p2")).toBe('["parked"]');
  });

  it("keeps both exact copies when cleanup of the parked slot is refused", () => {
    storage.setItem(profileStoreKey("watchlist", "p2"), '["current"]');
    storage.refuse.add("profile-data:p2");
    const before = storage.snapshot();

    expect(() => writeProfileStore("watchlist", '["edited"]', "p2")).toThrow();
    expect(storage.snapshot()).toEqual(before);
  });

  it("restores an entirely removed parked slot after the new write is refused", () => {
    storage.setItem("profile-data:p2", '{ "watchlist": "[\\"only copy\\"]" }');
    storage.refuse.add(profileStoreKey("watchlist", "p2"));
    const before = storage.snapshot();

    expect(() => writeProfileStore("watchlist", '["edited"]', "p2")).toThrow();
    expect(storage.snapshot()).toEqual(before);
  });

  it("plans multiple store migrations together without touching unrelated fields", () => {
    storage.setItem("profile-data:p2", JSON.stringify({
      watchlist: '["old"]', ratings: '{}', goal: '{"year":"2026","target":52}', extra: { keep: true },
    }));
    const changes = profileStoreChanges(["watchlist", "ratings"], {
      watchlist: '["new"]', ratings: '{"movie-1":{"rating":7}}',
    }, "p2");

    expect(applyStorageTransaction(changes)).toEqual({ ok: true });
    expect(JSON.parse(storage.getItem("profile-data:p2")!)).toEqual({
      goal: '{"year":"2026","target":52}', extra: { keep: true },
    });
    expect(readProfileStore("watchlist", "p2")).toBe('["new"]');
    expect(readProfileStore("ratings", "p2")).toBe('{"movie-1":{"rating":7}}');
  });

  it("restores all migrated fields if a later store in the same transaction is refused", () => {
    const before = storage.snapshot();
    storage.refuse.add(profileStoreKey("ratings", "p2"));
    const changes = profileStoreChanges(["watchlist", "ratings"], {
      watchlist: '["new"]', ratings: '{"movie-1":{"rating":7}}',
    }, "p2");

    expect(applyStorageTransaction(changes)).toMatchObject({ ok: false, rolledBack: true });
    expect(storage.snapshot()).toEqual(before);
  });

  it("leaves complete restores' explicit slot cleanup to the restore planner", () => {
    const changes = profileStoreChanges(["watchlist", "ratings"], {
      watchlist: '["new"]', ratings: '{}',
    }, "p2", { restoringProfile: true });

    expect(changes.has("profile-data:p2")).toBe(false);
  });

  it.each(["{not json", "null", "[]", '{"watchlist":42}', '{"watchlist":"[not json"}'])(
    "preserves an unreadable older copy while saving a current store (%s)",
    (raw) => {
      storage.setItem(profileStoreKey("watchlist", "p2"), '["current"]');
      storage.setItem("profile-data:p2", raw);
      writeProfileStore("watchlist", '["edited"]', "p2");

      expect(storage.getItem("profile-data:p2")).toBe(raw);
      expect(readProfileStore("watchlist", "p2")).toBe('["edited"]');
    },
  );

  it.each(["{not json", "null", "[]", '{"watchlist":42}', '{"watchlist":"[not json"}'])(
    "rejects a write when its only stored copy is unreadable (%s)",
    (raw) => {
      storage.setItem("profile-data:p2", raw);
      const before = storage.snapshot();

      expect(() => writeProfileStore("watchlist", '["edited"]', "p2")).toThrow();
      expect(storage.snapshot()).toEqual(before);
    },
  );

  it("keeps a read and transformed write in one owner when the pointer changes midway", () => {
    storage.setItem("ratings", '{"movie-2":{"rating":9}}');
    withProfileStorage("p2", () => {
      const ratings = JSON.parse(readProfileStore("ratings")!);
      storage.setItem("active-profile", "default");
      writeProfileStore("ratings", JSON.stringify({ ...ratings, "movie-3": { rating: 8 } }));
    });
    expect(JSON.parse(readProfileStore("ratings", "p2")!)).toEqual({
      "movie-1": { rating: 6 }, "movie-3": { rating: 8 },
    });
    expect(JSON.parse(readProfileStore("ratings", "default")!)).toEqual({
      "movie-2": { rating: 9 },
    });
  });

  it("restores nested bindings and restores the active owner after an exception", () => {
    storage.setItem("active-profile", "default");
    expect(() => withProfileStorage("p2", () => {
      expect(getProfileStorageOwner()).toBe("p2");
      withProfileStorage("p3", () => {
        expect(getProfileStorageOwner()).toBe("p3");
      });
      expect(getProfileStorageOwner()).toBe("p2");
      throw new Error("transform failed");
    })).toThrow("transform failed");
    expect(getProfileStorageOwner()).toBe("default");
  });

  it.each(["{not json", "null", "[]", '{"watchlist":42}', '{"watchlist":"[not json"}'])(
    "rejects an unreadable fallback on a strict read without changing it (%s)",
    (raw) => {
      storage.setItem("profile-data:p2", raw);
      expect(() => readProfileStore("watchlist", "p2", true)).toThrow();
      expect(storage.getItem("profile-data:p2")).toBe(raw);
    },
  );

  it("ignores a corrupt unused fallback after the store has a canonical value", () => {
    writeProfileStore("watchlist", '["new"]', "p2");
    storage.setItem("profile-data:p2", "{not json");
    expect(readProfileStore("watchlist", "p2", true)).toBe('["new"]');
  });
});

describe("profile store subscriptions", () => {
  it("recognizes active canonical and fallback events and every pointer switch", () => {
    initializeProfileStorage();
    storage.setItem("active-profile", "p2");
    expect(isProfileStoreEvent(profileStoreKey("ratings", "p2"), "ratings")).toBe(true);
    expect(isProfileStoreEvent("profile-data:p2", "ratings")).toBe(true);
    expect(isProfileStoreEvent("active-profile", "ratings")).toBe(true);
    expect(isProfileStoreEvent("profiles", "ratings")).toBe(true);
    expect(isProfileStoreEvent(deletedProfileKey("p2"), "ratings")).toBe(true);
    expect(isProfileStoreEvent(null, "ratings")).toBe(true);
    expect(isProfileStoreEvent("ratings", "ratings")).toBe(false);
    expect(isProfileStoreEvent(profileStoreKey("ratings", "p3"), "ratings")).toBe(false);
    expect(isProfileStoreEvent(profileStoreKey("collections", "p2"), "ratings")).toBe(false);
  });

  it("publishes once after the outer write scope so subscribers read the actual active owner", () => {
    initializeProfileStorage();
    const seen: string[] = [];
    const subscriber = vi.fn(() => seen.push(getProfileStorageOwner()));
    withProfileStorage("p2", () => {
      storage.setItem("active-profile", "p3");
      publishProfileStorageChange(subscriber);
      withProfileStorage("p4", () => publishProfileStorageChange(subscriber));
      expect(subscriber).not.toHaveBeenCalled();
    });
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["p3"]);
  });
});

it("rejects and removes a late write after its owner was deleted during setItem", () => {
  initializeProfileStorage();
  storage.setItem("profiles", JSON.stringify([
    { id: "default", name: "Me" }, { id: "p2", name: "Second" },
  ]));
  const address = profileStoreKey("watchlist", "p2");
  const write = storage.setItem.bind(storage);
  vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
    write(key, value);
    if (key === address) write(deletedProfileKey("p2"), "true");
  });

  expect(() => writeProfileStore("watchlist", '["late"]', "p2")).toThrow("removed");
  expect(storage.getItem(address)).toBeNull();
  expect(storage.getItem(deletedProfileKey("p2"))).toBe("true");
});

it.each(["profile-data:p2", "profile-store:p2:watchlist"])(
  "does not revive parked or current data when its owner is deleted during migration of %s",
  (triggerKey) => {
    initializeProfileStorage();
    storage.setItem("profiles", JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    storage.setItem("watchlist", '["default data"]');
    storage.setItem("profile-data:p2", JSON.stringify({ watchlist: '["old"]', ratings: '{}' }));
    const write = storage.setItem.bind(storage);
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      write(key, value);
      if (key === triggerKey) write(deletedProfileKey("p2"), "true");
    });

    expect(() => writeProfileStore("watchlist", '["edited"]', "p2")).toThrow("removed");
    expect(storage.getItem("profile-data:p2")).toBeNull();
    expect(storage.getItem(profileStoreKey("watchlist", "p2"))).toBeNull();
    expect(storage.getItem("watchlist")).toBe('["default data"]');
    expect(storage.getItem(deletedProfileKey("p2"))).toBe("true");
  },
);
