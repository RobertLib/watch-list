// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/types/tmdb";
import { createProfileLockManager } from "../test/profile-locks";
import { refuseNextLocalStorageRead } from "../test/storage-faults";
import { BACKUP_FORMAT, parseBackup } from "./portable-data";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import { PROFILE_STORAGE_OWNER_KEY, deletedProfileKey, getProfileStorageOwner, profileStoreKey, withProfileStorage } from "./profile-storage";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY, deleteProfile, switchProfile } from "./profiles";
import { RATINGS_STORAGE_KEY, getRatingsSnapshot, subscribeToRatings } from "./ratings";
import { restoreBackup } from "./restore-backup";
import { WATCHED_STORAGE_KEY, getWatched } from "./watched";
import { clearTitleRating, rateTitleAndMarkWatched, setTitleWatched } from "./watched-actions";
import { WATCHLIST_STORAGE_KEY, getWatchlist } from "./watchlist";

const timestamp = "2026-01-01T00:00:00.000Z";
const target: MediaItem = {
  id: 550,
  title: "Fight Club",
  overview: "",
  poster_path: "/poster.jpg",
  backdrop_path: null,
  release_date: "1999-10-15",
  vote_average: 8.4,
  vote_count: 1,
  genre_ids: [],
  media_type: "movie",
};
const storedTarget = {
  id: target.id,
  title: target.title,
  mediaType: target.media_type,
  posterPath: target.poster_path,
  releaseDate: target.release_date,
  voteAverage: target.vote_average,
};
const queuedTarget = { ...storedTarget, addedAt: timestamp };
const other = { ...queuedTarget, id: 27205, title: "Imported other title" };

function readOwner(profileId: string) {
  return withProfileStorage(profileId, () => ({
    watched: getWatched(),
    watchlist: getWatchlist(),
    ratings: getRatingsSnapshot(),
  }));
}

function rawSnapshot(): Record<string, string> {
  return Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
    const key = localStorage.key(index)!;
    return [key, localStorage.getItem(key)!];
  }));
}

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
  return {
    release: async () => {
      release();
      await holding;
    },
  };
}

function incomingBackup() {
  return parseBackup({
    format: BACKUP_FORMAT,
    activeProfile: { id: "default", name: "Imported owner" },
    otherProfiles: [{ id: "p2", name: "Second owner" }],
    watchlist: [queuedTarget, other],
    watched: [],
    ratings: {
      "movie-550": { rating: 2, ratedAt: timestamp },
      "movie-27205": { rating: 6, ratedAt: timestamp },
    },
  })!;
}

