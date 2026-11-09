import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFilename,
  buildBackup,
  describeUnreadable,
  EMPTY_STORES,
  MAX_BACKUP_FILE_BYTES,
  parseBackup,
  sanitizePortableProfiles,
  sanitizePortableSettings,
  sanitizeWatchedItems,
  sanitizeWatchlistItems,
  storesFromSlot,
  storesToSlot,
  summarizeBackup,
} from "./portable-data";

const EXPORTED_AT = "2026-08-01T12:00:00.000Z";

const watchlistItem = {
  id: 550,
  title: "Fight Club",
  mediaType: "movie" as const,
  posterPath: "/poster.jpg",
  voteAverage: 8.4,
  releaseDate: "1999-10-15",
  addedAt: "2026-07-01T00:00:00.000Z",
};

const watchedItem = {
  id: 1396,
  title: "Breaking Bad",
  mediaType: "tv" as const,
  posterPath: null,
  voteAverage: 8.9,
  releaseDate: "2008-01-20",
  watchedAt: "2026-07-15T00:00:00.000Z",
};

const progress = {
  "1396": {
    tvId: 1396,
    name: "Breaking Bad",
    posterPath: null,
    seasons: { "1": [1, 2, 3] },
    updatedAt: EXPORTED_AT,
  },
};

function fullBackup() {
  return buildBackup({
    stores: {
      ...EMPTY_STORES,
      watchlist: [watchlistItem],
      watched: [watchedItem],
      episodeProgress: progress,
      ratings: { "movie-550": { rating: 9, ratedAt: EXPORTED_AT } },
      collections: [
        {
          id: "list-1",
          name: "October horror",
          items: [
            {
              id: 550,
              mediaType: "movie" as const,
              title: "Fight Club",
              posterPath: null,
            },
          ],
          createdAt: EXPORTED_AT,
          updatedAt: EXPORTED_AT,
        },
      ],
      ranking: { "movie-550": { rating: 1600, matches: 4 } },
      goal: { year: "2026", target: 52 },
    },
    activeProfile: { id: "default", name: "Me" },
    otherProfiles: [],
    settings: {
      region: "CZ",
      watchProviderFilter: "streaming-only",
      selectedProviderIds: [8, 337],
    },
    exportedAt: EXPORTED_AT,
  });
}

describe("sanitizeWatchlistItems", () => {
  it("keeps a well-formed entry", () => {
    expect(sanitizeWatchlistItems([watchlistItem], EXPORTED_AT)).toEqual([
      watchlistItem,
    ]);
  });

  it("returns nothing for input that is not a list", () => {
    expect(sanitizeWatchlistItems(undefined, EXPORTED_AT)).toEqual([]);
    expect(sanitizeWatchlistItems({ id: 550 }, EXPORTED_AT)).toEqual([]);
    expect(sanitizeWatchlistItems("[]", EXPORTED_AT)).toEqual([]);
  });

  it("drops entries without a usable id or media type", () => {
    expect(
      sanitizeWatchlistItems(
        [
          { id: 0, mediaType: "movie" },
          { id: "550", mediaType: "movie" },
          { id: 1.5, mediaType: "movie" },
          { id: 550, mediaType: "person" },
          { id: 550 },
          null,
        ],
        EXPORTED_AT,
      ),
    ).toEqual([]);
  });

  it("de-duplicates but keeps the same id across media types", () => {
    const items = sanitizeWatchlistItems(
      [
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "movie" },
        { id: 550, mediaType: "tv" },
      ],
      EXPORTED_AT,
    );

    expect(items).toHaveLength(2);
  });

  it("replaces missing metadata with usable defaults", () => {
    const [item] = sanitizeWatchlistItems(
      [{ id: 550, mediaType: "movie" }],
      EXPORTED_AT,
    );

    expect(item).toEqual({
      id: 550,
      mediaType: "movie",
      title: "",
      posterPath: null,
      voteAverage: 0,
      releaseDate: "",
      addedAt: EXPORTED_AT,
    });
  });

  it("dates an entry with an unusable timestamp to the export", () => {
    const [item] = sanitizeWatchlistItems(
      [{ ...watchlistItem, addedAt: "yesterday" }],
      EXPORTED_AT,
    );

    expect(item.addedAt).toBe(EXPORTED_AT);
  });

  it("caps a list long enough to be a problem", () => {
    const many = Array.from({ length: 5000 }, (_, index) => ({
      id: index + 1,
      mediaType: "movie" as const,
    }));

    expect(sanitizeWatchlistItems(many, EXPORTED_AT)).toHaveLength(2000);
  });
});

