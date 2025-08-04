// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addManyToWatchlist, addToWatchlist, clearWatchlist, getWatchlist, migrateWatchlist, removeFromWatchlist, WATCHLIST_STORAGE_KEY } from "./watchlist";
import { initializeProfileStorage, withProfileStorage } from "./profile-storage";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import { BACKUP_FORMAT, parseBackup, readStoredStores } from "./portable-data";
import { restoreBackup } from "./restore-backup";
import {
  DEFAULT_PROFILE_ID,
  createProfile,
  getActiveProfileId,
  readProfileSlot,
  switchProfileWithResult,
} from "./profiles";

const legacy = [{
  id: 550,
  title: "Fight Club",
  mediaType: "movie" as const,
  posterPath: null,
  voteAverage: 8.4,
  releaseDate: "1999-10-15",
  addedAt: "2026-01-01T00:00:00.000Z",
}];

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  document.cookie = `watchlist=${encodeURIComponent(JSON.stringify(legacy))};path=/`;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.cookie = "watchlist=;max-age=0;path=/";
});

describe("legacy cookie migration", () => {
  const mutations = [
    { name: "add", run: () => addToWatchlist({ ...legacy[0], id: 949, title: "Heat" }), refused: "failed" },
    { name: "batch add", run: () => addManyToWatchlist([{ ...legacy[0], id: 949, title: "Heat" }]), refused: ["failed"] },
    { name: "remove", run: () => removeFromWatchlist(550, "movie"), refused: "failed" },
  ];

  it.each(mutations)("rejects $name instead of overwriting malformed stored JSON", async ({ run, refused }) => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(legacy).slice(0, -1));
    const before = { ...window.localStorage };
    const cookie = document.cookie;

    expect(getWatchlist()).toEqual([]);
    expect(await run()).toEqual(refused);
    expect({ ...window.localStorage }).toEqual(before);
    expect(document.cookie).toBe(cookie);
  });

  it.each(mutations)("rejects $name instead of hiding a malformed legacy cookie", async ({ run, refused }) => {
    document.cookie = `watchlist=${encodeURIComponent(JSON.stringify(legacy).slice(0, -1))};path=/`;
    const before = { ...window.localStorage };
    const cookie = document.cookie;

    expect(getWatchlist()).toEqual([]);
    expect(await run()).toEqual(refused);
    expect({ ...window.localStorage }).toEqual(before);
    expect(document.cookie).toBe(cookie);
  });

  it("does not acquire a lock when there is no legacy cookie", async () => {
    document.cookie = "watchlist=;max-age=0;path=/";
    const request = vi.spyOn(navigator.locks, "request");

    expect(await migrateWatchlist()).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect({ ...window.localStorage }).toEqual({});
  });

  it("leaves another owner's cookie alone without acquiring a lock", async () => {
    const other = (await createProfile("Someone else"))!;
    initializeProfileStorage();
    const before = { ...window.localStorage };
    const request = vi.spyOn(navigator.locks, "request");

    expect(await withProfileStorage(other.id, migrateWatchlist)).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect({ ...window.localStorage }).toEqual(before);
    expect(document.cookie).toContain("watchlist=");
  });

  it("retains a pending cookie if its required migration lock is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    expect(await migrateWatchlist()).toBe(false);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(getWatchlist()).toEqual(legacy);
    expect(document.cookie).toContain("watchlist=");
  });

  it("rejects malformed cookie exports without deleting or rewriting their only copy", async () => {
    document.cookie = "watchlist=%7Bnot-json;path=/";
    const before = { ...window.localStorage };

    expect(getWatchlist()).toEqual([]);
    expect(() => readStoredStores("2026-01-01T00:00:00.000Z")).toThrow();
    expect(await migrateWatchlist()).toBe(false);
    expect({ ...window.localStorage }).toEqual(before);
    expect(document.cookie).toContain("watchlist=%7Bnot-json");
  });

  it("reads the cookie without writing, then deletes it only once migration persists", async () => {
    expect(getWatchlist()).toEqual(legacy);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("profile-storage-owner")).toBeNull();
    expect(document.cookie).toContain("watchlist=");
    expect(await migrateWatchlist()).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)!)).toEqual(legacy);
    expect(document.cookie).not.toContain("watchlist=");
    expect(getWatchlist()).toEqual(legacy);
  });

  it("preserves the only copy across repeated reads when storage refuses the migration", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(await migrateWatchlist()).toBe(false);
    expect(getWatchlist()).toEqual(legacy);
    expect(getWatchlist()).toEqual(legacy);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(document.cookie).toContain("watchlist=");
  });

  it("retries and finishes the migration once storage becomes available", async () => {
    const refused = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(await migrateWatchlist()).toBe(false);
    expect(getWatchlist()).toEqual(legacy);
    refused.mockRestore();

    expect(await migrateWatchlist()).toBe(true);
    expect(getWatchlist()).toEqual(legacy);
    expect(document.cookie).not.toContain("watchlist=");
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)!)).toEqual(legacy);
  });

  it("keeps a cleared list empty even when the legacy cookie cannot be deleted", async () => {
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {});
    expect(getWatchlist()).toEqual(legacy);
    expect(document.cookie).toContain("watchlist=");

    expect(await clearWatchlist()).toBe(true);

    expect(document.cookie).toContain("watchlist=");
    expect(getWatchlist()).toEqual([]);
    expect(getWatchlist()).toEqual([]);
  });

  it("keeps the legacy data when storage refuses to persist the clear", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(await clearWatchlist()).toBe(false);

    expect(document.cookie).toContain("watchlist=");
    expect(getWatchlist()).toEqual(legacy);
  });

  it("finishes a persisted clear even if cookie cleanup throws", async () => {
    expect(getWatchlist()).toEqual(legacy);
    document.cookie = `watchlist=${encodeURIComponent(JSON.stringify(legacy))};path=/`;
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      throw new DOMException("Cookie writes refused", "SecurityError");
    });

    expect(await clearWatchlist()).toBe(true);
    expect(getWatchlist()).toEqual([]);
  });
});

