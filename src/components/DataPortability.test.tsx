// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { DataPortability } from "./DataPortability";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  describeUnreadable,
  MAX_BACKUP_FILE_BYTES,
  parseBackup,
  type PortableData,
  type UnreadableData,
} from "@/lib/portable-data";
import { restoreBackup } from "@/lib/restore-backup";
import { EMPTY_STATE } from "@/lib/daily-game";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { EPISODE_PROGRESS_STORAGE_KEY } from "@/lib/episode-progress";
import { RATINGS_STORAGE_KEY } from "@/lib/ratings";
import { COLLECTIONS_STORAGE_KEY } from "@/lib/collections";
import { LAST_VISIT_STORAGE_KEY, LEGACY_LAST_VISIT_STORAGE_KEY } from "@/lib/last-visit";
import { deletedProfileKey, initializeProfileStorage, PROFILE_STORAGE_OWNER_KEY, profileStoreKey } from "@/lib/profile-storage";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PROFILES_STORAGE_KEY,
  getProfiles,
  readProfileSlot,
} from "@/lib/profiles";
import {
  getSettings,
  REGION_KEY,
  HAS_SETTINGS_KEY,
  SELECTED_PROVIDERS_KEY,
  setSelectedProviderIds,
  WATCH_PROVIDER_FILTER_KEY,
} from "@/lib/settings";

/**
 * Restoring a backup, and what the visitor is told when it does not work.
 *
 * This is the one screen where being told the wrong thing costs data. There is
 * no account, so the file is the only copy that exists: someone told "Backup
 * restored" over stores the browser refused to write has every reason to close
 * the tab and delete the file. A full quota and a private window both land here,
 * and neither raises anything the component could catch – `localStorage.setItem`
 * throws, and every store already swallowed it.
 */

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("@/components/Toast", () => ({ toast: { showToast } }));

/** A backup file carrying one title, which is all the assertions below need. */
function backupFile(
  overrides: Record<string, unknown> = {},
  filename = "watchlist-backup.json",
): File {
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    watchlist: [
      {
        id: 550,
        title: "Fight Club",
        mediaType: "movie",
        posterPath: "/poster.jpg",
        voteAverage: 8.4,
        releaseDate: "1999-10-15",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    watched: [],
    episodeProgress: {},
    ratings: {},
    collections: [],
    ranking: {},
    goal: null,
    dailyGame: null,
    higherLower: null,
    activeProfile: null,
    otherProfiles: [],
    settings: {
      region: null,
      watchProviderFilter: null,
      selectedProviderIds: [],
    },
  };

  return new File(
    [JSON.stringify({ ...backup, ...overrides })],
    filename,
    { type: "application/json" },
  );
}

async function deferFileRead(file: File) {
  const content = await file.text();
  let finish!: (text: string) => void;
  let fail!: (error: Error) => void;
  vi.spyOn(file, "text").mockImplementation(() => new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  }));
  return {
    file,
    finish: (text = content) => finish(text),
    fail: () => fail(new Error("Could not read this file")),
  };
}

function renderPortability(includeProfiles = false) {
  return render(
    <WatchlistProvider>
      <WatchedProvider>
        <EpisodeProgressProvider>
          {includeProfiles && <ProfileSwitcher />}
          <DataPortability />
        </EpisodeProgressProvider>
      </WatchedProvider>
    </WatchlistProvider>,
  );
}

/** Hand the component a file and get as far as the confirmation panel. */
async function chooseBackup(file = backupFile()) {
  const input = screen.getByLabelText("Choose a backup file");

  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

async function confirm() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Replace and restore" }));
  });
}

/**
 * Make the browser refuse writes, as a full quota or a private window does.
 *
 * Patched on `Storage.prototype` rather than on the `localStorage` instance:
 * jsdom serves that object through a proxy, and a spy installed on it is not the
 * method the stores end up calling.
 */
function refuseWrites(shouldRefuse: (key: string) => boolean = () => true) {
  const real = Storage.prototype.setItem;

  return vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (this: Storage, key: string, value: string) {
      if (shouldRefuse(key)) throw new DOMException("QuotaExceededError");
      real.call(this, key, value);
    });
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  showToast.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the current backup summary", () => {
  it("updates the other-profile count when profiles are created and deleted on this page", async () => {
    renderPortability(true);
    expect(screen.getByText(/In this browser:/).textContent).not.toContain("other profile");

    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Tom" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add" })); });
    expect(screen.getByText(/In this browser:/).textContent).toContain("1 other profile");

    fireEvent.click(screen.getByRole("button", { name: "Delete Tom and their data" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, delete Tom and their data" })); });
    expect(screen.getByText(/In this browser:/).textContent).not.toContain("other profile");
  });

  it("follows ratings and named lists changed in another tab without a watched-list change", () => {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([{
      id: 550,
      title: "Fight Club",
      mediaType: "movie",
      posterPath: null,
      voteAverage: 8.4,
      releaseDate: "1999-10-15",
      watchedAt: "2026-01-01T00:00:00.000Z",
    }]));
    renderPortability();
    expect(screen.getByText(/In this browser:/).textContent).toContain("1 watched");
    expect(screen.getByText(/In this browser:/).textContent).toContain("0 rated");

    act(() => {
      window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify({
        "movie-550": { rating: 8, ratedAt: "2026-01-02T00:00:00.000Z" },
      }));
      window.dispatchEvent(new StorageEvent("storage", { key: RATINGS_STORAGE_KEY }));
    });
    expect(screen.getByText(/In this browser:/).textContent).toContain("1 rated");

    act(() => {
      window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([{
        id: "favourites",
        name: "Favourites",
        items: [],
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }]));
      window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
    });
    expect(screen.getByText(/In this browser:/).textContent).toContain("1 rated, 1 list");

    act(() => {
      window.localStorage.removeItem(RATINGS_STORAGE_KEY);
      window.localStorage.removeItem(COLLECTIONS_STORAGE_KEY);
      for (const key of [RATINGS_STORAGE_KEY, COLLECTIONS_STORAGE_KEY]) {
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    });
    expect(screen.getByText(/In this browser:/).textContent).toContain("0 rated");
    expect(screen.getByText(/In this browser:/).textContent).not.toContain("1 list");
  });
});