describe("sanitizeWatchedItems", () => {
  it("uses its own timestamp field", () => {
    const [item] = sanitizeWatchedItems([watchedItem], EXPORTED_AT);

    expect(item.watchedAt).toBe(watchedItem.watchedAt);
    expect(item).not.toHaveProperty("addedAt");
  });
});

describe("sanitizePortableSettings", () => {
  it("keeps valid settings", () => {
    expect(
      sanitizePortableSettings({
        region: "CZ",
        watchProviderFilter: "streaming-only",
        selectedProviderIds: [8, 337],
      }),
    ).toEqual({
      region: "CZ",
      watchProviderFilter: "streaming-only",
      selectedProviderIds: [8, 337],
    });
  });

  it("nulls out values it does not recognise", () => {
    expect(
      sanitizePortableSettings({
        region: "Narnia",
        watchProviderFilter: "everything",
        selectedProviderIds: ["8"],
      }),
    ).toEqual({
      region: null,
      watchProviderFilter: null,
      selectedProviderIds: [],
    });
  });

  it("copes with no settings at all", () => {
    expect(sanitizePortableSettings(undefined)).toEqual({
      region: null,
      watchProviderFilter: null,
      selectedProviderIds: null,
    });
  });

  it("distinguishes no platform setting from an explicitly empty selection", () => {
    expect(sanitizePortableSettings({}).selectedProviderIds).toBeNull();
    expect(
      sanitizePortableSettings({ selectedProviderIds: [] }).selectedProviderIds,
    ).toEqual([]);
  });

  it.each([false, true])("preserves an explicit configuration flag of %s", (hasCustomSettings) => {
    expect(sanitizePortableSettings({ hasCustomSettings })).toEqual({
      region: null,
      watchProviderFilter: null,
      selectedProviderIds: null,
      hasCustomSettings,
    });
  });

  it.each([undefined, null, "false", "true", 0, 1, {}, []])(
    "leaves an absent or invalid configuration flag unspecified (%j)",
    (hasCustomSettings) => {
      expect(sanitizePortableSettings({ hasCustomSettings })).not.toHaveProperty("hasCustomSettings");
    },
  );
});

