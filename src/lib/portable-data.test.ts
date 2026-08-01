import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFilename,
  buildBackup,
  parseBackup,
  sanitizePortableSettings,
  sanitizeWatchedItems,
  sanitizeWatchlistItems,
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
    watchlist: [watchlistItem],
    watched: [watchedItem],
    episodeProgress: progress,
    ratings: { "movie-550": { rating: 9, ratedAt: EXPORTED_AT } },
    collections: [
      {
        id: "list-1",
        name: "October horror",
        items: [
          { id: 550, mediaType: "movie" as const, title: "Fight Club", posterPath: null },
        ],
        createdAt: EXPORTED_AT,
        updatedAt: EXPORTED_AT,
      },
    ],
    ranking: { "movie-550": { rating: 1600, matches: 4 } },
    goal: { year: "2026", target: 52 },
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
      selectedProviderIds: [],
    });
  });
});

describe("parseBackup", () => {
  it("round-trips a backup through JSON", () => {
    const backup = fullBackup();

    expect(parseBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
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
      watchlist: [],
      watched: [],
      episodeProgress: {},
      ratings: {},
      collections: [],
      ranking: {},
      goal: null,
      settings: {
        region: null,
        watchProviderFilter: null,
        selectedProviderIds: [],
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
      hasSettings: true,
    });
  });

  it("reports an empty backup as empty", () => {
    const empty = buildBackup({
      watchlist: [],
      watched: [],
      episodeProgress: {},
      ratings: {},
      collections: [],
      ranking: {},
      goal: null,
      settings: {
        region: null,
        watchProviderFilter: null,
        selectedProviderIds: [],
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
      hasSettings: false,
    });
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
