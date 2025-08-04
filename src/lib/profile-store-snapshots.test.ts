// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS_STORAGE_KEY, getCollectionsSnapshot } from "./collections";
import { DAILY_GAME_STORAGE_KEY, EMPTY_STATE, getGameStateSnapshot } from "./daily-game";
import { GOAL_STORAGE_KEY, getGoalSnapshot } from "./goal";
import {
  PROFILE_STORAGE_OWNER_KEY,
  createProfileStoreSnapshot,
  profileStoreKey,
  withProfileStorage,
} from "./profile-storage";
import { RATINGS_STORAGE_KEY, getRatingsSnapshot } from "./ratings";

const timestamp = "2026-01-01T00:00:00Z";
const stores: { name: string; key: string; snapshot: () => unknown; values: unknown[] }[] = [
  {
    name: "ratings",
    key: RATINGS_STORAGE_KEY,
    snapshot: getRatingsSnapshot,
    values: [8, 2, 5].map((rating) => ({ "movie-1": { rating, ratedAt: timestamp } })),
  },
  {
    name: "collections",
    key: COLLECTIONS_STORAGE_KEY,
    snapshot: getCollectionsSnapshot,
    values: ["First", "Second", "Changed"].map((name) => [{
      id: "list-1", name, items: [], createdAt: timestamp, updatedAt: timestamp,
    }]),
  },
  {
    name: "daily game",
    key: DAILY_GAME_STORAGE_KEY,
    snapshot: getGameStateSnapshot,
    values: [1, 2, 3].map((played) => ({ ...EMPTY_STATE, played })),
  },
  {
    name: "yearly goal",
    key: GOAL_STORAGE_KEY,
    snapshot: getGoalSnapshot,
    values: [52, 12, 24].map((target) => ({ year: "2026", target })),
  },
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
  localStorage.setItem("active-profile", "default");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe.each(stores)("profile-scoped $name snapshots", ({ key, snapshot, values }) => {
  it("preserves unchanged references while retained and active owners alternate", () => {
    localStorage.setItem(key, JSON.stringify(values[0]));
    localStorage.setItem(profileStoreKey(key, "p2"), JSON.stringify(values[1]));

    const first = withProfileStorage("default", snapshot);
    localStorage.setItem("active-profile", "p2");
    const second = snapshot();
    expect(first).toEqual(values[0]);
    expect(second).toEqual(values[1]);
    expect(withProfileStorage("default", snapshot)).toBe(first);
    expect(snapshot()).toBe(second);

    localStorage.setItem(profileStoreKey(key, "p2"), JSON.stringify(values[2]));
    const changed = snapshot();
    expect(changed).toEqual(values[2]);
    expect(changed).not.toBe(second);
    expect(withProfileStorage("default", snapshot)).toBe(first);
    expect(snapshot()).toBe(changed);
  });

  it("uses the captured owner when the pointer changes before the store read", () => {
    localStorage.setItem(key, JSON.stringify(values[0]));
    localStorage.setItem(profileStoreKey(key, "p2"), JSON.stringify(values[1]));
    const originalGetItem = Storage.prototype.getItem;
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = originalGetItem.call(this, key);
      if (key === "active-profile") this.setItem(key, "p2");
      return value;
    });

    const first = snapshot();
    read.mockRestore();
    expect(first).toEqual(values[0]);
    expect(snapshot()).toEqual(values[1]);
    expect(withProfileStorage("default", snapshot)).toBe(first);
  });
});

it("bounds retained snapshot owners while keeping recently read profiles stable", () => {
  const parse = vi.fn((raw: string) => JSON.parse(raw) as object);
  const snapshot = createProfileStoreSnapshot("example", {}, parse);
  for (let id = 1; id <= 6; id++) {
    localStorage.setItem(profileStoreKey("example", `p${id}`), '{"value":1}');
  }
  const first = withProfileStorage("p1", snapshot);
  for (let id = 2; id <= 5; id++) withProfileStorage(`p${id}`, snapshot);
  expect(withProfileStorage("p1", snapshot)).toBe(first);
  withProfileStorage("p6", snapshot);
  expect(withProfileStorage("p1", snapshot)).toBe(first);
  expect(parse).toHaveBeenCalledTimes(6);
  withProfileStorage("p2", snapshot);
  expect(parse).toHaveBeenCalledTimes(7);
});
