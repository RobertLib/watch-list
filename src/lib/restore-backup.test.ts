// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "../test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import { getCollectionsSnapshot, subscribeToCollections } from "./collections";
import { getGameStateSnapshot, subscribeToGameState } from "./daily-game";
import { BACKUP_FORMAT, parseBackup, readBackupSnapshot, storesToSlot, type PortableData } from "./portable-data";
import { GOAL_STORAGE_KEY, getGoalSnapshot, subscribeToGoal } from "./goal";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY, createProfile, deleteProfile, getActiveProfileId, getProfiles, liveProfileChanges, readProfileSlot, subscribeProfiles, switchProfile } from "./profiles";
import { getRatingsSnapshot, subscribeToRatings } from "./ratings";
import { restoreBackup, restoreFailureLabel } from "./restore-backup";
import { LAST_VISIT_STORAGE_KEY, LEGACY_LAST_VISIT_STORAGE_KEY, readLastVisit } from "./last-visit";
import { getSettings, HAS_SETTINGS_KEY, isCustomised, refreshSettings, REGION_KEY, subscribeSettings } from "./settings";
import { WATCHLIST_STORAGE_KEY, getWatchlist } from "./watchlist";
import { PROFILE_STORAGE_OWNER_KEY, deletedProfileKey, getProfileStorageOwner, withProfileStorage, writeProfileStore } from "./profile-storage";

function rawSnapshot(): Record<string, string> {
  return Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
    const key = localStorage.key(index)!;
    return [key, localStorage.getItem(key)!];
  }));
}

function incoming(): PortableData {
  return parseBackup({
    format: BACKUP_FORMAT,
    activeProfile: { id: "p9", name: "Incoming active" },
    otherProfiles: [{ id: "default", name: "Incoming default", watchlist: [] }],
    watchlist: [{ id: 550, title: "Incoming", mediaType: "movie" }],
    ratings: { "movie-550": { rating: 8, ratedAt: "2026-01-01" } },
    collections: [{ id: "new", name: "Incoming", items: [] }],
    settings: { region: "CZ", watchProviderFilter: "streaming-only", selectedProviderIds: [8] },
  })!;
}