describe("exporting a backup", () => {
  function interceptDownload() {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:watchlist/backup");
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    });
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return { createObjectURL, download };
  }

  async function downloadBackup() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    });
  }

  function renderSavedWatchlist() {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
      id: 550, title: "Fight Club", mediaType: "movie",
    }]));
    renderPortability();
    expect(screen.getByText(/In this browser:/).textContent).toContain("1 to watch");
  }

  async function expectExportRefused(intercepted: ReturnType<typeof interceptDownload>) {
    await downloadBackup();
    expect(intercepted.createObjectURL).not.toHaveBeenCalled();
    expect(intercepted.download).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Could not build the backup", "error");
    expect(showToast).not.toHaveBeenCalledWith("Backup downloaded", "success");
  }

  it("exports every profile after deletion and its roster recovery writes are refused", async () => {
    const roster = JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]);
    window.localStorage.setItem(PROFILES_STORAGE_KEY, roster);
    window.localStorage.setItem("profile-data:p2", JSON.stringify({
      watchlist: JSON.stringify([{ id: 949, title: "Heat", mediaType: "movie" }]),
    }));
    renderPortability(true);
    const intercepted = interceptDownload();
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === deletedProfileKey("p2") ||
          (key === PROFILES_STORAGE_KEY && value === roster)) {
        throw new DOMException("Storage write refused", "QuotaExceededError");
      }
      write.call(this, key, value);
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete Second and their data" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, delete Second and their data" }));
    });
    expect(screen.getByRole("button", { name: "Second" })).toBeDefined();
    expect(showToast).toHaveBeenCalledWith(
      'Could not delete "Second" – this browser refused to save the change', "error",
    );

    await downloadBackup();
    const backup = parseBackup(JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()))!;
    expect(backup.otherProfiles).toMatchObject([{
      id: "p2", name: "Second", watchlist: [{ id: 949, title: "Heat" }],
    }]);
    expect(window.localStorage.getItem(PROFILES_STORAGE_KEY)).toBe(roster);
  });

  it("updates the switcher and backup after the deletion commits but roster cleanup fails", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    window.localStorage.setItem("profile-data:p2", JSON.stringify({
      watchlist: JSON.stringify([{ id: 949, title: "Heat", mediaType: "movie" }]),
    }));
    renderPortability(true);
    const intercepted = interceptDownload();
    refuseWrites((key) => key === PROFILES_STORAGE_KEY);

    fireEvent.click(screen.getByRole("button", { name: "Delete Second and their data" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, delete Second and their data" }));
    });
    expect(screen.queryByRole("button", { name: "Second" })).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Deleted "Second"', "success");
    expect(screen.getByText(/In this browser:/).textContent).not.toContain("other profile");

    await downloadBackup();
    const backup = parseBackup(JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()))!;
    expect(backup.otherProfiles).toEqual([]);
    expect(window.localStorage.getItem(deletedProfileKey("p2"))).toBe("true");
  });

  it("waits for a queued restore before reading the complete backup snapshot", async () => {
    const restored = parseBackup(JSON.parse(await backupFile({
      activeProfile: { id: "imported", name: "Imported" },
      watched: [{ id: 11, title: "Star Wars", mediaType: "movie", watchedAt: "2026-01-01T00:00:00.000Z" }],
      episodeProgress: {
        "1399": { tvId: 1399, name: "Game of Thrones", posterPath: null, seasons: { "1": [1, 2] }, updatedAt: "2026-01-01T00:00:00.000Z" },
      },
      ratings: { "movie-11": { rating: 8, ratedAt: "2026-01-01T00:00:00.000Z" } },
      collections: [{ id: "favourites", name: "Favourites", items: ["movie-11"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      ranking: { "movie-550": { rating: 1600, matches: 2 } },
      goal: { year: "2026", target: 52 },
      dailyGame: { ...EMPTY_STATE, today: { day: "2026-01-01", guesses: [], status: "playing" } },
      higherLower: { best: 3, totalRounds: 4 },
      otherProfiles: [{ id: "other", name: "Other", watchlist: [{ id: 949, title: "Heat", mediaType: "movie" }], goal: { year: "2026", target: 12 } }],
      settings: { region: "CZ", watchProviderFilter: "streaming-only", selectedProviderIds: [8, 119] },
    }).text()))!;
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Before restore" }, { id: "removed", name: "Removed" },
    ]));
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    const requests = vi.spyOn(navigator.locks, "request");
    const restoring = restoreBackup(restored);

    act(() => { fireEvent.click(screen.getByRole("button", { name: "Download backup" })); });

    expect(requests).toHaveBeenCalledTimes(2);
    // Unavailable without native `disabled`, which blurred the pressed button.
    const preparing = screen.getByRole("button", { name: "Preparing…" }) as HTMLButtonElement;
    expect(preparing.getAttribute("aria-disabled")).toBe("true");
    expect(preparing.disabled).toBe(false);
    act(() => { fireEvent.click(preparing); });
    expect(requests).toHaveBeenCalledTimes(2);
    expect(intercepted.createObjectURL).not.toHaveBeenCalled();
    expect(intercepted.download).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => { release(); await held; expect((await restoring).ok).toBe(true); });

    expect(intercepted.download).toHaveBeenCalledOnce();
    const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(parseBackup(backup)).toEqual({
      ...restored,
      settings: { ...restored.settings, hasCustomSettings: true },
      exportedAt: backup.exportedAt,
    });
    const link = intercepted.download.mock.contexts[0] as HTMLAnchorElement;
    expect(link.href).toBe("blob:watchlist/backup");
    expect(link.download).toBe(`watchlist-backup-${backup.exportedAt.slice(0, 10)}.json`);
    expect(showToast).toHaveBeenCalledExactlyOnceWith("Backup downloaded", "success");
  });

  it.each(["unavailable", "refused"])("does not download when the shared browser lock is %s", async (failure) => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    if (failure === "unavailable") vi.stubGlobal("navigator", {});
    else vi.spyOn(navigator.locks, "request").mockRejectedValue(new DOMException("Lock denied", "SecurityError"));

    await expectExportRefused(intercepted);

    expect(screen.getByRole("button", { name: "Download backup" }).hasAttribute("disabled")).toBe(false);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toContain("Fight Club");
  });

  it("exports a consistent owner even if the active pointer changes while reading its stores", async () => {
    initializeProfileStorage();
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([
      { id: 12, title: "My watched film", mediaType: "movie" },
    ]));
    window.localStorage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "bob"), JSON.stringify([
      { id: 949, title: "Heat", mediaType: "movie" },
    ]));
    window.localStorage.setItem(profileStoreKey(WATCHED_STORAGE_KEY, "bob"), JSON.stringify([
      { id: 22, title: "Bob's watched film", mediaType: "movie" },
    ]));
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = getItem.call(this, key);
      if (key === WATCHLIST_STORAGE_KEY) setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      return value;
    });

    await downloadBackup();

    const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(backup.activeProfile?.id).toBe("default");
    expect(backup.watchlist.map((item) => item.id)).toEqual([550]);
    expect(backup.watched.map((item) => item.id)).toEqual([12]);
    expect(backup.otherProfiles[0].id).toBe("bob");
    expect(backup.otherProfiles[0].watchlist.map((item) => item.id)).toEqual([949]);
    expect(backup.otherProfiles[0].watched.map((item) => item.id)).toEqual([22]);
  });

  /** A backup that downloads and names exactly what it could not read. */
  async function expectExportWithGaps(
    intercepted: ReturnType<typeof interceptDownload>,
    gaps: UnreadableData[],
  ): Promise<PortableData> {
    await downloadBackup();
    expect(intercepted.download).toHaveBeenCalledOnce();
    const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(backup.unreadable).toEqual(gaps);
    expect(showToast).toHaveBeenCalledWith(
      `Backup downloaded, but some data could not be read: ${gaps.map(describeUnreadable).join("; ")}.`,
      "error",
      10000,
    );
    expect(showToast).not.toHaveBeenCalledWith("Backup downloaded", "success");
    return backup;
  }

  const ME = { id: "default", name: "Me" };
  const storeFields: Record<string, string> = {
    [WATCHLIST_STORAGE_KEY]: "watchlist",
    [WATCHED_STORAGE_KEY]: "watched",
    [EPISODE_PROGRESS_STORAGE_KEY]: "episodeProgress",
    [RATINGS_STORAGE_KEY]: "ratings",
    [COLLECTIONS_STORAGE_KEY]: "collections",
    ranking: "ranking",
    "yearly-goal": "goal",
    "daily-game": "dailyGame",
    "higher-lower": "higherLower",
    [LAST_VISIT_STORAGE_KEY]: "lastVisit",
  };
  const settingFields: Record<string, string> = {
    [REGION_KEY]: "region",
    [WATCH_PROVIDER_FILTER_KEY]: "watchProviderFilter",
    [SELECTED_PROVIDERS_KEY]: "selectedProviderIds",
    [HAS_SETTINGS_KEY]: "hasCustomSettings",
  };

  function refuseReads(refused: (key: string) => boolean) {
    const read = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (refused(key)) throw new DOMException("Read denied", "SecurityError");
      return read.call(this, key);
    });
    return read;
  }

  // Without these nothing can say whose data is whose, so there is no backup.
  it.each([
    PROFILES_STORAGE_KEY,
    ACTIVE_PROFILE_STORAGE_KEY,
    PROFILE_STORAGE_OWNER_KEY,
    "all storage",
  ])("refuses a backup when reading %s fails after hydration", async (refusedKey) => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    const read = refuseReads((key) => key === refusedKey || refusedKey === "all storage");

    await expectExportRefused(intercepted);
    expect(read.call(window.localStorage, WATCHLIST_STORAGE_KEY)).toContain("Fight Club");
  });

  it.each(Object.keys(storeFields).filter((key) => key !== WATCHLIST_STORAGE_KEY))(
    "exports everything else and names the store when reading %s fails",
    async (refusedKey) => {
      renderSavedWatchlist();
      const intercepted = interceptDownload();
      refuseReads((key) => key === refusedKey);

      const backup = await expectExportWithGaps(intercepted, [
        { profile: ME, stores: [storeFields[refusedKey]], raw: null },
      ]);
      expect(backup.watchlist.map((item) => item.title)).toEqual(["Fight Club"]);
      expect(parseBackup(backup)).not.toHaveProperty("unreadable");
    },
  );

  it("names an unreadable watchlist without falling back to the legacy cookie", async () => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    document.cookie = `watchlist=${encodeURIComponent("[]")};path=/`;
    try {
      refuseReads((key) => key === WATCHLIST_STORAGE_KEY);

      const backup = await expectExportWithGaps(intercepted, [
        { profile: ME, stores: ["watchlist"], raw: null },
      ]);
      expect(backup.watchlist).toEqual([]);
    } finally {
      document.cookie = "watchlist=;max-age=0;path=/";
    }
  });

  it.each(Object.keys(settingFields))("exports everything else and names the setting when reading %s fails", async (refusedKey) => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    refuseReads((key) => key === refusedKey);

    const backup = await expectExportWithGaps(intercepted, [
      { profile: null, stores: [`settings.${settingFields[refusedKey]}`], raw: null },
    ]);
    expect(backup.watchlist.map((item) => item.title)).toEqual(["Fight Club"]);
  });

  it.each(Object.keys(storeFields).filter((key) => key !== WATCHLIST_STORAGE_KEY))(
    "keeps malformed %s in the file for recovery and exports the rest",
    async (key) => {
      renderSavedWatchlist();
      const intercepted = interceptDownload();
      window.localStorage.setItem(key, "{not json");

      const backup = await expectExportWithGaps(intercepted, [
        { profile: ME, stores: [storeFields[key]], raw: "{not json" },
      ]);
      expect(backup.watchlist.map((item) => item.title)).toEqual(["Fight Club"]);
      expect(window.localStorage.getItem(key)).toBe("{not json");
    },
  );

  it("keeps a malformed watchlist in the file for recovery", async () => {
    renderPortability();
    const intercepted = interceptDownload();
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, "{not json");

    const backup = await expectExportWithGaps(intercepted, [
      { profile: ME, stores: ["watchlist"], raw: "{not json" },
    ]);
    expect(backup.watchlist).toEqual([]);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe("{not json");
  });

  it.each([
    ["unparseable", "{not json"],
    ["not a list", "null"],
    ["holding a nameless entry", JSON.stringify([{ id: "default", name: "Me" }, { id: "lost", name: "" }])],
  ])("exports the profiles the app shows when the stored roster is %s, keeping its text", async (_label, raw) => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    window.localStorage.setItem(PROFILES_STORAGE_KEY, raw);

    const backup = await expectExportWithGaps(intercepted, [{ profile: null, stores: ["profiles"], raw }]);
    expect(backup.activeProfile).toEqual(ME);
    expect(backup.otherProfiles).toEqual([]);
    expect(backup.watchlist.map((item) => item.title)).toEqual(["Fight Club"]);
    expect(window.localStorage.getItem(PROFILES_STORAGE_KEY)).toBe(raw);
  });

  it("exports an empty active pointer as the default profile every reader resolves it to", async () => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "");

    await downloadBackup();

    const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(backup.activeProfile).toEqual(ME);
    expect(backup).not.toHaveProperty("unreadable");
    expect(showToast).toHaveBeenCalledWith("Backup downloaded", "success");
  });

  it("refuses a backup whose live stores belong to an owner no roster names", async () => {
    // Before rosters existed a nondefault pointer could own the live keys; with
    // no name to give it, the export cannot say whose they are.
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "missing-profile");

    await expectExportRefused(intercepted);
  });

  it.each([
    [REGION_KEY, "region", "not-a-region"],
    [WATCH_PROVIDER_FILTER_KEY, "watchProviderFilter", "unsupported-filter"],
    [SELECTED_PROVIDERS_KEY, "selectedProviderIds", "8,337broken"],
    [HAS_SETTINGS_KEY, "hasCustomSettings", "not-a-boolean"],
  ])("exports everything else and keeps an invalid %s out of the restorable settings", async (key, field, value) => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    window.localStorage.setItem(key, value);

    const backup = await expectExportWithGaps(intercepted, [
      { profile: null, stores: [`settings.${field}`], raw: value },
    ]);
    const settings = parseBackup(backup)!.settings as unknown as Record<string, unknown>;
    // Null restores nothing, so the destination keeps its own value.
    if (field === "hasCustomSettings") expect(settings).not.toHaveProperty(field);
    else expect(settings[field]).toBeNull();
    expect(backup.watchlist.map((item) => item.title)).toEqual(["Fight Club"]);
    expect(window.localStorage.getItem(key)).toBe(value);
  });

  it("exports each profile's own last visit, with the pre-profile stamp for its original owner", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    window.localStorage.setItem(LEGACY_LAST_VISIT_STORAGE_KEY, "2026-01-01T00:00:00.000Z");
    window.localStorage.setItem(profileStoreKey(LAST_VISIT_STORAGE_KEY, "bob"), JSON.stringify("2026-02-02T00:00:00.000Z"));
    renderPortability();
    const intercepted = interceptDownload();

    await downloadBackup();

    const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(backup.lastVisit).toBe("2026-01-01T00:00:00.000Z");
    expect(backup.otherProfiles[0]).toMatchObject({ id: "bob", lastVisit: "2026-02-02T00:00:00.000Z" });
  });

  it("lists what the last backup left out until the next one", async () => {
    renderSavedWatchlist();
    const intercepted = interceptDownload();
    window.localStorage.setItem(WATCHED_STORAGE_KEY, "{not json");
    window.localStorage.setItem(REGION_KEY, "not-a-region");

    await expectExportWithGaps(intercepted, [
      { profile: ME, stores: ["watched"], raw: "{not json" },
      { profile: null, stores: ["settings.region"], raw: "not-a-region" },
    ]);
    const notice = screen.getByRole("heading", { name: "Not in your last backup" }).parentElement!;
    expect(within(notice).getByText(/watched list for "Me"/).textContent).toContain("kept in the file");
    expect(within(notice).getByText(/the region setting/)).toBeDefined();

    window.localStorage.setItem(WATCHED_STORAGE_KEY, "[]");
    window.localStorage.setItem(REGION_KEY, "CZ");
    await downloadBackup();
    expect(screen.queryByRole("heading", { name: "Not in your last backup" })).toBeNull();
  });

  it("exports and restores an empty browser without marking its defaults configured", async () => {
    vi.useFakeTimers();
    const intercepted = interceptDownload();
    renderPortability();

    await downloadBackup();

    expect(intercepted.download).toHaveBeenCalledOnce();
    const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(backup).toMatchObject({
      watchlist: [], watched: [], episodeProgress: {}, ratings: {}, collections: [],
      activeProfile: { id: "default", name: "Me" }, otherProfiles: [],
      settings: { region: "US", watchProviderFilter: "all", selectedProviderIds: [], hasCustomSettings: false },
    });
    expect(showToast).toHaveBeenCalledWith("Backup downloaded", "success");

    await chooseBackup(new File([JSON.stringify(backup)], "fresh-backup.json", { type: "application/json" }));
    await confirm();

    expect(getSettings().hasCustomSettings).toBe(false);
    expect(localStorage.getItem(HAS_SETTINGS_KEY)).toBe("false");
    expect(showToast).toHaveBeenCalledWith("Backup restored", "success");
    vi.runOnlyPendingTimers();
  });

  it("exports a legacy cookie watchlist when storage still refuses its migration", async () => {
    vi.useFakeTimers();
    const legacy = [{
      id: 550, title: "Fight Club", mediaType: "movie", posterPath: null,
      voteAverage: 8.4, releaseDate: "1999-10-15", addedAt: "2026-01-01T00:00:00.000Z",
    }];
    document.cookie = `watchlist=${encodeURIComponent(JSON.stringify(legacy))};path=/`;
    const intercepted = interceptDownload();
    refuseWrites((key) => key === WATCHLIST_STORAGE_KEY);
    try {
      renderPortability();
      await downloadBackup();

      const backup = JSON.parse(await intercepted.createObjectURL.mock.calls[0][0].text()) as PortableData;
      expect(backup.watchlist).toEqual(legacy);
      expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
      expect(document.cookie).toContain("watchlist=");
      expect(showToast).toHaveBeenCalledWith("Backup downloaded", "success");
      vi.runOnlyPendingTimers();
    } finally {
      document.cookie = "watchlist=;max-age=0;path=/";
    }
  });

  it("names malformed legacy cookie data without deleting its only persisted copy", async () => {
    renderPortability();
    const intercepted = interceptDownload();
    document.cookie = "watchlist=%7Bnot%20json;path=/";
    try {
      const backup = await expectExportWithGaps(intercepted, [
        { profile: ME, stores: ["watchlist"], raw: null },
      ]);
      expect(backup.watchlist).toEqual([]);
      expect(document.cookie).toContain("watchlist=");
    } finally {
      document.cookie = "watchlist=;max-age=0;path=/";
    }
  });

  const UNREADABLE = { id: "p3", name: "Unreadable" };
  const everyStore = Object.values(storeFields);
  it.each([
    ["a refused read", '{"watchlist":"[]"}', true, [{ profile: UNREADABLE, stores: everyStore, raw: null }]],
    // One parked slot: kept once, for every store that falls back to it.
    ["malformed slot JSON", "{not json", false, [{ profile: UNREADABLE, stores: everyStore, raw: "{not json" }]],
    ["malformed store JSON", '{"watchlist":"[not json"}', false, [{ profile: UNREADABLE, stores: ["watchlist"], raw: "[not json" }]],
  ])("downloads every other profile and names a dormant profile's stores after %s", async (_label, raw, refuseRead, gaps) => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" },
      { id: "p2", name: "Readable" },
      { id: "p3", name: "Unreadable" },
    ]));
    window.localStorage.setItem("profile-data:p2", JSON.stringify({
      [WATCHLIST_STORAGE_KEY]: JSON.stringify([{ id: 550, title: "Fight Club", mediaType: "movie" }]),
    }));
    window.localStorage.setItem("profile-data:p3", raw);
    renderPortability();
    const read = refuseRead
      ? refuseReads((key) => key === "profile-data:p3")
      : Storage.prototype.getItem;
    const intercepted = interceptDownload();

    const backup = await expectExportWithGaps(intercepted, gaps as UnreadableData[]);

    expect(backup.otherProfiles.map(({ id }) => id)).toEqual(["p2", "p3"]);
    expect(backup.otherProfiles[0].watchlist.map((item) => item.title)).toEqual(["Fight Club"]);
    expect(backup.otherProfiles[1].watchlist).toEqual([]);
    expect(showToast.mock.calls.at(-1)?.[0]).toContain('for "Unreadable"');
    expect(read.call(window.localStorage, "profile-data:p3")).toBe(raw);
  });

  it("restores a backup with gaps without writing the unreadable text back", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    window.localStorage.setItem("profile-data:p2", JSON.stringify({
      [WATCHLIST_STORAGE_KEY]: "[not json",
      [WATCHED_STORAGE_KEY]: JSON.stringify([{ id: 11, title: "Star Wars", mediaType: "movie" }]),
    }));
    renderPortability();
    const intercepted = interceptDownload();
    const backup = await expectExportWithGaps(intercepted, [
      { profile: { id: "p2", name: "Second" }, stores: ["watchlist"], raw: "[not json" },
    ]);
    window.localStorage.clear();

    await chooseBackup(new File([JSON.stringify(backup)], "with-gaps.json", { type: "application/json" }));
    await confirm();

    expect(showToast).toHaveBeenLastCalledWith("Backup restored", "success");
    expect(getProfiles().map(({ id }) => id)).toEqual(["default", "p2"]);
    expect(readProfileSlot("p2", { strict: true })).toMatchObject({
      [WATCHLIST_STORAGE_KEY]: "[]",
      [WATCHED_STORAGE_KEY]: expect.stringContaining("Star Wars"),
    });
  });

  it("exports a new empty profile whose slot has not been created", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "New profile" },
    ]));
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:watchlist/backup");
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPortability();

    await downloadBackup();

    expect(createObjectURL).toHaveBeenCalledOnce();
    const backup = JSON.parse(await createObjectURL.mock.calls[0][0].text()) as PortableData;
    expect(backup.otherProfiles).toMatchObject([{ id: "p2", name: "New profile", watchlist: [] }]);
    expect(showToast).toHaveBeenCalledWith("Backup downloaded", "success");
    vi.runOnlyPendingTimers();
  });

  it("exports current stores and settings before queued storage events update their snapshots", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:watchlist/backup");
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    setSelectedProviderIds([8]);
    const cachedSettings = getSettings();
    renderPortability();
    expect(screen.getByText(/In this browser: 0 to watch, 0 watched/)).toBeDefined();

    const title = {
      id: 550,
      title: "Fight Club",
      mediaType: "movie",
      posterPath: null,
      voteAverage: 8.4,
      releaseDate: "1999-10-15",
    };
    const watchlist = [{ ...title, addedAt: "2026-01-01T00:00:00.000Z" }];
    const watched = [{ ...title, id: 11, title: "Star Wars", watchedAt: "2026-01-01T00:00:00.000Z" }];
    const episodeProgress = {
      "1399": {
        tvId: 1399,
        name: "Game of Thrones",
        posterPath: null,
        seasons: { "1": [1, 2] },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    // Direct writes model the period between another tab saving and this tab
    // receiving its storage events. The context values are still empty.
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watched));
    window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(episodeProgress));
    window.localStorage.setItem(REGION_KEY, "CZ");
    window.localStorage.setItem(WATCH_PROVIDER_FILTER_KEY, "streaming-only");
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "9,119");
    expect(screen.getByText(/In this browser: 0 to watch, 0 watched/)).toBeDefined();
    expect(getSettings()).toBe(cachedSettings);
    expect(getSettings().selectedProviderIds).toEqual([8]);

    await downloadBackup();

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const backup = JSON.parse(await blob.text()) as PortableData;
    expect(backup.watchlist).toEqual(watchlist);
    expect(backup.watched).toEqual(watched);
    expect(backup.episodeProgress).toEqual(episodeProgress);
    expect(backup.settings).toMatchObject({
      region: "CZ",
      watchProviderFilter: "streaming-only",
      selectedProviderIds: [9, 119],
    });
    expect(getSettings()).toBe(cachedSettings);
    expect(showToast).toHaveBeenCalledWith("Backup downloaded", "success");

    act(() => {
      for (const key of [WATCHLIST_STORAGE_KEY, WATCHED_STORAGE_KEY, EPISODE_PROGRESS_STORAGE_KEY]) {
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    });
    expect(screen.getByText(/In this browser: 1 to watch, 1 watched, 1 series in progress \(2 episodes ticked\)/)).toBeDefined();
    vi.runOnlyPendingTimers();
  });
});

