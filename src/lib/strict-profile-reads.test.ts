// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refuseNextLocalStorageRead } from "../test/storage-faults";
import { COLLECTIONS_STORAGE_KEY, getCollectionsSnapshot } from "./collections";
import { DAILY_GAME_STORAGE_KEY, EMPTY_STATE, getGameState, getGameStateSnapshot } from "./daily-game";
import { EMPTY_RECORD, HIGHER_LOWER_STORAGE_KEY, getRecord } from "./higher-lower";
import { PROFILE_STORAGE_OWNER_KEY, withProfileStorage } from "./profile-storage";
import { RANKING_STORAGE_KEY, getRanking } from "./ranking";
import { RATINGS_STORAGE_KEY, getRatingsSnapshot } from "./ratings";

const timestamp = "2026-01-01T00:00:00.000Z";
const game = { ...EMPTY_STATE, played: 10, won: 8 };
const readers: {
  name: string;
  key: string;
  read: (options?: { strict?: boolean }) => unknown;
  value: unknown;
  empty: unknown;
}[] = [
  { name: "higher or lower", key: HIGHER_LOWER_STORAGE_KEY, read: getRecord, value: { best: 12, totalRounds: 90 }, empty: EMPTY_RECORD },
  { name: "ranking", key: RANKING_STORAGE_KEY, read: getRanking, value: { "movie-1": { rating: 1550, matches: 6 } }, empty: {} },
  { name: "daily game", key: DAILY_GAME_STORAGE_KEY, read: getGameState, value: game, empty: EMPTY_STATE },
  { name: "daily game snapshot", key: DAILY_GAME_STORAGE_KEY, read: getGameStateSnapshot, value: game, empty: EMPTY_STATE },
  {
    name: "collections snapshot", key: COLLECTIONS_STORAGE_KEY, read: getCollectionsSnapshot,
    value: [{ id: "list-1", name: "Saved list", items: [], createdAt: timestamp, updatedAt: timestamp }], empty: [],
  },
  { name: "ratings snapshot", key: RATINGS_STORAGE_KEY, read: getRatingsSnapshot, value: { "movie-1": { rating: 8, ratedAt: timestamp } }, empty: {} },
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe.each(readers)("strict $name reads", ({ key, read, value, empty }) => {
  it("accepts absent stores and reads both current and parked values without writing", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    expect(read({ strict: true })).toEqual(empty);
    expect(writes).not.toHaveBeenCalled();
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem("profile-data:p2", JSON.stringify({ [key]: JSON.stringify(value) }));
    writes.mockClear();

    expect(read({ strict: true })).toEqual(value);
    expect(withProfileStorage("p2", () => read({ strict: true }))).toEqual(value);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["current", "parked"])("rejects malformed %s data even after a tolerant fallback was cached", (source) => {
    const owner = source === "current" ? "default" : "p2";
    for (const raw of ["{broken", ""]) {
      if (source === "current") localStorage.setItem(key, raw);
      else localStorage.setItem("profile-data:p2", JSON.stringify({ [key]: raw }));
      expect(withProfileStorage(owner, () => read())).toEqual(empty);

      const writes = vi.spyOn(Storage.prototype, "setItem");
      expect(() => withProfileStorage(owner, () => read({ strict: true }))).toThrow();
      expect(writes).not.toHaveBeenCalled();
      writes.mockRestore();
    }
  });

  it("propagates a fresh refused read despite cached data while rendering retains its empty fallback", () => {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    expect(read()).toEqual(value);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const refusal = refuseNextLocalStorageRead(key);

    expect(() => read({ strict: true })).toThrow("Storage read refused");
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(raw);
    refusal.mockRestore();
    refuseNextLocalStorageRead(key);
    expect(read()).toEqual(empty);
    expect(read({ strict: true })).toEqual(value);
    expect(writes).not.toHaveBeenCalled();
  });
});