describe("queued legacy cookie migration", () => {
  async function holdRosterLock() {
    let release!: () => void;
    let acquired!: () => void;
    const entered = new Promise<void>((resolve) => { acquired = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => {
      acquired();
      return blocked;
    });
    await entered;
    return { release, holding };
  }

  it("re-reads a newer add inside the lock rather than overwriting it with the cookie", async () => {
    const { release, holding } = await holdRosterLock();
    const added = addToWatchlist({ ...legacy[0], id: 949, title: "Heat" });
    const migration = migrateWatchlist();
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();

    release();
    await holding;

    expect(await added).toBe("ok");
    expect(await migration).toBe(true);
    expect(getWatchlist().map((item) => item.id)).toEqual([949, 550]);
    expect(document.cookie).not.toContain("watchlist=");
  });

  it("does not resurrect a cleared list when the stale cookie cannot be deleted", async () => {
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {});
    const { release, holding } = await holdRosterLock();
    const cleared = clearWatchlist();
    const migration = migrateWatchlist();

    release();
    await holding;

    expect(await cleared).toBe(true);
    expect(await migration).toBe(false);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe("[]");
    expect(getWatchlist()).toEqual([]);
    expect(document.cookie).toContain("watchlist=");
  });

  it("keeps a newer backup restore instead of replacing it with the pending cookie", async () => {
    const backup = parseBackup({
      format: BACKUP_FORMAT,
      watchlist: [{ ...legacy[0], id: 949, title: "Restored Heat" }],
    })!;
    const { release, holding } = await holdRosterLock();
    const restored = restoreBackup(backup);
    const migration = migrateWatchlist();

    release();
    await holding;

    expect(await restored).toEqual({ ok: true });
    expect(await migration).toBe(true);
    expect(getWatchlist().map((item) => item.title)).toEqual(["Restored Heat"]);
    expect(document.cookie).not.toContain("watchlist=");
  });

  it("retains the captured owner when the active pointer changes while waiting", async () => {
    const other = (await createProfile("Someone else"))!;
    initializeProfileStorage();
    const { release, holding } = await holdRosterLock();
    const migration = withProfileStorage(DEFAULT_PROFILE_ID, migrateWatchlist);
    window.localStorage.setItem("active-profile", other.id);

    release();
    await holding;

    expect(await migration).toBe(true);
    expect(getActiveProfileId()).toBe(other.id);
    expect(getWatchlist()).toEqual([]);
    expect(JSON.parse(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY])).toEqual(legacy);
    expect(document.cookie).not.toContain("watchlist=");
  });

  it("rejects a queued migration whose legacy owner was removed by a restore", async () => {
    window.localStorage.setItem("profiles", JSON.stringify([
      { id: DEFAULT_PROFILE_ID, name: "Me" }, { id: "p2", name: "Legacy owner" },
    ]));
    window.localStorage.setItem("active-profile", "p2");
    initializeProfileStorage();
    const backup = parseBackup({
      format: BACKUP_FORMAT,
      activeProfile: { id: DEFAULT_PROFILE_ID, name: "Restored" },
      watchlist: [],
    })!;
    const { release, holding } = await holdRosterLock();
    const restored = restoreBackup(backup);
    const migration = withProfileStorage("p2", migrateWatchlist);

    release();
    await holding;

    expect(await restored).toEqual({ ok: true });
    expect(await migration).toBe(false);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(document.cookie).toContain("watchlist=");
    expect(getWatchlist()).toEqual([]);
  });
});