function seed(): void {
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
    { id: "default", name: "Original active" }, { id: "old", name: "Original dormant" },
  ]));
  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
  localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
  localStorage.setItem("profile-data:default", '{"watchlist":"[]","watched":"[]"}');
  localStorage.setItem("profile-data:old", '{"watchlist":"[1,2,3]"}');
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(Array.from({ length: 15 }, (_, index) => ({
    id: index + 1, title: "Original title", mediaType: "movie",
  }))));
  localStorage.setItem("watched", "[ { \"id\": 44, \"mediaType\": \"tv\" } ]");
  localStorage.setItem("ratings", '{ "movie-12": { "rating": 4, "ratedAt": "2026-01-01" } }');
  localStorage.setItem("collections", '[{"id":"old","name":"Original","items":[]}]');
  localStorage.setItem("daily-game", '{"played":2,"wins":1,"streak":1}');
  localStorage.setItem(GOAL_STORAGE_KEY, '{"year":"2026","target":52}');
  localStorage.setItem(REGION_KEY, "SK");
  localStorage.setItem("selected-watch-providers", "9,337");
  localStorage.setItem("watch-provider-filter", "all");
  localStorage.setItem("user-has-settings", "true");
  localStorage.setItem("unrelated", "must remain intact");
  refreshSettings();
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.spyOn(console, "error").mockImplementation(() => {});
  seed();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("coordinated backup restore", () => {
  it("allows an explicit backup restore to replace unreadable current stores and slots", async () => {
    const backup = incoming();
    backup.activeProfile = { id: "default", name: "Recovered owner" };
    backup.otherProfiles = [];
    for (const key of Object.keys(storesToSlot(backup))) localStorage.setItem(key, "{not json");
    localStorage.setItem("profile-data:default", "{not json");

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(readProfileSlot("default", { strict: true })).toEqual(storesToSlot(backup));
    expect(localStorage.getItem("profile-data:default")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("must remain intact");
  });

  it("retains a legacy backup's captured owner while waiting for another tab's lock", async () => {
    const backup = parseBackup({ format: BACKUP_FORMAT, watchlist: [{ id: 550, mediaType: "movie" }] })!;
    const originalDefault = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    let release!: () => void;
    let acquired!: () => void;
    const entered = new Promise<void>((resolve) => { acquired = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      acquired();
      return blocked;
    });
    await entered;

    const pending = withProfileStorage("old", () => restoreBackup(backup));
    expect(getProfileStorageOwner()).toBe("default");
    expect(localStorage.getItem("profile-store:old:watchlist")).toBeNull();
    release();
    await holding;

    expect(await pending).toEqual({ ok: true });
    expect(localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(originalDefault);
    expect(JSON.parse(readProfileSlot("old").watchlist)).toEqual(backup.watchlist);
    expect(getActiveProfileId()).toBe("default");
  });

  it("coordinates a full backup restore and a create from an independent tab", async () => {
    vi.resetModules();
    const secondTab = await import("./profiles");
    const [restored, created] = await Promise.all([
      restoreBackup(incoming()), secondTab.createProfile("After restore"),
    ]);
    expect(restored).toEqual({ ok: true });
    expect(created).not.toBeNull();
    expect(secondTab.getProfiles().map((profile) => profile.name)).toEqual([
      "Incoming active", "Incoming default", "After restore",
    ]);
    expect(getWatchlist().map((item) => item.title)).toEqual(["Incoming"]);
    expect(readProfileSlot(created!.id)).toEqual({});
  });

  it("keeps a concurrently created profile when a later backup restore rolls back", async () => {
    const before = rawSnapshot();
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === ACTIVE_PROFILE_STORAGE_KEY) throw new DOMException("QuotaExceededError");
      write.call(this, key, value);
    });
    const [created, restored] = await Promise.all([
      createProfile("Before refused restore"), restoreBackup(incoming()),
    ]);
    expect(created).not.toBeNull();
    expect(restored).toEqual({ ok: false, key: ACTIVE_PROFILE_STORAGE_KEY, rolledBack: true });
    expect(getProfiles().map((profile) => profile.name)).toEqual([
      "Original active", "Original dormant", "Before refused restore",
    ]);
    expect(rawSnapshot()).toEqual({
      ...before, [PROFILES_STORAGE_KEY]: JSON.stringify([
        { id: "default", name: "Original active" }, { id: "old", name: "Original dormant" }, created,
      ]),
    });
  });

  it("rejects a backup without touching storage when browser locking is unavailable or refused", async () => {
    const before = rawSnapshot();
    for (const locks of [undefined, { request: () => Promise.reject(new Error("Denied")) }]) {
      vi.stubGlobal("navigator", { locks });
      expect(await restoreBackup(incoming())).toEqual({ ok: false, key: "profiles", rolledBack: true });
      expect(rawSnapshot()).toEqual(before);
    }
  });

  it("rejects a legacy backup retained for an owner that was deleted", async () => {
    const backup = parseBackup({ format: BACKUP_FORMAT, watchlist: [{ id: 550, mediaType: "movie" }] })!;
    expect(await deleteProfile("old")).toBe(true);
    const before = rawSnapshot();

    expect(await withProfileStorage("old", () => restoreBackup(backup))).toEqual({
      ok: false, key: "profiles", rolledBack: true,
    });
    expect(() => liveProfileChanges({ watchlist: "[]" }, "old")).toThrow("removed");
    expect(rawSnapshot()).toEqual(before);
  });

  it("queues deletion until a legacy restore has completed its last data write", async () => {
    const backup = parseBackup({ format: BACKUP_FORMAT, watchlist: [{ id: 550, mediaType: "movie" }] })!;
    writeProfileStore("watchlist", "[]", "old");
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "old");
    const write = Storage.prototype.setItem;
    let switched: Promise<boolean> | undefined;
    let deletion: Promise<boolean> | undefined;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      write.call(this, key, value);
      if (key === "profile-store:old:watchlist" && !deletion) {
        switched = switchProfile("default");
        deletion = deleteProfile("old");
        expect(localStorage.getItem(deletedProfileKey("old"))).toBeNull();
      }
    });

    const result = await withProfileStorage("old", () => restoreBackup(backup));
    expect(result).toEqual({ ok: true });
    expect(await switched).toBe(true);
    expect(await deletion).toBe(true);
    expect(localStorage.getItem(deletedProfileKey("old"))).toBe("true");
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual(["default"]);
    expect(getActiveProfileId({ strict: true })).toBe("default");
    expect(getProfileStorageOwner()).toBe("default");
    expect(() => writeProfileStore("watchlist", "[]", "old")).toThrow("removed");
    expect(localStorage.getItem("profile-store:old:watchlist")).toBeNull();
  });

  it("releases the incoming active profile's parked copy so the backup fits its quota", async () => {
    localStorage.clear();
    const backup = parseBackup({
      format: BACKUP_FORMAT,
      exportedAt: "2026-01-01T00:00:00.000Z",
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [{ id: "p2", name: "Second" }],
      watchlist: Array.from({ length: 80 }, (_, index) => ({
        id: index + 1, title: "A".repeat(200), mediaType: "movie", posterPath: null,
        voteAverage: 8, releaseDate: "2026-01-01", addedAt: "2026-01-01T00:00:00.000Z",
      })),
    })!;
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    localStorage.setItem("profile-data:default", JSON.stringify(storesToSlot(backup)));
    for (const [key, value] of Object.entries(storesToSlot(backup.otherProfiles[0]))) {
      localStorage.setItem(key, value);
    }
    const used = () => Object.entries(rawSnapshot()).reduce(
      (total, [key, value]) => total + 2 * (key.length + value.length), 0,
    );
    const limit = used() + 1000;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      const old = this.getItem(key);
      const oldBytes = old === null ? 0 : 2 * (key.length + old.length);
      if (used() - oldBytes + 2 * (key.length + value.length) > limit) {
        throw new DOMException("QuotaExceededError");
      }
      setItem.call(this, key, value);
    });

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(localStorage.getItem("profile-data:default")).toBeNull();
    expect(getWatchlist()).toEqual(backup.watchlist);
    expect(used()).toBeLessThanOrEqual(limit);
    expect(await switchProfile("p2")).toBe(true);
    expect(getWatchlist()).toEqual([]);
    expect(await switchProfile("default")).toBe(true);
    expect(getWatchlist()).toEqual(backup.watchlist);
  });

  it("publishes an imported goal only after the backup commits", async () => {
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify({ year: "2026", target: 52 }));
    const listener = vi.fn(() => getGoalSnapshot());
    const stop = subscribeToGoal(listener);
    const backup = incoming();
    backup.goal = { year: "2026", target: 10 };

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.results[0].value).toEqual(backup.goal);
    stop();
  });

  it("restores every profile promised by a repaired backup and empties the implicit default", async () => {
    localStorage.setItem("profile-data:default", JSON.stringify({
      watchlist: JSON.stringify([{ id: 999, title: "Old default data", mediaType: "movie" }]),
    }));
    const backup = parseBackup({
      format: BACKUP_FORMAT,
      version: 3,
      activeProfile: { id: "active", name: "Active" },
      otherProfiles: Array.from({ length: 3 }, (_, index) => ({
        id: `p${index}`, name: `Person ${index}`,
        watchlist: [{ id: index + 1, title: `Title ${index}`, mediaType: "movie" }],
      })),
    })!;

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(getProfiles().map((profile) => profile.id)).toEqual([
      "active", ...backup.otherProfiles.map((profile) => profile.id),
    ]);
    for (const profile of backup.otherProfiles) {
      expect(JSON.parse(readProfileSlot(profile.id).watchlist)).toEqual(profile.watchlist);
    }
    expect(await switchProfile("default")).toBe(true);
    expect(getWatchlist()).toEqual([]);
  });

  it.each([WATCHLIST_STORAGE_KEY, "profile-store:p9:ratings", PROFILES_STORAGE_KEY, ACTIVE_PROFILE_STORAGE_KEY, "profile-data:default", REGION_KEY])(
    "restores exact raw values and cached snapshots after %s is refused",
    async (refusedKey) => {
      const before = rawSnapshot();
      const ratings = getRatingsSnapshot();
      const collections = getCollectionsSnapshot();
      const game = getGameStateSnapshot();
      const goal = getGoalSnapshot();
      const settings = getSettings();
      const listener = vi.fn();
      const unsubscribe = [subscribeToRatings(listener), subscribeToCollections(listener),
        subscribeToGameState(listener), subscribeToGoal(listener), subscribeSettings(listener), subscribeProfiles(listener)];
      const setItem = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
        if (key === refusedKey) throw new DOMException("QuotaExceededError");
        setItem.call(this, key, value);
      });

      expect(await restoreBackup(incoming())).toEqual({ ok: false, key: refusedKey, rolledBack: true });
      expect(rawSnapshot()).toEqual(before);
      expect(getRatingsSnapshot()).toBe(ratings);
      expect(getCollectionsSnapshot()).toBe(collections);
      expect(getGameStateSnapshot()).toBe(game);
      expect(getGoalSnapshot()).toBe(goal);
      expect(getSettings()).toBe(settings);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe.forEach((stop) => stop());
    },
  );

  it("undoes a live size swap under a real byte quota", async () => {
    const backup = incoming();
    backup.watched = Array.from({ length: 60 }, (_, index) => ({
      id: index + 1, title: "Incoming watched", mediaType: "movie", posterPath: null,
      voteAverage: 7, releaseDate: "2020-01-01", watchedAt: "2026-01-01T00:00:00.000Z",
    }));
    const before = rawSnapshot();
    const used = () => Object.entries(rawSnapshot()).reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
    const limit = used();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      const old = this.getItem(key);
      const oldBytes = old === null ? 0 : 2 * (key.length + old.length);
      if (used() - oldBytes + 2 * (key.length + value.length) > limit) {
        throw new DOMException("QuotaExceededError");
      }
      setItem.call(this, key, value);
    });

    expect(await restoreBackup(backup)).toMatchObject({ ok: false, rolledBack: true });
    expect(rawSnapshot()).toEqual(before);
  });

  it("publishes only complete committed data and refreshes settings without subscribers", async () => {
    const seen: string[] = [];
    const stop = subscribeToRatings(() => {
      expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p9");
      expect(getSettings().region).toBe("CZ");
      expect(getCollectionsSnapshot()[0].id).toBe("new");
      seen.push("complete");
    });
    expect(getSettings().region).toBe("SK");

    expect(await restoreBackup(incoming())).toEqual({ ok: true });
    expect(seen).toEqual(["complete"]);
    expect(getRatingsSnapshot()["movie-550"].rating).toBe(8);
    expect(localStorage.getItem("profile-data:old")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("must remain intact");
    stop();
  });

  it("keeps profile identities and absent settings intact for an older backup", async () => {
    const before = rawSnapshot();
    const backup = incoming();
    backup.activeProfile = null;
    backup.otherProfiles = [];
    backup.settings = { region: null, watchProviderFilter: null, selectedProviderIds: null };
    expect(await restoreBackup(backup)).toEqual({ ok: true });
    for (const key of [PROFILES_STORAGE_KEY, ACTIVE_PROFILE_STORAGE_KEY, "profile-data:old", REGION_KEY, "selected-watch-providers", HAS_SETTINGS_KEY]) {
      expect(localStorage.getItem(key)).toBe(before[key]);
    }
  });

  it("fully removes replaced active slots even when they contain unknown or unreadable fields", async () => {
    const backup = incoming();
    localStorage.setItem("profile-data:p9", JSON.stringify({
      watchlist: JSON.stringify([{ id: 12, mediaType: "movie" }]),
      ratings: "{not json",
      extra: { obsolete: true },
    }));

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(localStorage.getItem("profile-data:p9")).toBeNull();
    expect(getWatchlist()).toEqual(backup.watchlist);
  });

  it("migrates an older ownerless backup without retaining duplicate parked stores", async () => {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "old");
    localStorage.setItem("profile-data:old", JSON.stringify({
      watchlist: JSON.stringify([{ id: 12, mediaType: "movie" }]),
      watched: "[]", ratings: "{}", extra: { recoverable: true },
    }));
    const backup = incoming();
    backup.activeProfile = null;
    backup.otherProfiles = [];

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem("profile-data:old")!)).toEqual({ extra: { recoverable: true } });
    expect(getActiveProfileId()).toBe("old");
    expect(getWatchlist()).toEqual(backup.watchlist);
  });

  it.each([false, true])("restores default settings with their explicit configuration flag of %s", async (hasCustomSettings) => {
    const backup = incoming();
    backup.settings = {
      region: "US", watchProviderFilter: "all", selectedProviderIds: [], hasCustomSettings,
    };
    localStorage.setItem(HAS_SETTINGS_KEY, String(!hasCustomSettings));
    refreshSettings();

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(localStorage.getItem(HAS_SETTINGS_KEY)).toBe(String(hasCustomSettings));
    expect(getSettings()).toEqual({
      region: "US", watchProviderFilter: "all", selectedProviderIds: [], hasCustomSettings,
    });
    expect(isCustomised(getSettings())).toBe(hasCustomSettings);
  });

  it("keeps absent settings and infers configuration for an older partial backup", async () => {
    const backup = parseBackup({
      format: BACKUP_FORMAT, version: 1,
      settings: { region: "CZ", hasCustomSettings: "false" },
    })!;
    localStorage.setItem(HAS_SETTINGS_KEY, "false");
    refreshSettings();

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(getSettings()).toEqual({
      region: "CZ", watchProviderFilter: "all", selectedProviderIds: [9, 337], hasCustomSettings: true,
    });
    expect(localStorage.getItem(HAS_SETTINGS_KEY)).toBe("true");
  });

  it("publishes actual storage if the browser also refuses a rollback write", async () => {
    const originalWatchlist = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const listener = vi.fn();
    const unsubscribe = [subscribeToRatings(listener), subscribeToCollections(listener),
      subscribeToGameState(listener), subscribeSettings(listener), subscribeProfiles(listener)];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "profile-store:p9:watchlist" || (key === WATCHLIST_STORAGE_KEY && value === originalWatchlist)) {
        throw new DOMException("QuotaExceededError");
      }
      setItem.call(this, key, value);
    });

    expect(await restoreBackup(incoming())).toEqual({ ok: false, key: "profile-store:p9:watchlist", rolledBack: false });
    expect(localStorage.getItem(WATCHLIST_STORAGE_KEY)).not.toBe(originalWatchlist);
    expect(getSettings().region).toBe(localStorage.getItem(REGION_KEY));
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe.forEach((stop) => stop());
  });

  it("restores each profile's last visit, and resets one an older file did not carry", async () => {
    localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, "2026-01-01T00:00:00.000Z");
    const backup = parseBackup({
      format: BACKUP_FORMAT,
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [{ id: "p2", name: "Two", lastVisit: "2026-02-02T00:00:00.000Z" }],
      lastVisit: "not a date",
    })!;

    expect((await restoreBackup(backup)).ok).toBe(true);

    expect(readLastVisit("p2")).toBe("2026-02-02T00:00:00.000Z");
    // The shared pre-profile stamp is replaced with the rest of its owner's data.
    expect(readLastVisit("default")).toBeNull();
    expect(localStorage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY)).toBeNull();
  });
});