describe("parseBackup", () => {
  it("round-trips a backup through JSON", () => {
    const backup = fullBackup();

    expect(parseBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });

  it.each([false, true])("round-trips the configuration flag of %s through JSON", (hasCustomSettings) => {
    const backup = fullBackup();
    backup.settings.hasCustomSettings = hasCustomSettings;

    expect(parseBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });

  it("keeps an undated entry undated, and dates only entries with no timestamp at all", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      exportedAt: "2026-03-01T00:00:00.000Z",
      watchlist: [
        { id: 1, title: "Undated", mediaType: "movie", addedAt: "" },
        { id: 2, title: "Missing", mediaType: "movie" },
        { id: 3, title: "Garbled", mediaType: "movie", addedAt: "not a date" },
        { id: 4, title: "Dated", mediaType: "movie", addedAt: "2026-01-01T00:00:00.000Z" },
      ],
      watched: [{ id: 5, title: "Undated", mediaType: "tv", watchedAt: "" }],
    })!;

    expect(parsed.watchlist.map((item) => item.addedAt)).toEqual([
      "", "2026-03-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ]);
    expect(parsed.watched.map((item) => item.watchedAt)).toEqual([""]);
  });

  it("refuses a file that is not one of ours", () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup([])).toBeNull();
    expect(parseBackup({})).toBeNull();
    expect(parseBackup({ format: "letterboxd-export" })).toBeNull();
    // A bare array of titles is a plausible mistake, and has to be refused
    // rather than silently imported as nothing.
    expect(parseBackup([watchlistItem])).toBeNull();
  });

  it("accepts a file from a later release, keeping what it understands", () => {
    const future = {
      ...fullBackup(),
      version: 99,
      somethingNew: { unknown: true },
    };

    const parsed = parseBackup(future);

    expect(parsed?.version).toBe(99);
    expect(parsed?.watchlist).toHaveLength(1);
    expect(parsed).not.toHaveProperty("somethingNew");
  });

  it("survives a file whose sections are missing or wrong", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: EXPORTED_AT,
      watchlist: "nope",
      episodeProgress: [1, 2, 3],
    });

    expect(parsed).toEqual({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: EXPORTED_AT,
      ...EMPTY_STORES,
      activeProfile: null,
      otherProfiles: [],
      settings: {
        region: null,
        watchProviderFilter: null,
        selectedProviderIds: null,
      },
    });
  });

  it("falls back to the epoch when the export has no usable date", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      exportedAt: "whenever",
      watchlist: [{ id: 550, mediaType: "movie" }],
    });

    expect(parsed?.exportedAt).toBe("");
    expect(parsed?.watchlist[0].addedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("round-trips all titles when an active or parked list exceeds 2000 entries", () => {
    const watchlist = Array.from({ length: 2001 }, (_, index) => ({
      ...watchlistItem,
      id: index + 1,
    }));
    const watched = Array.from({ length: 2001 }, (_, index) => ({
      ...watchedItem,
      id: index + 1,
    }));
    const stores = { ...EMPTY_STORES, watchlist, watched };
    const dormantStores = storesFromSlot(storesToSlot(stores), EXPORTED_AT);
    expect(dormantStores.watchlist).toEqual(watchlist);
    expect(dormantStores.watched).toEqual(watched);

    const backup = {
      ...fullBackup(),
      ...stores,
      otherProfiles: [{ id: "p2", name: "Other", ...dormantStores }],
    };
    const restored = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored?.watchlist).toEqual(watchlist);
    expect(restored?.watched).toEqual(watched);
    expect(restored?.otherProfiles[0].watchlist).toEqual(watchlist);
    expect(restored?.otherProfiles[0].watched).toEqual(watched);
  });
});

