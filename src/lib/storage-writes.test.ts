import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS_STORAGE_KEY, saveCollections } from "./collections";
import {
  DAILY_GAME_STORAGE_KEY,
  EMPTY_STATE,
  saveGameState,
} from "./daily-game";
import {
  EPISODE_PROGRESS_STORAGE_KEY,
  saveEpisodeProgress,
} from "./episode-progress";
import { GOAL_STORAGE_KEY, saveGoal } from "./goal";
import {
  EMPTY_RECORD,
  HIGHER_LOWER_STORAGE_KEY,
  saveRecord,
} from "./higher-lower";
import { RANKING_STORAGE_KEY, saveRanking } from "./ranking";
import { RATINGS_STORAGE_KEY, saveRatings } from "./ratings";
import { WATCHED_STORAGE_KEY, saveWatched } from "./watched";
import { WATCHLIST_STORAGE_KEY, saveWatchlist } from "./watchlist";
import { PROFILE_STORAGE_OWNER_KEY, profileStoreKey, withProfileStorage } from "./profile-storage";

/**
 * One contract, asserted across every store at once: a write that the browser
 * refused answers `false`.
 *
 * Kept together rather than scattered through nine files because it is a single
 * promise about the whole storage layer, and the bug it exists for was a caller
 * that could not have known: `DataPortability` restored a backup by calling all
 * nine in a row, and seven of them returned `void`. A full quota – or a private
 * window, which refuses every write – meant the visitor was told "Backup
 * restored" over stores that were empty or, worse, half replaced. The backup
 * file is the only copy that exists, so being told the wrong thing there is how
 * someone throws it away.
 *
 * The two that already answered are in the list as well. They are the reason the
 * shape was there to copy, and a regression in them is the same bug.
 */

/** A localStorage that can be made to refuse, as a full quota would. */
class FakeStorage {
  private data = new Map<string, string>();
  failWrites = false;
  failReadKey: string | null = null;

  getItem(key: string): string | null {
    if (key === this.failReadKey) throw new DOMException("Read refused", "SecurityError");
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("QuotaExceededError");
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failWrites) throw new DOMException("QuotaExceededError");
    this.data.delete(key);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Each store, with a value it accepts and the key it writes under. */
const stores: Array<{ name: string; key: string; write: () => boolean }> = [
  {
    name: "watchlist",
    key: WATCHLIST_STORAGE_KEY,
    write: () => saveWatchlist([]),
  },
  { name: "watched", key: WATCHED_STORAGE_KEY, write: () => saveWatched([]) },
  {
    name: "episode progress",
    key: EPISODE_PROGRESS_STORAGE_KEY,
    write: () => saveEpisodeProgress({}),
  },
  { name: "ratings", key: RATINGS_STORAGE_KEY, write: () => saveRatings({}) },
  {
    name: "collections",
    key: COLLECTIONS_STORAGE_KEY,
    write: () => saveCollections([]),
  },
  { name: "ranking", key: RANKING_STORAGE_KEY, write: () => saveRanking({}) },
  {
    name: "goal",
    key: GOAL_STORAGE_KEY,
    write: () => saveGoal({ year: "2026", target: 50 }),
  },
  {
    name: "daily game",
    key: DAILY_GAME_STORAGE_KEY,
    write: () => saveGameState(EMPTY_STATE),
  },
  {
    name: "higher or lower",
    key: HIGHER_LOWER_STORAGE_KEY,
    write: () => saveRecord(EMPTY_RECORD),
  },
];

describe.each(stores)("$name", ({ key, write }) => {
  it("answers true and stores something when the write goes through", () => {
    expect(write()).toBe(true);
    expect(storage.getItem(key)).not.toBeNull();
  });

  // The bug: seven of these returned `void`, so a caller had no way to tell a
  // write that happened from one the browser threw away.
  it("answers false when the browser refuses the write", () => {
    storage.failWrites = true;

    expect(write()).toBe(false);
  });

  it("answers false rather than throwing, so one refusal cannot abort a batch", () => {
    storage.failWrites = true;

    expect(() => write()).not.toThrow();
  });

  it.each(['{"recoverable":true', ""])("refuses to replace malformed current data (%s) with a rendering fallback", (raw) => {
    storage.setItem(key, raw);
    const before = storage.snapshot();

    expect(write()).toBe(false);
    expect(storage.snapshot()).toEqual(before);
  });

  it("does not write after the existing data could not be read", () => {
    storage.setItem(key, '{"recoverable":true}');
    const before = storage.snapshot();
    storage.failReadKey = key;

    expect(write()).toBe(false);
    expect(storage.snapshot()).toEqual(before);
  });

  it.each(['{"recoverable":true', ""])("preserves a malformed parked store (%s) rather than hiding it with a new empty copy", (raw) => {
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
    storage.setItem("profiles", JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    storage.setItem("profile-data:p2", JSON.stringify({ [key]: raw }));
    const before = storage.snapshot();

    expect(withProfileStorage("p2", write)).toBe(false);
    expect(storage.snapshot()).toEqual(before);
    expect(storage.getItem(profileStoreKey(key, "p2"))).toBeNull();
  });
});

describe("with no window at all", () => {
  it("answers false rather than pretending to have stored something", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);

    for (const { name, write } of stores) {
      expect(write(), name).toBe(false);
    }
  });
});