describe("profile switches with a legacy watchlist cookie", () => {
  it("blocks a switch at quota, then preserves the original profile's list after retry", async () => {
    const other = (await createProfile("Someone else"))!;
    initializeProfileStorage();
    const before = { ...window.localStorage };
    const write = Storage.prototype.setItem;
    const usedBytes = () => Object.entries(window.localStorage).reduce(
      (total, [key, value]) => total + 2 * (key.length + value.length),
      0,
    );
    // Enough for the small switch metadata, but not the legacy watchlist.
    let byteLimit = usedBytes() + 200;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      const old = this.getItem(key);
      const bytes = usedBytes() - (old === null ? 0 : 2 * (key.length + old.length))
        + 2 * (key.length + value.length);
      if (bytes > byteLimit) throw new DOMException("Quota exceeded", "QuotaExceededError");
      write.call(this, key, value);
    });

    expect(getWatchlist()).toEqual(legacy);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(await switchProfileWithResult(other.id)).toEqual({
      ok: false, key: WATCHLIST_STORAGE_KEY, rolledBack: true,
    });
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect({ ...window.localStorage }).toEqual(before);
    expect(document.cookie).toContain("watchlist=");

    byteLimit = Number.POSITIVE_INFINITY;
    expect(await switchProfileWithResult(other.id)).toEqual({ ok: true });
    expect(getWatchlist()).toEqual([]);
    expect(JSON.parse(readProfileSlot(DEFAULT_PROFILE_ID)[WATCHLIST_STORAGE_KEY])).toEqual(legacy);
    expect(document.cookie).not.toContain("watchlist=");
    expect(await switchProfileWithResult(DEFAULT_PROFILE_ID)).toEqual({ ok: true });
    expect(getWatchlist()).toEqual(legacy);
  });

  it("retains the migrated list when the pointer write fails, and switches safely on retry", async () => {
    const other = (await createProfile("Someone else"))!;
    const write = Storage.prototype.setItem;
    let refuse = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "active-profile" && refuse) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      write.call(this, key, value);
    });

    expect(await switchProfileWithResult(other.id)).toEqual({
      ok: false, key: "active-profile", rolledBack: true,
    });
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)!)).toEqual(legacy);
    expect(window.localStorage.getItem("profile-data:default")).toBeNull();
    expect(window.localStorage.getItem(`profile-data:${other.id}`)).toBeNull();
    expect(document.cookie).not.toContain("watchlist=");

    refuse = false;
    expect(await switchProfileWithResult(other.id)).toEqual({ ok: true });
    expect(getWatchlist()).toEqual([]);
    expect(await switchProfileWithResult(DEFAULT_PROFILE_ID)).toEqual({ ok: true });
    expect(getWatchlist()).toEqual(legacy);
  });

  it("keeps the active profile and malformed cookie unchanged", async () => {
    const other = (await createProfile("Someone else"))!;
    document.cookie = "watchlist=%7Bnot-json;path=/";
    initializeProfileStorage();
    const before = { ...window.localStorage };

    expect(await switchProfileWithResult(other.id)).toEqual({
      ok: false, key: WATCHLIST_STORAGE_KEY, rolledBack: true,
    });
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect({ ...window.localStorage }).toEqual(before);
    expect(document.cookie).toContain("watchlist=%7Bnot-json");
  });

  it("blocks a switch while cookie deletion is refused, even after migration was saved", async () => {
    const other = (await createProfile("Someone else"))!;
    const cookieWrite = vi.spyOn(document, "cookie", "set").mockImplementation(() => {});

    expect(await switchProfileWithResult(other.id)).toEqual({
      ok: false, key: WATCHLIST_STORAGE_KEY, rolledBack: true,
    });
    expect(getActiveProfileId()).toBe(DEFAULT_PROFILE_ID);
    expect(JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)!)).toEqual(legacy);
    expect(document.cookie).toContain("watchlist=");

    cookieWrite.mockRestore();
    expect(await switchProfileWithResult(other.id)).toEqual({ ok: true });
    expect(getWatchlist()).toEqual([]);
    expect(document.cookie).not.toContain("watchlist=");
  });
});
