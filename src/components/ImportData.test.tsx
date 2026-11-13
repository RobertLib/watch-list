// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ImportOutcome } from "@/lib/import/apply";
import type { Resolution } from "@/lib/import/resolve";
import type { ImportEntry } from "@/lib/import/types";
import { buildZip } from "@/test/zip";

const contexts = vi.hoisted(() => ({
  refreshWatchlist: vi.fn(),
  refreshWatched: vi.fn(),
  refreshProgress: vi.fn(),
}));
const resolveEntries = vi.hoisted(() => vi.fn());
const applyImport = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/WatchlistContext", () => ({
  useWatchlist: () => ({ profileId: "default", refreshWatchlist: contexts.refreshWatchlist }),
}));
vi.mock("@/contexts/WatchedContext", () => ({
  useWatched: () => ({ refreshWatched: contexts.refreshWatched }),
}));
vi.mock("@/contexts/EpisodeProgressContext", () => ({
  useEpisodeProgress: () => ({ refreshProgress: contexts.refreshProgress }),
}));
vi.mock("@/lib/import/resolve", () => ({ resolveEntries }));
vi.mock("@/lib/import/apply", () => ({ applyImport }));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const { ImportData } = await import("./ImportData");

const WATCHLIST_CSV =
  "Date,Name,Year,Letterboxd URI\n2023-09-26,Sanctuary,2022,https://boxd.it/wPKW\n2018-01-27,Heat,1995,https://boxd.it/x\n";
const RATINGS_CSV = "Date,Name,Year,Letterboxd URI,Rating\n2023-09-30,Past Lives,2023,https://boxd.it/oNB8,5\n";

const COUNTS = {
  watchlistAdded: 0, watchedAdded: 0, ratingsAdded: 0, ratingsKept: 0, episodesTicked: 0,
  showsTracked: 0, movedOffWatchlist: 0, watchlistFull: 0, watchedFull: 0,
};

/** Every entry matched, as the title it names. */
function matchAll(entries: ImportEntry[]): Resolution {
  return {
    resolved: entries.map((entry, index) => ({
      entry,
      title: {
        mediaType: "movie", id: index + 1, title: entry.ref.title ?? "", posterPath: null,
        releaseDate: "", voteAverage: 0,
      },
    })),
    unmatched: [],
    failed: [],
  };
}