describe("restoreFailureLabel", () => {
  const profiles = [
    { id: "default", name: "Alice" }, { id: "bob", name: "Bob" }, { id: "p:3", name: "Third" },
  ];

  // Storage addresses used to reach the visitor verbatim:
  // "Could not restore profile-deleted:3f2a…".
  it.each([
    [deletedProfileKey("bob"), 'the profile "Bob"'],
    [deletedProfileKey("p:3"), 'the profile "Third"'],
    [deletedProfileKey("gone"), "the profile list"],
    ["profile-data:bob", 'the profile "Bob"'],
    ["profile-store:bob:watched", 'watched list for "Bob"'],
    [`profile-store:${encodeURIComponent("p:3")}:episode-progress`, 'episode progress for "Third"'],
    ["profile-store:unknown:ratings", "the ratings"],
    ["profile-store:default:yearly-goal", "your yearly goal"],
    [WATCHLIST_STORAGE_KEY, "your watchlist"],
    [LAST_VISIT_STORAGE_KEY, "your last-visit date"],
    [LEGACY_LAST_VISIT_STORAGE_KEY, "your last-visit date"],
    [PROFILES_STORAGE_KEY, "the profile list"],
    [ACTIVE_PROFILE_STORAGE_KEY, "the profile list"],
    [PROFILE_STORAGE_OWNER_KEY, "the profile list"],
    [REGION_KEY, "your region and platform settings"],
    [HAS_SETTINGS_KEY, "your region and platform settings"],
    ["something-unexpected", "this backup"],
    [null, "this backup"],
  ])("names %s as %s", (key, label) => {
    expect(restoreFailureLabel(key, { activeProfileId: "default", profiles })).toBe(label);
  });

  it("names the original owner's live stores for whoever owns them", () => {
    localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "bob");
    expect(restoreFailureLabel("ratings", { activeProfileId: "default", profiles })).toBe('ratings for "Bob"');
  });

  it("never shows a storage address, whatever the key", () => {
    for (const key of ["profile-deleted:%E0%A4%A", "profile-store:x", "profile-data:"]) {
      expect(restoreFailureLabel(key, { profiles })).not.toContain(key);
    }
  });
});

