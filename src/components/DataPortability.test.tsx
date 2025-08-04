// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { DataPortability } from "./DataPortability";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { BACKUP_FORMAT, BACKUP_VERSION } from "@/lib/portable-data";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";

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
function backupFile(): File {
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

  return new File([JSON.stringify(backup)], "watchlist-backup.json", {
    type: "application/json",
  });
}

function renderPortability() {
  return render(
    <WatchlistProvider>
      <WatchedProvider>
        <EpisodeProgressProvider>
          <DataPortability />
        </EpisodeProgressProvider>
      </WatchedProvider>
    </WatchlistProvider>,
  );
}

/** Hand the component a file and get as far as the confirmation panel. */
async function chooseBackup() {
  const input = screen.getByLabelText("Choose a backup file");

  await act(async () => {
    fireEvent.change(input, { target: { files: [backupFile()] } });
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
  window.localStorage.clear();
  showToast.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    expect(message).toContain("watchlist");
  });

  it("names the stores that did not fit, not just the fact that one did not", async () => {
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
});
