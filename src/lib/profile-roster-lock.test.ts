// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBDatabase, IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createProfileLockManager } from "../test/profile-locks";
import { PROFILE_ROSTER_LOCK, withProfileRosterLock } from "./profile-roster-lock";
import { addToWatchlist, clearWatchlist, getWatchlist } from "./watchlist";
import { buildBackup, readStoredStores } from "./portable-data";
import { restoreBackup } from "./restore-backup";
import { createProfile, getActiveProfileId, switchProfile } from "./profiles";
import { withProfileStorage } from "./profile-storage";

const DATABASE = "watch-list:profile-locks";
const STORE = "locks";

function openDatabase(): Promise<globalThis.IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Hold a real IndexedDB transaction while callers on other connections queue. */
async function holdTransaction() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE, "readwrite");
  let released = false;
  const finished = new Promise<void>((resolve) => {
    transaction.oncomplete = () => { database.close(); resolve(); };
  });
  await new Promise<void>((resolve) => {
    const keepActive = () => {
      const request = transaction.objectStore(STORE).get(PROFILE_ROSTER_LOCK);
      request.onsuccess = () => {
        resolve();
        if (!released) keepActive();
      };
    };
    keepActive();
  });
  return {
    release: () => { released = true; },
    finished,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("profile storage coordination without Web Locks", () => {
  it("saves separate profiles and exports/restores their data", async () => {
    const movie = {
      id: 550, title: "Fight Club", mediaType: "movie" as const,
      posterPath: "/poster.jpg", voteAverage: 8.4, releaseDate: "1999-10-15",
    };
    expect(await addToWatchlist(movie)).toBe("ok");
    const profile = await createProfile("Alice");
    expect(profile).not.toBeNull();
    expect(await switchProfile(profile!.id)).toBe(true);
    expect(await addToWatchlist({ ...movie, id: 13, title: "Forrest Gump" })).toBe("ok");
    expect(getWatchlist().map((item) => item.id)).toEqual([13]);
    expect(withProfileStorage("default", getWatchlist).map((item) => item.id)).toEqual([550]);

    const backup = await withProfileRosterLock(() => buildBackup({
      stores: readStoredStores("2026-10-06T00:00:00.000Z"),
      activeProfile: profile,
      otherProfiles: [],
      settings: { region: null, watchProviderFilter: null, selectedProviderIds: null },
      exportedAt: "2026-10-06T00:00:00.000Z",
    }), null);
    expect(backup?.watchlist.map((item) => item.id)).toEqual([13]);
    expect(await clearWatchlist()).toBe(true);
    expect(await restoreBackup(backup!)).toEqual({ ok: true });
    expect(getActiveProfileId()).toBe(profile!.id);
    expect(getWatchlist().map((item) => item.id)).toEqual([13]);
  });

  it("queues native and fallback callers from independent modules behind one transaction", async () => {
    const held = await holdTransaction();
    vi.resetModules();
    const firstTab = await import("./profile-roster-lock");
    vi.resetModules();
    const secondTab = await import("./profile-roster-lock");
    const entered = vi.fn(() => {
      const latest = Number(window.localStorage.getItem("count") ?? 0);
      window.localStorage.setItem("count", String(latest + 1));
      return latest + 1;
    });
    const openings = vi.spyOn(indexedDB, "open");
    const first = firstTab.withProfileRosterLock(entered, -1);
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    const second = secondTab.withProfileRosterLock(entered, -1);
    try {
      await vi.waitFor(() => expect(openings).toHaveBeenCalledTimes(2));
      expect(entered).not.toHaveBeenCalled();
    } finally {
      held.release();
    }
    await held.finished;
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(window.localStorage.getItem("count")).toBe("2");
  });

  it("releases the transaction after a failed operation so a queued writer can continue", async () => {
    const first = withProfileRosterLock(() => { throw new Error("Storage refused"); }, false);
    const second = withProfileRosterLock(() => {
      window.localStorage.setItem("saved", "yes");
      return true;
    }, false);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(window.localStorage.getItem("saved")).toBe("yes");
  });

  it("reports a completed localStorage edit accurately even if the coordination transaction aborts", async () => {
    const get = IDBObjectStore.prototype.get;
    let transaction: IDBTransaction | undefined;
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (this: IDBObjectStore, key) {
      transaction = this.transaction;
      return get.call(this, key);
    });
    expect(await withProfileRosterLock(() => {
      window.localStorage.setItem("saved", "yes");
      transaction!.abort();
      return true;
    }, false)).toBe(true);
    expect(window.localStorage.getItem("saved")).toBe("yes");
    expect(await withProfileRosterLock(() => "next", "failed")).toBe("next");
  });

  it("handles a callback that has already aborted its transaction before throwing", async () => {
    const get = IDBObjectStore.prototype.get;
    let transaction: IDBTransaction | undefined;
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (this: IDBObjectStore, key) {
      transaction = this.transaction;
      return get.call(this, key);
    });
    expect(await withProfileRosterLock(() => {
      transaction!.abort();
      throw new Error("Storage refused");
    }, false)).toBe(false);
    expect(await withProfileRosterLock(() => true, false)).toBe(true);
  });

  it.each(["open", "transaction", "get"] as const)("does not edit storage when IndexedDB %s fails", async (stage) => {
    // Initialize before mocking transaction(): fake-indexeddb also uses that
    // public method internally to construct its initial upgrade transaction.
    if (stage !== "open") (await openDatabase()).close();
    const error = new DOMException("Coordination denied", "SecurityError");
    if (stage === "open") vi.spyOn(indexedDB, "open").mockImplementation(() => { throw error; });
    else if (stage === "transaction") vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(() => { throw error; });
    else vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(() => { throw error; });
    const operation = vi.fn(() => window.localStorage.setItem("saved", "yes"));
    expect(await withProfileRosterLock(operation, undefined)).toBeUndefined();
    expect(operation).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("saved")).toBeNull();
  });

  it("does not bypass a refused native lock with IndexedDB", async () => {
    vi.stubGlobal("navigator", { locks: { request: vi.fn().mockRejectedValue(new Error("Lock denied")) } });
    const opening = vi.spyOn(indexedDB, "open");
    const operation = vi.fn(() => true);
    expect(await withProfileRosterLock(operation, false)).toBe(false);
    expect(operation).not.toHaveBeenCalled();
    expect(opening).not.toHaveBeenCalled();
  });

  it("retains native coordination when IndexedDB is absent and refuses when both are absent", async () => {
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    expect(await withProfileRosterLock(() => "saved", "failed")).toBe("saved");
    vi.stubGlobal("navigator", {});
    const operation = vi.fn(() => "saved");
    expect(await withProfileRosterLock(operation, "failed")).toBe("failed");
    expect(operation).not.toHaveBeenCalled();
  });
});