describe("a damaged roster", () => {
  const heat = { id: 949, title: "Heat", mediaType: "movie", addedAt: "2026-02-01T00:00:00.000Z" };

  function seedBob(): string {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Original active" }, { id: "bob", name: "Bob" },
    ]));
    localStorage.removeItem("profile-data:old");
    localStorage.setItem("profile-store:bob:watchlist", JSON.stringify([heat]));
    // Cut one character: the roster no longer parses.
    const damaged = localStorage.getItem(PROFILES_STORAGE_KEY)!.slice(0, -1);
    localStorage.setItem(PROFILES_STORAGE_KEY, damaged);
    return damaged;
  }

  function exported(): PortableData {
    return parseBackup(JSON.parse(JSON.stringify(readBackupSnapshot("2026-03-01T00:00:00.000Z"))))!;
  }

  it("exports the profiles it can no longer list, found from their stores", () => {
    const damaged = seedBob();
    const backup = readBackupSnapshot("2026-03-01T00:00:00.000Z");

    expect(backup.otherProfiles).toMatchObject([
      { id: "bob", name: "Recovered profile 1", watchlist: [{ id: 949, title: "Heat" }] },
    ]);
    expect(backup.unreadable).toContainEqual({ profile: null, stores: ["profiles"], raw: damaged });
  });

  it("brings them back through a restore of that backup", async () => {
    seedBob();
    const backup = exported();

    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual(["default", "bob"]);
    expect(await switchProfile("bob")).toBe(true);
    expect(getWatchlist().map((item) => item.id)).toEqual([949]);
  });

  it("keeps a name the repaired roster dropped, when it is still usable", () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "a", name: "A" }, { id: "b", name: "B" },
      { id: "c", name: "C" }, { id: "d", name: "D" }, { id: "eve", name: "Eve" },
    ]));
    localStorage.setItem("profile-store:eve:watchlist", JSON.stringify([heat]));

    const backup = readBackupSnapshot("2026-03-01T00:00:00.000Z");
    expect(backup.otherProfiles.find((profile) => profile.id === "eve")).toMatchObject({
      name: "Eve", watchlist: [{ id: 949 }],
    });
  });

  it("deletes everybody the backup does not carry, even those the roster cannot list", async () => {
    seedBob();
    localStorage.setItem("profile-data:carol", '{"watchlist":"[]"}');
    const only = parseBackup({
      format: BACKUP_FORMAT,
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [],
      watchlist: [],
    })!;

    expect(await restoreBackup(only)).toEqual({ ok: true });
    expect(localStorage.getItem("profile-store:bob:watchlist")).toBeNull();
    expect(localStorage.getItem("profile-data:carol")).toBeNull();
    expect(localStorage.getItem(deletedProfileKey("bob"))).toBe("true");
    expect(getProfiles({ strict: true }).map((profile) => profile.id)).toEqual(["default"]);
    expect(localStorage.getItem("unrelated")).toBe("must remain intact");
  });

  it("also clears a deleted profile's leftovers that its own cleanup could not remove", async () => {
    localStorage.setItem(deletedProfileKey("gone"), "true");
    localStorage.setItem("profile-store:gone:watchlist", JSON.stringify([heat]));

    expect(await restoreBackup(incoming())).toEqual({ ok: true });
    expect(localStorage.getItem("profile-store:gone:watchlist")).toBeNull();
    expect(localStorage.getItem(deletedProfileKey("gone"))).toBe("true");
  });
});

describe("undated entries in a backup", () => {
  it("stay undated through an export and a restore", async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
      { id: 550, title: "Undated", mediaType: "movie", addedAt: "" },
      { id: 949, title: "Dated", mediaType: "movie", addedAt: "2026-02-01T00:00:00.000Z" },
    ]));
    const backup = parseBackup(JSON.parse(JSON.stringify(readBackupSnapshot("2026-03-01T00:00:00.000Z"))))!;

    expect(backup.watchlist.map((item) => item.addedAt)).toEqual(["", "2026-02-01T00:00:00.000Z"]);
    expect(await restoreBackup(backup)).toEqual({ ok: true });
    expect(getWatchlist().map((item) => item.addedAt)).toEqual(["", "2026-02-01T00:00:00.000Z"]);
  });
});
