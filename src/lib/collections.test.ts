import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "../test/profile-locks";
import {
  addToCollection,
  createCollection,
  deleteCollection,
  isInCollection,
  MAX_COLLECTION_ITEMS,
  MAX_COLLECTION_NAME_LENGTH,
  MAX_COLLECTIONS,
  removeFromCollection,
  renameCollection,
  sanitizeCollections,
  toSharedRefs,
  type Collection,
  type CollectionItem,
} from "./collections";

const NOW = "2026-08-01T12:00:00.000Z";

const item = (id: number, mediaType: "movie" | "tv" = "movie"): CollectionItem => ({
  id,
  mediaType,
  title: `Title ${id}`,
  posterPath: null,
});

function withOne(name = "October horror"): Collection[] {
  return createCollection([], name, [item(1)], NOW);
}

describe("createCollection", () => {
  it("puts the newest list first", () => {
    const collections = createCollection(withOne("First"), "Second", [], NOW);

    expect(collections.map((c) => c.name)).toEqual(["Second", "First"]);
  });

  it("refuses a list with no name", () => {
    expect(createCollection([], "   ", [], NOW)).toEqual([]);
  });

  it("trims a name and strips control characters", () => {
    const [collection] = createCollection([], "  Best\u0000 of\n2026 ", [], NOW);

    expect(collection.name).toBe("Best of 2026");
  });

  it("bounds the name", () => {
    const [collection] = createCollection([], "x".repeat(500), [], NOW);

    expect(collection.name).toHaveLength(MAX_COLLECTION_NAME_LENGTH);
  });

  it("stops once there are too many lists", () => {
    let collections: Collection[] = [];
    for (let index = 0; index < MAX_COLLECTIONS + 5; index++) {
      collections = createCollection(collections, `List ${index}`, [], NOW);
    }

    expect(collections).toHaveLength(MAX_COLLECTIONS);
  });

  it("gives each list its own id", () => {
    const collections = createCollection(withOne(), "Another", [], NOW);

    expect(collections[0].id).not.toBe(collections[1].id);
  });
});

describe("collection creation in independent tabs", () => {
  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    vi.stubGlobal("indexedDB", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves both lists and their titles when fallback counters collide", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    vi.resetModules();
    const first = await import("./collections");
    const firstLock = (await import("./profile-roster-lock")).withProfileRosterLock;
    vi.resetModules();
    const second = await import("./collections");
    const secondLock = (await import("./profile-roster-lock")).withProfileRosterLock;
    expect(first.createCollection).not.toBe(second.createCollection);

    const [firstId, secondId] = await Promise.all([
      firstLock(() => {
        const next = first.createCollection(first.getCollectionsSnapshot(), "First", [item(1)], NOW);
        expect(first.saveCollections(next)).toBe(true);
        return next[0].id;
      }, null),
      secondLock(() => {
        const latest = second.getCollectionsSnapshot();
        expect(latest).toHaveLength(1);
        const next = second.createCollection(latest, "Second", [item(2)], NOW);
        expect(second.saveCollections(next)).toBe(true);
        return next[0].id;
      }, null),
    ]);

    expect(firstId).not.toBeNull();
    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);
    const saved = second.getCollectionsSnapshot();
    expect(saved.map((collection) => collection.name)).toEqual(["Second", "First"]);
    expect(saved.find((collection) => collection.id === firstId)?.items).toEqual([item(1)]);

    expect(await secondLock(() => second.saveCollections(
      second.renameCollection(second.getCollectionsSnapshot(), secondId!, "Renamed", NOW),
    ), false)).toBe(true);
    const afterEdit = first.getCollectionsSnapshot();
    expect(afterEdit.map((collection) => collection.name)).toEqual(["Renamed", "First"]);
    expect(afterEdit.find((collection) => collection.id === firstId)?.items).toEqual([item(1)]);
    expect(afterEdit.find((collection) => collection.id === secondId)?.items).toEqual([item(2)]);
  });

  it("leaves existing lists untouched when no unique ID can be generated", () => {
    const collections = withOne();
    const generateId = vi.fn(() => collections[0].id);
    vi.stubGlobal("crypto", { randomUUID: generateId });

    expect(createCollection(collections, "Another", [item(2)], NOW)).toBe(collections);
    expect(generateId.mock.calls.length).toBeLessThanOrEqual(MAX_COLLECTIONS + 1);
    expect(collections[0].items).toEqual([item(1)]);
  });
});