async function choose(...files: File[]) {
  const input = screen.getByLabelText("Choose export files");
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
  // Reading the files is a chain of awaits past the change handler.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  resolveEntries.mockImplementation(async (entries: ImportEntry[]) => matchAll(entries));
  applyImport.mockResolvedValue({ status: "ok", counts: { ...COUNTS, watchlistAdded: 2 } } satisfies ImportOutcome);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("ImportData", () => {
  it("shows what an export holds before importing any of it", async () => {
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"), new File([RATINGS_CSV], "ratings.csv"));

    expect(screen.getByRole("heading", { name: "Found in your Letterboxd export" })).toBeDefined();
    expect(screen.getByText("2 titles for your watchlist")).toBeDefined();
    expect(screen.getByText("1 watched title")).toBeDefined();
    expect(screen.getByText("1 score")).toBeDefined();
    // Nothing has been looked up or written yet.
    expect(resolveEntries).not.toHaveBeenCalled();
    expect(applyImport).not.toHaveBeenCalled();
  });

  it("matches, writes into the profile it was started for, and says what was added", async () => {
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(resolveEntries.mock.calls[0][0]).toHaveLength(2);
    expect(applyImport).toHaveBeenCalledWith("default", expect.arrayContaining([expect.anything()]));
    expect(screen.getByRole("heading", { name: "Imported" })).toBeDefined();
    expect(screen.getByText("2 titles added to your watchlist")).toBeDefined();
    // The lists were written from outside their contexts.
    expect(contexts.refreshWatchlist).toHaveBeenCalled();
    expect(contexts.refreshWatched).toHaveBeenCalled();
    expect(contexts.refreshProgress).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open your watchlist" }).getAttribute("href")).toBe("/watchlist");
  });

  it("reads an export straight out of its ZIP, and only the lists in it", async () => {
    const zip = buildZip([
      { name: "letterboxd-someone/watchlist.csv", content: WATCHLIST_CSV },
      // The account's own details: never opened.
      { name: "letterboxd-someone/profile.csv", content: "Username,Email Address\nsomeone,someone@example.com\n" },
      { name: "letterboxd-someone/deleted/watchlist.csv", content: WATCHLIST_CSV.replace("Heat", "Removed") },
    ]);
    render(<ImportData />);
    await choose(new File([zip], "letterboxd-someone.zip"));

    expect(screen.getByText("2 titles for your watchlist")).toBeDefined();
    expect(screen.queryByText(/Not read/)).toBeNull();
  });

  it("names the titles TMDB does not have", async () => {
    resolveEntries.mockImplementation(async (entries: ImportEntry[]) => ({
      ...matchAll(entries.slice(0, 1)),
      unmatched: entries.slice(1),
    }));
    applyImport.mockResolvedValue({ status: "ok", counts: { ...COUNTS, watchlistAdded: 1 } });
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByText("1 title was not found on TMDB:")).toBeDefined();
    expect(screen.getByText("Heat (1995)")).toBeDefined();
  });

  it("says to import again for titles TMDB did not answer for", async () => {
    resolveEntries.mockImplementation(async (entries: ImportEntry[]) => ({
      ...matchAll(entries.slice(0, 1)),
      failed: entries.slice(1),
    }));
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByText(/TMDB did not answer for 1 title/)).toBeDefined();
  });

  it("says so when everything was already here", async () => {
    applyImport.mockResolvedValue({ status: "ok", counts: COUNTS });
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByRole("heading", { name: "Everything in that export was already here" })).toBeDefined();
  });

  it("explains a refused write rather than reporting success", async () => {
    applyImport.mockResolvedValue({ status: "failed" });
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByRole("heading", { name: "Nothing was imported" })).toBeDefined();
    expect(screen.getByText(/would not store the import/)).toBeDefined();
    expect(screen.queryByRole("link", { name: "Open your watchlist" })).toBeNull();
  });

  it("says what was saved when the browser ran out of room part-way", async () => {
    applyImport.mockResolvedValue({
      status: "partial",
      counts: { ...COUNTS, watchedAdded: 1 },
      saved: ["watched"],
    });
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByRole("heading", { name: "Partly imported" })).toBeDefined();
    expect(screen.getByText(/Saved: watched\./)).toBeDefined();
  });

  it("refuses a file that is not an export, by name", async () => {
    render(<ImportData />);
    await choose(new File(["remember the milk"], "notes.txt"));

    expect(screen.getByRole("alert").textContent).toContain("Nothing here looks like an export");
    expect(screen.getByRole("alert").textContent).toContain("notes.txt");
    // The picker is still there to try another file.
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDefined();
  });

  it("says when an export is real but empty", async () => {
    render(<ImportData />);
    await choose(new File(["Date,Name,Year,Letterboxd URI\n"], "watchlist.csv"));

    expect(screen.getByRole("alert").textContent).toContain("has no watchlist, history, ratings or episodes");
  });

  it("imports nothing when cancelled before it starts", async () => {
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Cancel");

    expect(screen.getByRole("button", { name: "Choose files" })).toBeDefined();
    expect(resolveEntries).not.toHaveBeenCalled();
  });

  // Cancelling while titles are being matched: nothing has been written, and
  // nothing must be once the lookups come back.
  it("writes nothing when cancelled while matching", async () => {
    let finish!: (resolution: Resolution) => void;
    resolveEntries.mockImplementation(
      (entries: ImportEntry[], options: { signal: AbortSignal }) =>
        new Promise<Resolution>((resolve, reject) => {
          finish = resolve;
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("cancelled", "AbortError")),
          );
          void entries;
        }),
    );
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByRole("progressbar")).toBeDefined();
    await click("Cancel");
    finish({ resolved: [], unmatched: [], failed: [] });
    await act(async () => {});

    expect(applyImport).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a lookup that failed outright, with nothing saved", async () => {
    resolveEntries.mockRejectedValue(new TypeError("offline"));
    render(<ImportData />);
    await choose(new File([WATCHLIST_CSV], "watchlist.csv"));
    await click("Import 2 titles");

    expect(screen.getByRole("alert").textContent).toContain("stopped before anything was saved");
    expect(applyImport).not.toHaveBeenCalled();
  });
});