function refuseWrite(key: string) {
  const write = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, address, value) {
    if (address === key) throw new DOMException("QuotaExceededError");
    write.call(this, address, value);
  });
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = "watchlist=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
    { id: "default", name: "Me" }, { id: "p2", name: "Second owner" },
  ]));
  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
  localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([queuedTarget]));
  localStorage.setItem(WATCHED_STORAGE_KEY, "[]");
  localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify({
    "movie-44": { rating: 4, ratedAt: timestamp },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("watched actions ordered with backup restore", () => {
  it.each(["rate", "clear"])("preserves every store with zero writes when a %s action's first ratings read is refused", async (action) => {
    const before = rawSnapshot();
    // A render already has a cached valid map; a mutation must still read anew.
    getRatingsSnapshot();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removals = vi.spyOn(Storage.prototype, "removeItem");
    refuseNextLocalStorageRead(RATINGS_STORAGE_KEY);

    if (action === "rate") {
      expect(await rateTitleAndMarkWatched("default", target, 9)).toEqual({ status: "rating-failed" });
    } else {
      expect(await clearTitleRating("default", 44, "movie")).toBe(false);
    }
    expect(writes).not.toHaveBeenCalled();
    expect(removals).not.toHaveBeenCalled();
    expect(rawSnapshot()).toEqual(before);
  });

  it.each([WATCHLIST_STORAGE_KEY, WATCHED_STORAGE_KEY])("does not partly mark a title when %s is malformed", async (key) => {
    for (const raw of [localStorage.getItem(key)!.slice(0, -1), ""]) {
      localStorage.setItem(key, raw);
      const before = rawSnapshot();

      expect(await setTitleWatched("default", target, false)).toEqual({ status: "failed" });
      expect(rawSnapshot()).toEqual(before);
    }
  });

  it.each([WATCHLIST_STORAGE_KEY, WATCHED_STORAGE_KEY, RATINGS_STORAGE_KEY])("does not partly rate a title when %s is malformed", async (key) => {
    for (const raw of [localStorage.getItem(key)!.slice(0, -1), ""]) {
      localStorage.setItem(key, raw);
      const before = rawSnapshot();

      expect(await rateTitleAndMarkWatched("default", target, 9)).toEqual({
        status: key === RATINGS_STORAGE_KEY ? "rating-failed" : "failed",
      });
      expect(rawSnapshot()).toEqual(before);
    }
  });

  it("preserves unreadable ratings when clearing a score", async () => {
    localStorage.setItem(RATINGS_STORAGE_KEY, localStorage.getItem(RATINGS_STORAGE_KEY)!.slice(0, -1));
    const before = rawSnapshot();

    expect(await clearTitleRating("default", target.id, target.media_type)).toBe(false);
    expect(rawSnapshot()).toEqual(before);
  });

  it("marks the restored owner's title and removes its restored queue entry after a real restore", async () => {
    const request = vi.spyOn(navigator.locks, "request");
    const holder = await holdRosterLock();
    const restore = restoreBackup(incomingBackup());
    const action = setTitleWatched("default", target, false);

    expect(readOwner("default").watched).toEqual([]);
    expect(readOwner("default").watchlist.map((item) => item.id)).toEqual([550]);
    await holder.release();

    expect(await restore).toEqual({ ok: true });
    expect(await action).toEqual({ status: "ok", removedFromWatchlist: true });
    const final = readOwner("default");
    expect(final.watched).toEqual([expect.objectContaining(storedTarget)]);
    expect(final.watchlist).toEqual([other]);
    expect(final.ratings).toEqual(incomingBackup().ratings);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every(([name]) => name === PROFILE_ROSTER_LOCK)).toBe(true);
  });

  it("rates fresh imported data and marks/removes the title as one action after a real restore", async () => {
    const request = vi.spyOn(navigator.locks, "request");
    const holder = await holdRosterLock();
    const restore = restoreBackup(incomingBackup());
    const action = rateTitleAndMarkWatched("default", target, 9);

    expect(readOwner("default").ratings["movie-550"]).toBeUndefined();
    expect(readOwner("default").watched).toEqual([]);
    await holder.release();

    expect(await restore).toEqual({ ok: true });
    expect(await action).toEqual({ status: "ok", wasWatched: false, wasQueued: true });
    const final = readOwner("default");
    expect(final.watched).toEqual([expect.objectContaining(storedTarget)]);
    expect(final.watchlist).toEqual([other]);
    expect(final.ratings["movie-550"].rating).toBe(9);
    expect(final.ratings["movie-27205"]).toEqual({ rating: 6, ratedAt: timestamp });
    expect(final.ratings["movie-44"]).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("clears the imported rating after a real restore without losing other imported ratings", async () => {
    const request = vi.spyOn(navigator.locks, "request");
    const holder = await holdRosterLock();
    const restore = restoreBackup(incomingBackup());
    const action = clearTitleRating("default", target.id, target.media_type);
    await holder.release();

    expect(await restore).toEqual({ ok: true });
    expect(await action).toBe(true);
    const final = readOwner("default");
    expect(final.ratings).toEqual({ "movie-27205": { rating: 6, ratedAt: timestamp } });
    expect(final.watchlist).toEqual([queuedTarget, other]);
    expect(final.watched).toEqual([]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("reports a stale watched state after the queued restore rather than toggling its new data", async () => {
    localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([{ ...storedTarget, watchedAt: timestamp }]));
    const holder = await holdRosterLock();
    const restore = restoreBackup(incomingBackup());
    const action = setTitleWatched("default", target, true);
    await holder.release();

    expect(await restore).toEqual({ ok: true });
    const restored = rawSnapshot();
    expect(await action).toEqual({ status: "changed" });
    expect(rawSnapshot()).toEqual(restored);
    expect(readOwner("default").watchlist).toEqual([queuedTarget, other]);
    expect(readOwner("default").watched).toEqual([]);
  });
});

describe("retained action owners", () => {
  const commands = [
    { name: "mark watched", run: (owner: string) => setTitleWatched(owner, target, false), unavailable: { status: "profile-unavailable" } },
    { name: "rate and mark watched", run: (owner: string) => rateTitleAndMarkWatched(owner, target, 9), unavailable: { status: "profile-unavailable" } },
    { name: "clear rating", run: (owner: string) => clearTitleRating(owner, target.id, target.media_type), unavailable: false },
  ];

  it.each(commands)("rejects $name for an owner deleted while the action waits", async ({ run, unavailable }) => {
    localStorage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"), JSON.stringify([queuedTarget]));
    localStorage.setItem(profileStoreKey(RATINGS_STORAGE_KEY, "p2"), JSON.stringify({
      "movie-550": { rating: 3, ratedAt: timestamp },
    }));
    const holder = await holdRosterLock();
    const deletion = deleteProfile("p2");
    const action = run("p2");
    expect(localStorage.getItem(deletedProfileKey("p2"))).toBeNull();
    const originalOwner = readOwner("default");
    await holder.release();

    expect(await deletion).toBe(true);
    expect(await action).toEqual(unavailable);
    expect(localStorage.getItem(deletedProfileKey("p2"))).toBe("true");
    for (const key of [WATCHLIST_STORAGE_KEY, WATCHED_STORAGE_KEY, RATINGS_STORAGE_KEY]) {
      expect(localStorage.getItem(profileStoreKey(key, "p2"))).toBeNull();
    }
    expect(readOwner("default")).toEqual(originalOwner);
  });

  it.each(commands)("keeps $name on its rendered owner when a queued profile switch finishes first", async ({ run }) => {
    localStorage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"), JSON.stringify([other]));
    localStorage.setItem(profileStoreKey(WATCHED_STORAGE_KEY, "p2"), "[]");
    localStorage.setItem(profileStoreKey(RATINGS_STORAGE_KEY, "p2"), JSON.stringify({
      "movie-550": { rating: 3, ratedAt: timestamp },
    }));
    localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify({ "movie-550": { rating: 5, ratedAt: timestamp } }));
    const secondOwner = readOwner("p2");
    const holder = await holdRosterLock();
    const switched = switchProfile("p2");
    const action = run("default");
    const initial = readOwner("default");
    await holder.release();

    expect(await switched).toBe(true);
    const result = await action;
    expect(result).not.toEqual({ status: "profile-unavailable" });
    expect(result).not.toBe(false);
    expect(getProfileStorageOwner()).toBe("p2");
    expect(readOwner("p2")).toEqual(secondOwner);
    expect(readOwner("default")).not.toEqual(initial);
  });

  it("publishes rating notifications outside the retained owner scope with the active owner's complete snapshots", async () => {
    localStorage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"), JSON.stringify([other]));
    localStorage.setItem(profileStoreKey(WATCHED_STORAGE_KEY, "p2"), "[]");
    localStorage.setItem(profileStoreKey(RATINGS_STORAGE_KEY, "p2"), JSON.stringify({
      "movie-27205": { rating: 3, ratedAt: timestamp },
    }));
    const secondOwner = readOwner("p2");
    const snapshots: ReturnType<typeof readOwner>[] = [];
    const owners: string[] = [];
    const stop = subscribeToRatings(() => {
      owners.push(getProfileStorageOwner());
      snapshots.push({ ratings: getRatingsSnapshot(), watched: getWatched(), watchlist: getWatchlist() });
    });
    try {
      const holder = await holdRosterLock();
      const switched = switchProfile("p2");
      const action = rateTitleAndMarkWatched("default", target, 9);
      await holder.release();

      expect(await switched).toBe(true);
      expect(await action).toEqual({ status: "ok", wasWatched: false, wasQueued: true });
      expect(owners).toEqual(["p2", "p2"]);
      expect(snapshots).toEqual([secondOwner, secondOwner]);
      expect(readOwner("default").ratings["movie-550"].rating).toBe(9);
    } finally {
      stop();
    }
  });
});

describe("watched action refusal and state changes", () => {
  it("migrates each edited parked store in a rating action while retaining unrelated progress", async () => {
    localStorage.setItem("profile-data:p2", JSON.stringify({
      watchlist: JSON.stringify([queuedTarget, other]),
      watched: "[]",
      ratings: JSON.stringify({ "movie-44": { rating: 4, ratedAt: timestamp } }),
      "episode-progress": JSON.stringify({ "1399": { tvId: 1399, name: "Other show", seasons: { "1": [1] }, updatedAt: timestamp } }),
    }));

    expect(await rateTitleAndMarkWatched("p2", target, 9)).toEqual({
      status: "ok", wasWatched: false, wasQueued: true,
    });
    const final = readOwner("p2");
    expect(final.watchlist).toEqual([other]);
    expect(final.watched).toEqual([expect.objectContaining(storedTarget)]);
    expect(final.ratings["movie-550"].rating).toBe(9);
    expect(final.ratings["movie-44"].rating).toBe(4);
    expect(Object.keys(JSON.parse(localStorage.getItem("profile-data:p2")!))).toEqual(["episode-progress"]);
  });

  it("keeps a queued title when the watched write is refused", async () => {
    refuseWrite(WATCHED_STORAGE_KEY);
    const before = rawSnapshot();
    expect(await setTitleWatched("default", target, false)).toEqual({ status: "failed" });
    expect(rawSnapshot()).toEqual(before);
  });

  it("reports a queue refusal while retaining the successful watched write", async () => {
    refuseWrite(WATCHLIST_STORAGE_KEY);
    expect(await setTitleWatched("default", target, false)).toEqual({ status: "watchlist-failed" });
    expect(readOwner("default").watched).toEqual([expect.objectContaining(storedTarget)]);
    expect(readOwner("default").watchlist).toEqual([queuedTarget]);
  });

  it("does not change watched or queued data when the rating write is refused", async () => {
    refuseWrite(RATINGS_STORAGE_KEY);
    const before = rawSnapshot();
    expect(await rateTitleAndMarkWatched("default", target, 9)).toEqual({ status: "rating-failed" });
    expect(rawSnapshot()).toEqual(before);
  });

  it("reports a refused watched write after preserving the successful rating", async () => {
    refuseWrite(WATCHED_STORAGE_KEY);
    expect(await rateTitleAndMarkWatched("default", target, 9)).toEqual({ status: "watched-failed" });
    const final = readOwner("default");
    expect(final.ratings["movie-550"].rating).toBe(9);
    expect(final.ratings["movie-44"]).toEqual({ rating: 4, ratedAt: timestamp });
    expect(final.watched).toEqual([]);
    expect(final.watchlist).toEqual([queuedTarget]);
  });

  it("reports a refused queue removal after preserving the successful rating and watched writes", async () => {
    refuseWrite(WATCHLIST_STORAGE_KEY);
    expect(await rateTitleAndMarkWatched("default", target, 9)).toEqual({
      status: "watchlist-failed", wasWatched: false, wasQueued: true,
    });
    const final = readOwner("default");
    expect(final.ratings["movie-550"].rating).toBe(9);
    expect(final.watched).toEqual([expect.objectContaining(storedTarget)]);
    expect(final.watchlist).toEqual([queuedTarget]);
  });

  it("preserves a rating when clearing it is refused", async () => {
    localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify({ "movie-550": { rating: 5, ratedAt: timestamp } }));
    refuseWrite(RATINGS_STORAGE_KEY);
    const before = rawSnapshot();
    expect(await clearTitleRating("default", target.id, target.media_type)).toBe(false);
    expect(rawSnapshot()).toEqual(before);
  });

  it("returns changed without writes when another action already marked the title", async () => {
    expect(await setTitleWatched("default", target, false)).toEqual({ status: "ok", removedFromWatchlist: true });
    const before = rawSnapshot();
    expect(await setTitleWatched("default", target, false)).toEqual({ status: "changed" });
    expect(rawSnapshot()).toEqual(before);
  });

  it("unmarks only the matching media type and leaves ratings and queue entries intact", async () => {
    localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([
      { ...storedTarget, watchedAt: timestamp },
      { ...storedTarget, mediaType: "tv", watchedAt: timestamp },
    ]));
    const before = readOwner("default");
    expect(await setTitleWatched("default", target, true)).toEqual({ status: "ok", removedFromWatchlist: false });
    const final = readOwner("default");
    expect(final.watched).toEqual([{ ...storedTarget, mediaType: "tv", watchedAt: timestamp }]);
    expect(final.ratings).toEqual(before.ratings);
    expect(final.watchlist).toEqual(before.watchlist);
  });

  it("updates an already watched title's rating without replacing its watched timestamp", async () => {
    const watched = { ...storedTarget, watchedAt: timestamp };
    localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([watched]));
    expect(await rateTitleAndMarkWatched("default", target, 8)).toEqual({ status: "ok", wasWatched: true, wasQueued: true });
    expect(readOwner("default").watched).toEqual([watched]);
    expect(readOwner("default").watchlist).toEqual([]);
  });

  it.each([
    undefined,
    { request: () => Promise.reject(new Error("Denied")) },
  ])("does not write when the browser cannot grant the shared lock", async (locks) => {
    vi.stubGlobal("navigator", { locks });
    const before = rawSnapshot();
    expect(await setTitleWatched("default", target, false)).toEqual({ status: "failed" });
    expect(await rateTitleAndMarkWatched("default", target, 9)).toEqual({ status: "failed" });
    expect(await clearTitleRating("default", target.id, target.media_type)).toBe(false);
    expect(rawSnapshot()).toEqual(before);
  });
});