describe("renameCollection", () => {
  it("renames the one named", () => {
    const collections = withOne();
    const renamed = renameCollection(
      collections,
      collections[0].id,
      "Halloween",
      NOW,
    );

    expect(renamed[0].name).toBe("Halloween");
  });

  it("ignores an empty name rather than erasing the old one", () => {
    const collections = withOne();
    const renamed = renameCollection(collections, collections[0].id, "  ", NOW);

    expect(renamed[0].name).toBe("October horror");
  });
});

describe("deleteCollection", () => {
  it("removes only the one named", () => {
    const collections = createCollection(withOne("Keep"), "Drop", [], NOW);
    const remaining = deleteCollection(collections, collections[0].id);

    expect(remaining.map((c) => c.name)).toEqual(["Keep"]);
  });
});

describe("addToCollection", () => {
  it("appends a title", () => {
    const collections = withOne();
    const updated = addToCollection(collections, collections[0].id, item(2), NOW);

    expect(updated[0].items.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it("does not add the same title twice", () => {
    const collections = withOne();
    const updated = addToCollection(collections, collections[0].id, item(1), NOW);

    expect(updated[0].items).toHaveLength(1);
  });

  it("tells a film from a series with the same id", () => {
    const collections = withOne();
    const updated = addToCollection(
      collections,
      collections[0].id,
      item(1, "tv"),
      NOW,
    );

    expect(updated[0].items).toHaveLength(2);
  });

  it("stops at the share-link bound", () => {
    let collections = createCollection([], "Long", [], NOW);
    for (let id = 1; id <= MAX_COLLECTION_ITEMS + 10; id++) {
      collections = addToCollection(collections, collections[0].id, item(id), NOW);
    }

    expect(collections[0].items).toHaveLength(MAX_COLLECTION_ITEMS);
  });

  it("leaves other lists alone", () => {
    const collections = createCollection(withOne("A"), "B", [], NOW);
    const updated = addToCollection(collections, collections[0].id, item(9), NOW);

    expect(updated[1].items).toHaveLength(1);
  });
});

describe("removeFromCollection", () => {
  it("removes the title named", () => {
    const collections = withOne();
    const updated = removeFromCollection(
      collections,
      collections[0].id,
      1,
      "movie",
    );

    expect(updated[0].items).toEqual([]);
  });

  it("does not remove the series of the same id", () => {
    let collections = withOne();
    collections = addToCollection(
      collections,
      collections[0].id,
      item(1, "tv"),
      NOW,
    );
    const updated = removeFromCollection(
      collections,
      collections[0].id,
      1,
      "movie",
    );

    expect(updated[0].items.map((entry) => entry.mediaType)).toEqual(["tv"]);
  });
});

describe("isInCollection", () => {
  it("answers for both media types separately", () => {
    const [collection] = withOne();

    expect(isInCollection(collection, 1, "movie")).toBe(true);
    expect(isInCollection(collection, 1, "tv")).toBe(false);
  });
});

describe("toSharedRefs", () => {
  it("keeps the list's own order", () => {
    let collections = createCollection([], "Order", [item(3)], NOW);
    collections = addToCollection(collections, collections[0].id, item(1), NOW);

    expect(toSharedRefs(collections[0])).toEqual([
      { id: 3, mediaType: "movie" },
      { id: 1, mediaType: "movie" },
    ]);
  });
});

describe("sanitizeCollections", () => {
  it("round-trips what was written", () => {
    const collections = withOne();

    expect(sanitizeCollections(collections)).toEqual(collections);
  });

  it("drops a list with no id or no name", () => {
    expect(
      sanitizeCollections([
        { id: "", name: "Nameable", items: [] },
        { id: "x", name: "", items: [] },
      ]),
    ).toEqual([]);
  });

  it("keeps a good list next to a broken one", () => {
    const result = sanitizeCollections([
      { id: "a", name: "Good", items: [item(1)], createdAt: NOW, updatedAt: NOW },
      "not a collection",
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Good");
  });

  it("drops duplicate ids, which would be unaddressable", () => {
    const result = sanitizeCollections([
      { id: "a", name: "First", items: [] },
      { id: "a", name: "Second", items: [] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("First");
  });

  it("drops malformed items but keeps the list", () => {
    const result = sanitizeCollections([
      {
        id: "a",
        name: "Mixed",
        items: [item(1), { id: -3, mediaType: "movie" }, { id: 4 }],
      },
    ]);

    expect(result[0].items.map((entry) => entry.id)).toEqual([1]);
  });

  it("returns nothing for a non-array", () => {
    expect(sanitizeCollections(null)).toEqual([]);
    expect(sanitizeCollections({ id: "a" })).toEqual([]);
  });
});