describe("profiles in a backup", () => {
  it("preserves lifetime archive wins after their boards disappear in both profiles", () => {
    const activeDays = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"];
    const parkedDays = ["2026-08-06", "2026-08-07"];
    const parkedStores = {
      ...EMPTY_STORES,
      dailyGame: { ...EMPTY_STORES.dailyGame, archiveWonDays: parkedDays },
    };
    const source = fullBackup();
    const backup = {
      ...source,
      dailyGame: { ...source.dailyGame, archiveWonDays: activeDays },
      otherProfiles: [{ ...parkedStores, id: "other", name: "Sam" }],
    };

    const restored = parseBackup(JSON.parse(JSON.stringify(backup)));

    expect(restored?.dailyGame.archive).toEqual({});
    expect(restored?.dailyGame.archiveWonDays).toEqual(activeDays);
    expect(restored?.otherProfiles[0].dailyGame.archiveWonDays).toEqual(parkedDays);
    expect(storesFromSlot(storesToSlot(parkedStores), EXPORTED_AT).dailyGame.archiveWonDays)
      .toEqual(parkedDays);
  });

  it("carries a dormant profile's stores through a round trip", () => {
    // The bug this closes: a household with two profiles downloaded a file
    // holding only whichever one happened to be switched in.
    const stores = {
      ...EMPTY_STORES,
      watchlist: [watchlistItem],
      goal: { year: "2026", target: 52 },
    };

    const restored = storesFromSlot(storesToSlot(stores), EXPORTED_AT);

    expect(restored.watchlist).toHaveLength(1);
    expect(restored.watchlist[0].id).toBe(550);
    expect(restored.goal).toEqual({ year: "2026", target: 52 });
  });

  it("reads a slot written by a profile switch", () => {
    // `parkCurrentProfile` stores each key as the JSON string the store wrote,
    // which is the shape `storesFromSlot` has to understand.
    const slot = {
      watchlist: JSON.stringify([watchlistItem]),
      ratings: JSON.stringify({ "movie-550": { rating: 9, ratedAt: EXPORTED_AT } }),
    };

    const stores = storesFromSlot(slot, EXPORTED_AT);

    expect(stores.watchlist).toHaveLength(1);
    expect(stores.ratings["movie-550"].rating).toBe(9);
    expect(stores.watched).toEqual([]);
  });

  it("drops one unparseable store rather than the whole profile", () => {
    const stores = storesFromSlot(
      { watchlist: "{not json", ratings: JSON.stringify({}) },
      EXPORTED_AT,
    );

    expect(stores.watchlist).toEqual([]);
    expect(stores.ratings).toEqual({});
  });

  it("treats a missing or malformed slot as an empty profile", () => {
    expect(storesFromSlot(undefined, EXPORTED_AT)).toEqual(EMPTY_STORES);
    expect(storesFromSlot([1, 2], EXPORTED_AT)).toEqual(EMPTY_STORES);
  });

  it("omits a null goal from the slot, as saveGoal does", () => {
    expect(storesToSlot(EMPTY_STORES)).not.toHaveProperty("yearly-goal");
  });

  it("skips profile entries with no id or no name", () => {
    const profiles = sanitizePortableProfiles(
      [
        { id: "p2", name: "Sam" },
        { id: "", name: "Nameless" },
        { id: "p3", name: "   " },
        "not a profile",
      ],
      EXPORTED_AT,
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: "p2", name: "Sam" });
    expect(profiles[0].watchlist).toEqual([]);
  });

  // Four, not five: the active profile has the fifth seat, and a file that
  // promised more than a restore could keep had its last profile's slot
  // written and then dropped from the roster.
  it("keeps one entry per id and stops at the cap", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${i}`,
    }));

    expect(sanitizePortableProfiles(many, EXPORTED_AT)).toHaveLength(4);
    expect(
      sanitizePortableProfiles(
        [
          { id: "p2", name: "Sam" },
          { id: "p2", name: "Sam again" },
        ],
        EXPORTED_AT,
      ),
    ).toHaveLength(1);
  });

  it("does not list the active profile twice", () => {
    // The active profile's stores are the top-level fields; repeating it under
    // `otherProfiles` would park a stale copy of them on restore.
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      version: 3,
      exportedAt: EXPORTED_AT,
      activeProfile: { id: "p2", name: "Sam" },
      otherProfiles: [
        { id: "p2", name: "Sam" },
        { id: "default", name: "Me" },
      ],
    });

    expect(parsed?.activeProfile).toEqual({ id: "p2", name: "Sam" });
    expect(parsed?.otherProfiles.map((p) => p.id)).toEqual(["default"]);
  });

  // The repeat is dropped before the cap counts, so it costs nobody a seat.
  it("does not let a repeated active profile take a seat from a real one", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      version: 3,
      exportedAt: EXPORTED_AT,
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [
        { id: "default", name: "Me again" },
        ...Array.from({ length: 4 }, (_, i) => ({
          id: `p${i + 1}`,
          name: `Person ${i + 1}`,
        })),
      ],
    });

    expect(parsed?.otherProfiles.map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
  });

  it("refuses a full roster that has no room for the required default profile", () => {
    expect(parseBackup({
      format: BACKUP_FORMAT,
      version: 3,
      activeProfile: { id: "active", name: "Active" },
      otherProfiles: Array.from({ length: 4 }, (_, index) => ({
        id: `p${index}`, name: `Person ${index}`, watchlist: [watchlistItem],
      })),
    })).toBeNull();
  });

  it("reserves an empty default profile without dropping accepted profiles", () => {
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      version: 3,
      activeProfile: { id: "active", name: "Active" },
      otherProfiles: Array.from({ length: 3 }, (_, index) => ({
        id: `p${index}`, name: `Person ${index}`, watchlist: [watchlistItem],
      })),
    })!;

    expect(parsed.otherProfiles.map((profile) => profile.id)).toEqual(["default", "p0", "p1", "p2"]);
    expect(parsed.otherProfiles[0]).toMatchObject({ id: "default", ...EMPTY_STORES });
    expect(parsed.otherProfiles.slice(1).every((profile) => profile.watchlist.length === 1)).toBe(true);
    expect(summarizeBackup(parsed).otherProfiles).toBe(4);
  });

  it("refuses parked profiles with no active profile to assign the live stores to", () => {
    expect(parseBackup({
      format: BACKUP_FORMAT,
      version: 3,
      otherProfiles: [{ id: "p2", name: "Sam", watchlist: [watchlistItem] }],
    })).toBeNull();
  });

  it("reads a version 2 file as one unattributed profile", () => {
    // No `activeProfile` is the signal that the file predates profiles, and a
    // restore of it must leave this browser's roster alone.
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: EXPORTED_AT,
      watchlist: [{ id: 550, mediaType: "movie", title: "Fight Club" }],
    });

    expect(parsed?.activeProfile).toBeNull();
    expect(parsed?.otherProfiles).toEqual([]);
    expect(parsed?.watchlist).toHaveLength(1);
  });
});

describe("summarizeBackup", () => {
  it("counts what the visitor is about to restore", () => {
    expect(summarizeBackup(fullBackup())).toEqual({
      watchlist: 1,
      watched: 1,
      showsInProgress: 1,
      episodes: 3,
      ratings: 1,
      collections: 1,
      rankedTitles: 1,
      otherProfiles: 0,
      hasSettings: true,
    });
  });

  it("reports an empty backup as empty", () => {
    const empty = buildBackup({
      stores: EMPTY_STORES,
      activeProfile: null,
      otherProfiles: [],
      settings: {
        region: null,
        watchProviderFilter: null,
        selectedProviderIds: null,
      },
      exportedAt: EXPORTED_AT,
    });

    expect(summarizeBackup(empty)).toEqual({
      collections: 0,
      rankedTitles: 0,
      watchlist: 0,
      watched: 0,
      showsInProgress: 0,
      episodes: 0,
      ratings: 0,
      otherProfiles: 0,
      hasSettings: false,
    });
  });

  it("includes a settings flag change in the restore summary", () => {
    const backup = fullBackup();
    backup.settings = {
      region: null, watchProviderFilter: null, selectedProviderIds: null,
      hasCustomSettings: false,
    };

    expect(summarizeBackup(backup).hasSettings).toBe(true);
  });

  it("counts the profiles a restore would also replace", () => {
    const backup = buildBackup({
      stores: EMPTY_STORES,
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [
        { id: "p2", name: "Sam", ...EMPTY_STORES },
        { id: "p3", name: "Alex", ...EMPTY_STORES },
      ],
      settings: {
        region: null,
        watchProviderFilter: null,
        selectedProviderIds: [],
      },
      exportedAt: EXPORTED_AT,
    });

    expect(summarizeBackup(backup).otherProfiles).toBe(2);
  });
});

describe("backupFilename", () => {
  it("dates the file", () => {
    expect(backupFilename(EXPORTED_AT)).toBe("watchlist-backup-2026-08-01.json");
  });

  it("stays a valid filename without a usable date", () => {
    expect(backupFilename("")).toBe("watchlist-backup-export.json");
  });
});

describe("version 1 files", () => {
  it("restores without the stores that did not exist yet", () => {
    const legacy = parseBackup({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: EXPORTED_AT,
      watchlist: [watchlistItem],
      watched: [],
      episodeProgress: {},
      ratings: {},
      settings: { region: "CZ" },
    });

    expect(legacy).not.toBeNull();
    expect(legacy!.watchlist).toHaveLength(1);
    expect(legacy!.collections).toEqual([]);
    expect(legacy!.ranking).toEqual({});
    expect(legacy!.goal).toBeNull();
  });

  it("keeps the newer stores when they are present", () => {
    const restored = parseBackup(fullBackup());

    expect(restored!.collections).toHaveLength(1);
    expect(restored!.ranking["movie-550"].matches).toBe(4);
    expect(restored!.goal).toEqual({ year: "2026", target: 52 });
  });

  it("drops a goal that was tampered with rather than restoring nonsense", () => {
    const restored = parseBackup({
      ...fullBackup(),
      goal: { year: "2026", target: -5 },
    });

    expect(restored!.goal).toBeNull();
  });
});

describe("each profile's last visit", () => {
  it("round-trips through a file and a parked slot", () => {
    const backup = buildBackup({
      stores: { ...EMPTY_STORES, lastVisit: "2026-07-31T12:00:00.000Z" },
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [{ id: "p2", name: "Two", ...EMPTY_STORES, lastVisit: "2026-07-01T12:00:00.000Z" }],
      settings: { region: null, watchProviderFilter: null, selectedProviderIds: null },
      exportedAt: EXPORTED_AT,
    });
    const restored = parseBackup(JSON.parse(JSON.stringify(backup)))!;

    expect(restored.lastVisit).toBe("2026-07-31T12:00:00.000Z");
    expect(restored.otherProfiles[0].lastVisit).toBe("2026-07-01T12:00:00.000Z");
    expect(storesToSlot(restored)["last-visited"]).toBe(JSON.stringify("2026-07-31T12:00:00.000Z"));
    expect(storesFromSlot(storesToSlot(restored), EXPORTED_AT).lastVisit).toBe("2026-07-31T12:00:00.000Z");
  });

  it.each([undefined, null, "not a date", 42])("restores %j as a first visit", (lastVisit) => {
    expect(parseBackup({ ...fullBackup(), lastVisit })!.lastVisit).toBeNull();
    expect(storesToSlot(parseBackup({ ...fullBackup(), lastVisit })!)).not.toHaveProperty("last-visited");
  });
});

describe("what an export could not read", () => {
  it("is described with the profile's name and the store's own word", () => {
    expect(describeUnreadable({ profile: { id: "p2", name: "Sam" }, stores: ["watched"], raw: "[" }))
      .toBe('watched list for "Sam"');
    expect(describeUnreadable({
      profile: { id: "p2", name: "Sam" }, stores: ["watchlist", "watched", "ratings"], raw: "{",
    })).toBe('watchlist, watched list and ratings for "Sam"');
    expect(describeUnreadable({ profile: null, stores: ["settings.region"], raw: "XX" }))
      .toBe("the region setting");
    expect(describeUnreadable({ profile: null, stores: ["profiles"], raw: "null" }))
      .toBe("the profile list");
  });

  it("is never restored, so a file cannot write unreadable text back", () => {
    const restored = parseBackup({
      ...fullBackup(),
      unreadable: [{ profile: null, stores: ["settings.region"], raw: "XX" }],
    });

    expect(restored).not.toHaveProperty("unreadable");
  });
});

describe("the restore size limit", () => {
  it("leaves room for the largest backup a browser's storage can produce", () => {
    // Every store at its most expensive: the longest titles, in characters
    // that take three bytes each once the file is UTF-8 – enough of them to
    // fill the five million characters localStorage holds.
    const title = "映".repeat(200);
    const item = { ...watchlistItem, title };
    const perItem = JSON.stringify(item).length;
    const count = Math.ceil((5 * 1024 * 1024) / perItem);
    const watchlist = Array.from({ length: count }, (_, index) => ({ ...item, id: index + 1 }));
    const backup = buildBackup({
      stores: { ...EMPTY_STORES, watchlist },
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [],
      settings: { region: null, watchProviderFilter: null, selectedProviderIds: null },
      exportedAt: EXPORTED_AT,
    });

    const bytes = new TextEncoder().encode(JSON.stringify(backup, null, 2)).length;
    expect(bytes).toBeLessThan(MAX_BACKUP_FILE_BYTES);
  });
});