describe("restoring a backup", () => {
  it("shows what the file holds before replacing anything", async () => {
    renderPortability();
    await chooseBackup();

    expect(
      screen.getByRole("button", { name: "Replace and restore" }),
    ).toBeDefined();
    // Nothing is written until the visitor confirms against the counts.
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("alertdialog").textContent).toContain("watchlist-backup.json");
  });

  it("restores the latest selected file even when an earlier read finishes last", async () => {
    const older = await deferFileRead(backupFile({}, "older.json"));
    const latest = backupFile({
      watchlist: [{
        id: 11,
        title: "Latest selection",
        mediaType: "movie",
        posterPath: null,
        voteAverage: 8,
        releaseDate: "1977-05-25",
        addedAt: "2026-01-01T00:00:00.000Z",
      }],
    }, "latest.json");
    renderPortability();
    await chooseBackup(older.file);
    await chooseBackup(latest);

    expect(screen.getByRole("alertdialog").textContent).toContain("latest.json");
    await act(async () => { older.finish(); });
    expect(screen.getByRole("alertdialog").textContent).toContain("latest.json");
    expect(screen.getByRole("alertdialog").textContent).not.toContain("older.json");

    await confirm();
    expect(readProfileSlot("default").watchlist).toContain("Latest selection");
    expect(readProfileSlot("default").watchlist).not.toContain("Fight Club");
  });

  it("removes the previous confirmation while a newly selected file is being read", async () => {
    const latest = await deferFileRead(backupFile({}, "latest.json"));
    renderPortability();
    await chooseBackup(backupFile({}, "previous.json"));
    const previousConfirmation = screen.getByRole("button", { name: "Replace and restore" });
    const input = screen.getByLabelText("Choose a backup file");

    // A previously rendered handler cannot confirm the old file after a new
    // selection, including events delivered before React paints that change.
    act(() => {
      fireEvent.change(input, { target: { files: [latest.file] } });
      fireEvent.click(previousConfirmation);
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace and restore" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Reading latest.json…");
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(showToast).not.toHaveBeenCalledWith("Backup restored", "success");

    await act(async () => { latest.finish(); });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alertdialog").textContent).toContain("latest.json");
  });

  it.each(["invalid JSON", "invalid backup", "failed read"])(
    "ignores an earlier %s after a newer valid file is selected",
    async (outcome) => {
      const older = await deferFileRead(backupFile({}, "older.json"));
      renderPortability();
      await chooseBackup(older.file);
      await chooseBackup(backupFile({}, "latest.json"));
      await act(async () => {
        if (outcome === "failed read") older.fail();
        else older.finish(outcome === "invalid JSON" ? "{" : "{}");
      });

      expect(screen.getByRole("alertdialog").textContent).toContain("latest.json");
      expect(showToast).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    },
  );

  it("does not restore an earlier valid file after the latest selection is invalid", async () => {
    const older = await deferFileRead(backupFile({}, "older.json"));
    renderPortability();
    await chooseBackup(older.file);
    await chooseBackup(new File(["{}"], "invalid.json", { type: "application/json" }));
    expect(showToast).toHaveBeenCalledExactlyOnceWith("That is not a WatchList backup file", "error");

    await act(async () => { older.finish(); });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest file input and reading status intact when an older read settles", async () => {
    const older = await deferFileRead(backupFile({}, "older.json"));
    const latest = await deferFileRead(backupFile({}, "latest.json"));
    renderPortability();
    await chooseBackup(older.file);
    await chooseBackup(latest.file);
    const input = screen.getByLabelText("Choose a backup file") as HTMLInputElement;
    const clearInput = vi.spyOn(input, "value", "set");

    await act(async () => { older.finish(); });
    expect(clearInput).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Reading latest.json…");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await act(async () => { latest.finish(); });
    expect(clearInput).toHaveBeenCalledExactlyOnceWith("");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alertdialog").textContent).toContain("latest.json");
  });

  it("restores the file and says so", async () => {
    renderPortability();
    await chooseBackup();
    await confirm();

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toContain(
      "Fight Club",
    );
    expect(showToast).toHaveBeenCalledWith("Backup restored", "success");
  });

  it("waits for the roster lock, marks controls unavailable and ignores a repeated confirmation", async () => {
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    const requests = vi.spyOn(navigator.locks, "request");
    renderPortability();
    await chooseBackup(backupFile({ activeProfile: { id: "default", name: "Imported" } }));
    const confirmButton = screen.getByRole("button", { name: "Replace and restore" });
    confirmButton.focus();

    act(() => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
    });

    expect(requests).toHaveBeenCalledTimes(1);
    // The dialog's buttons keep focus: a refusal leaves the dialog up for a retry.
    for (const name of ["Restoring…", "Cancel"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.disabled).toBe(false);
    }
    expect(document.activeElement).toBe(confirmButton);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect((screen.getByRole("button", { name: "Restore from file" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Download backup" }) as HTMLButtonElement).disabled).toBe(true);
    expect(showToast).not.toHaveBeenCalledWith("Backup restored", "success");

    await act(async () => { release(); await held; });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/In this browser:/).textContent).toContain("1 to watch");
    expect(showToast).toHaveBeenCalledExactlyOnceWith("Backup restored", "success");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Restore from file" }));
  });

  it("moves focus into the confirmation, describes it, and returns focus when it closes", async () => {
    renderPortability();
    const restoreButton = screen.getByRole("button", { name: "Restore from file" });
    restoreButton.focus();
    await chooseBackup();

    const dialog = screen.getByRole("alertdialog");
    // Focus inside an alertdialog is what gets it announced; Cancel loses nothing.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    const description = dialog.getAttribute("aria-describedby")!.split(" ")
      .map((id) => document.getElementById(id)!.textContent).join(" ");
    expect(description).toContain("This backup holds 1 to watch");
    expect(description).toContain("It cannot be undone");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(restoreButton);
  });

  it("keeps focus in the confirmation after a refused restore so it can be retried", async () => {
    renderPortability();
    await chooseBackup();
    const confirmButton = screen.getByRole("button", { name: "Replace and restore" });
    confirmButton.focus();
    const setItem = refuseWrites();

    await confirm();

    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(document.activeElement).toBe(confirmButton);
    setItem.mockRestore();
  });

  it("keeps the hidden file input out of the Tab order behind its visible button", () => {
    renderPortability();
    const input = screen.getByLabelText("Choose a backup file") as HTMLInputElement;

    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute("aria-hidden")).toBe("true");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Restore from file" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("refuses a file too large to be a backup before reading any of it", async () => {
    renderPortability();
    const file = backupFile();
    Object.defineProperty(file, "size", { value: MAX_BACKUP_FILE_BYTES + 1 });
    const read = vi.spyOn(file, "text");

    await chooseBackup(file);

    expect(read).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledExactlyOnceWith(
      `That file is too large to be a WatchList backup – backups stay under ${Math.round(MAX_BACKUP_FILE_BYTES / (1024 * 1024))} MB`,
      "error",
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("accepts a file right at the size limit", async () => {
    renderPortability();
    const file = backupFile();
    Object.defineProperty(file, "size", { value: MAX_BACKUP_FILE_BYTES });

    await chooseBackup(file);

    expect(screen.getByRole("alertdialog")).toBeDefined();
  });

  it("warns that a single-profile backup deletes other profiles and their data", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" },
      { id: "other", name: "Other person" },
    ]));
    window.localStorage.setItem("profile-data:other", '{"watchlist":"[]"}');
    renderPortability();
    await chooseBackup(backupFile({ activeProfile: { id: "default", name: "Me" } }));

    expect(within(screen.getByRole("alertdialog")).getByText(
      /Profiles absent from the backup and all their data will be deleted/,
    )).toBeDefined();
    expect(getProfiles()).toHaveLength(2);
    expect(window.localStorage.getItem("profile-data:other")).not.toBeNull();

    await confirm();

    expect(getProfiles().map(({ id }) => id)).toEqual(["default"]);
    expect(window.localStorage.getItem("profile-data:other")).toBeNull();
  });

  it("does not warn about deleting profiles when restoring a legacy backup", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" },
      { id: "other", name: "Other person" },
    ]));
    renderPortability();
    await chooseBackup();

    expect(screen.queryByText(/This will replace all profiles/)).toBeNull();
    await confirm();
    expect(getProfiles().map(({ id }) => id)).toEqual(["default", "other"]);
  });

  function seedRestoreProfiles() {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
    ]));
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
    initializeProfileStorage();
    const alice = JSON.stringify([{ id: 1, title: "Alice original", mediaType: "movie" }]);
    const bob = JSON.stringify([{ id: 2, title: "Bob original", mediaType: "movie" }]);
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, alice);
    window.localStorage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "bob"), bob);
    return { alice, bob };
  }

  function switchToBob(deliverEvent: boolean) {
    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      if (deliverEvent) {
        window.dispatchEvent(new StorageEvent("storage", {
          key: ACTIVE_PROFILE_STORAGE_KEY, oldValue: "default", newValue: "bob",
        }));
      }
    });
  }

  it.each([false, true])(
    "cancels a legacy restore after a profile switch (storage event delivered: %s)",
    async (deliverEvent) => {
      const { alice, bob } = seedRestoreProfiles();
      renderPortability();
      await chooseBackup(backupFile({ version: 2 }));

      switchToBob(deliverEvent);
      await confirm();

      expect(readProfileSlot("default").watchlist).toBe(alice);
      expect(readProfileSlot("bob").watchlist).toBe(bob);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(showToast).toHaveBeenLastCalledWith(
        "Your active profile changed. Choose the backup file again for the current profile.",
        "info",
      );
      expect(showToast).not.toHaveBeenCalledWith("Backup restored", "success");

      // Choosing the file again explicitly targets Bob without changing Alice.
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      });
      await chooseBackup(backupFile({ version: 2 }));
      await confirm();
      expect(readProfileSlot("default").watchlist).toBe(alice);
      expect(JSON.parse(readProfileSlot("bob").watchlist)[0].title).toBe("Fight Club");
      expect(showToast).toHaveBeenLastCalledWith("Backup restored", "success");
    },
  );

  it("rejects a legacy file selected from the previous profile before the switch event arrives", async () => {
    const { alice, bob } = seedRestoreProfiles();
    renderPortability();
    switchToBob(false);

    await chooseBackup(backupFile({ version: 2 }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(readProfileSlot("default").watchlist).toBe(alice);
    expect(readProfileSlot("bob").watchlist).toBe(bob);
    expect(showToast).toHaveBeenLastCalledWith(
      "Your active profile changed. Choose the backup file again for the current profile.",
      "info",
    );
  });

  it("retains the profile that opened the native picker when its switch event arrives before selection", async () => {
    const { alice, bob } = seedRestoreProfiles();
    renderPortability();
    fireEvent.click(screen.getByRole("button", { name: "Restore from file" }));
    switchToBob(true);

    await chooseBackup(backupFile({ version: 2 }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(readProfileSlot("default").watchlist).toBe(alice);
    expect(readProfileSlot("bob").watchlist).toBe(bob);
    expect(showToast).toHaveBeenLastCalledWith(
      "Your active profile changed. Choose the backup file again for the current profile.",
      "info",
    );
  });

  it("retains a legacy file's original owner while its asynchronous read is pending", async () => {
    const { alice, bob } = seedRestoreProfiles();
    renderPortability();
    const file = backupFile({ version: 2 });
    const content = await file.text();
    let finishRead!: (text: string) => void;
    vi.spyOn(file, "text").mockImplementation(() => new Promise((resolve) => {
      finishRead = resolve;
    }));

    await chooseBackup(file);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    switchToBob(true);
    await act(async () => { finishRead(content); });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(readProfileSlot("default").watchlist).toBe(alice);
    expect(readProfileSlot("bob").watchlist).toBe(bob);
    expect(showToast).toHaveBeenLastCalledWith(
      "Your active profile changed. Choose the backup file again for the current profile.",
      "info",
    );
  });

  it("keeps legacy restore writes bound if another tab switches immediately after the check", async () => {
    const { bob } = seedRestoreProfiles();
    renderPortability();
    await chooseBackup(backupFile({ version: 2 }));

    const read = Storage.prototype.getItem;
    let switchOnCheck = true;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key);
      if (key === ACTIVE_PROFILE_STORAGE_KEY && switchOnCheck) {
        switchOnCheck = false;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });
    await confirm();

    expect(JSON.parse(readProfileSlot("default").watchlist)[0].title).toBe("Fight Club");
    expect(readProfileSlot("bob").watchlist).toBe(bob);
    expect(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("bob");
  });

  it("still restores all profiles from a named-profile backup after the active profile changes", async () => {
    seedRestoreProfiles();
    renderPortability();
    await chooseBackup(backupFile({ activeProfile: { id: "default", name: "Imported Alice" } }));

    switchToBob(true);
    await confirm();

    expect(getProfiles()).toEqual([{ id: "default", name: "Imported Alice" }]);
    expect(JSON.parse(readProfileSlot("default").watchlist)[0].title).toBe("Fight Club");
    expect(readProfileSlot("bob")).toEqual({});
    expect(showToast).toHaveBeenLastCalledWith("Backup restored", "success");
  });

  /**
   * The bug: all nine writes were fired and none of their answers read. Seven of
   * them returned `void` and swallowed the refusal outright, so a browser that
   * stored nothing still produced "Backup restored".
   */
  it("does not claim success when the browser refuses every write", async () => {
    renderPortability();
    await chooseBackup();

    refuseWrites();

    await confirm();

    expect(showToast).not.toHaveBeenCalledWith("Backup restored", "success");

    const [message, kind] = showToast.mock.calls.at(-1) ?? [];
    expect(kind).toBe("error");
    expect(message).toContain("Your existing data is unchanged");
  });

  it("names the refused store and rolls back the rest of the backup", async () => {
    renderPortability();
    await chooseBackup();

    // A quota that refuses one store and takes the rest – the partial restore
    // that used to be entirely silent, and is the worst of the three outcomes:
    // some of the file is now live and some of it is not.
    refuseWrites((key) => key === "ratings");

    await confirm();

    const [message] = showToast.mock.calls.at(-1) ?? [];
    expect(message).toContain("ratings");
    expect(message).not.toContain("watchlist");
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
  });

  it("keeps the confirmation up after a refusal, so it can be tried again", async () => {
    renderPortability();
    await chooseBackup();

    const setItem = refuseWrites();

    await confirm();

    // Still on screen, and no longer stuck on "Restoring…".
    const retry = screen.getByRole("button", { name: "Replace and restore" });
    expect(retry).toBeDefined();

    setItem.mockRestore();
    await confirm();

    expect(showToast).toHaveBeenLastCalledWith("Backup restored", "success");
  });

  it("reports a refused dormant profile and preserves profiles that were not replaced", async () => {
    const originalWatchlist = JSON.stringify([{ id: 12, title: "Original", mediaType: "movie" }]);
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, originalWatchlist);
    window.localStorage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify([
        { id: "default", name: "Me" },
        { id: "old", name: "Existing" },
      ]),
    );
    window.localStorage.setItem("profile-data:old", '{"watchlist":"[]"}');
    renderPortability();
    await chooseBackup(
      backupFile({
        activeProfile: { id: "imported", name: "Imported active" },
        otherProfiles: [{ id: "p2", name: "Imported", watchlist: [] }],
      }),
    );
    refuseWrites((key) => key === profileStoreKey(WATCHLIST_STORAGE_KEY, "p2"));

    await confirm();

    expect(showToast).not.toHaveBeenCalledWith("Backup restored", "success");
    expect(showToast.mock.calls.at(-1)?.[0]).toContain("watchlist");
    expect(getProfiles().map(({ id }) => id)).toEqual(["default", "old"]);
    expect(readProfileSlot("old")).toEqual({ watchlist: "[]" });
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(originalWatchlist);
    expect(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Replace and restore" }),
    ).toBeDefined();
  });

  it("names a profile the restore could not remove instead of its storage address", async () => {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "3f2a-old", name: "Existing" },
    ]));
    renderPortability();
    await chooseBackup(backupFile({ activeProfile: { id: "default", name: "Me" } }));
    refuseWrites((key) => key === deletedProfileKey("3f2a-old"));

    await confirm();

    const [message] = showToast.mock.calls.at(-1) ?? [];
    expect(message).toContain('Could not restore the profile "Existing" — your browser refused the write.');
    expect(message).not.toContain("profile-deleted");
    expect(message).not.toContain("3f2a");
  });

  it("names a dormant profile's refused store by the profile's name", async () => {
    renderPortability();
    await chooseBackup(backupFile({
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [{ id: "p2", name: "Imported", watchlist: [] }],
    }));
    refuseWrites((key) => key === profileStoreKey(WATCHED_STORAGE_KEY, "p2"));

    await confirm();

    expect(showToast.mock.calls.at(-1)?.[0]).toContain('Could not restore watched list for "Imported"');
  });

  it("updates the visible roster and active profile immediately after restoring", async () => {
    renderPortability(true);
    await chooseBackup(
      backupFile({
        activeProfile: { id: "p9", name: "Imported user" },
        otherProfiles: [{ id: "default", name: "Original user", watchlist: [] }],
      }),
    );

    await confirm();

    expect(window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("p9");
    const imported = screen.getByRole("button", {
      name: /^Imported user.*active$/,
    });
    const original = screen.getByRole("button", { name: "Original user" });
    expect((imported as HTMLButtonElement).disabled).toBe(true);
    expect((original as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /^Me.*active$/ })).toBeNull();
  });

  it("replaces current platforms with an explicitly empty backup selection", async () => {
    setSelectedProviderIds([8]);
    renderPortability();
    await chooseBackup(
      backupFile({
        settings: {
          region: "CZ",
          watchProviderFilter: "streaming-only",
          selectedProviderIds: [],
        },
      }),
    );

    await confirm();

    expect(getSettings().watchProviderFilter).toBe("streaming-only");
    expect(getSettings().selectedProviderIds).toEqual([]);
  });
});
