// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TonightPicker } from "./TonightPicker";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import {
  REGION_KEY,
  SELECTED_PROVIDERS_KEY,
  refreshSettings,
} from "@/lib/settings";
import type { TonightCandidate } from "@/lib/tonight";
import { TonightCandidatesLoadError } from "@/lib/tonight-data";

/**
 * What the page says when it cannot pick anything.
 *
 * Three outcomes look alike from the outside and mean completely different
 * things: nothing saved, nothing matching the filters, and TMDB not answering.
 * The last one used to be rendered as the second – "Nothing on your list fits
 * that", with a button offering to reset filters that were never the problem.
 * On a page whose premise is that the list lives in this browser, an answer like
 * that reads as the list having gone missing.
 */

const { getTonightShortlist } = vi.hoisted(() => ({
  getTonightShortlist: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ getTonightShortlist }));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

function saveOneTitle() {
  window.localStorage.setItem(
    WATCHLIST_STORAGE_KEY,
    JSON.stringify([
      {
        id: 550,
        title: "Fight Club",
        mediaType: "movie",
        posterPath: "/poster.jpg",
        voteAverage: 8.4,
        releaseDate: "1999-10-15",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
}

function saveFilmAndSeries() {
  saveOneTitle();
  const saved = JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)!);
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
    ...saved,
    {
      id: 1396,
      title: "Breaking Bad",
      mediaType: "tv",
      posterPath: null,
      voteAverage: 8.9,
      releaseDate: "2008-01-20",
      addedAt: "2026-01-02T00:00:00.000Z",
    },
  ]));
}

function candidate(overrides: Partial<TonightCandidate> = {}): TonightCandidate {
  return {
    id: 550,
    mediaType: "movie",
    title: "Fight Club",
    posterPath: null,
    backdropPath: null,
    overview: null,
    slug: "fight-club-550",
    year: "1999",
    releaseDate: "1999-10-15",
    voteAverage: 8.4,
    runtime: 139,
    genres: ["Drama"],
    availability: "mine",
    providers: [{ id: 8, name: "Netflix", logoPath: null }],
    ...overrides,
  };
}

function changeSettingInAnotherTab(key: string, value: string) {
  const oldValue = window.localStorage.getItem(key);
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue: value }));
}

async function renderPicker() {
  await act(async () => {
    render(
      <WatchlistProvider>
        <WatchedProvider>
          <TonightPicker />
        </WatchedProvider>
      </WatchlistProvider>,
    );
  });
}

beforeEach(() => {
  window.localStorage.clear();
  refreshSettings();
  getTonightShortlist.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TonightPicker", () => {
  it("refreshes premiere eligibility when the visitor's local day changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 59));
    saveOneTitle();
    getTonightShortlist.mockResolvedValueOnce([]).mockResolvedValueOnce([candidate()]);
    await renderPicker();
    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(getTonightShortlist).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();
  });

  it("hides a removed title while another tab's replacement list is being resolved", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValueOnce([candidate()]);
    await renderPicker();
    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();

    let finish!: (shortlist: TonightCandidate[]) => void;
    getTonightShortlist.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await act(async () => {
      changeSettingInAnotherTab(WATCHLIST_STORAGE_KEY, JSON.stringify([{
        id: 680, title: "Pulp Fiction", mediaType: "movie", posterPath: null,
        voteAverage: 8.5, releaseDate: "1994-10-14", addedAt: "2026-01-02T00:00:00.000Z",
      }]));
    });

    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
    await act(async () => {
      finish([candidate({ id: 680, title: "Pulp Fiction", slug: "pulp-fiction-680" })]);
    });
    expect(screen.getByRole("link", { name: "Pulp Fiction" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
  });

  it("asks for titles before offering to pick one", async () => {
    getTonightShortlist.mockResolvedValue([]);
    await renderPicker();

    expect(screen.getByText("Nothing to pick from yet")).toBeDefined();
    expect(getTonightShortlist).not.toHaveBeenCalled();
  });

  // The regression: a rejected request fell through to the filter-reset panel.
  it("tells a failed load apart from a list that matches nothing", async () => {
    saveOneTitle();
    getTonightShortlist.mockRejectedValue(new Error("TMDB is down"));
    await renderPicker();

    expect(screen.getByText("Could not pick anything tonight")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
  });

  it("still says nothing fits when the shortlist really is empty", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValue([]);
    await renderPicker();

    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();
    expect(screen.queryByText("Could not pick anything tonight")).toBeNull();
  });

  it("keeps verified picks usable and counts every saved title when some details fail", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockRejectedValue(new TonightCandidatesLoadError(
      [candidate()], [{ id: 1396, mediaType: "tv" }],
    ));
    await renderPicker();

    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();
    expect(screen.getByText("Some title details could not be loaded")).toBeDefined();
    expect(screen.getByText(/1 of 2 saved titles are confirmed to fit/)).toBeDefined();
    expect(screen.getByText(/Details could not be loaded for 1 saved title\./)).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(screen.queryByText(/most recent saves/)).toBeNull();
  });

  it("does not report an empty pool while unresolved titles could fit the selected type", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockRejectedValue(new TonightCandidatesLoadError(
      [candidate()], [{ id: 1396, mediaType: "tv" }],
    ));
    await renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    fireEvent.click(screen.getByRole("button", { name: "Under 1 hour" }));
    fireEvent.change(screen.getByRole("combobox", { name: "In the mood for" }), { target: { value: "Drama" } });
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));

    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
    expect(screen.getByText("Some title details could not be loaded")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear the filters" })).toBeNull();
  });

  it("can report an empty pool when the unresolved titles have a different media type", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockRejectedValue(new TonightCandidatesLoadError(
      [candidate({ runtime: 139 })], [{ id: 1396, mediaType: "tv" }],
    ));
    await renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Film" }));
    fireEvent.click(screen.getByRole("button", { name: "Under 1 hour" }));

    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();
    expect(screen.getByText("Some title details could not be loaded")).toBeDefined();
  });

  it("offers a detail retry when no candidates were verified", async () => {
    saveOneTitle();
    getTonightShortlist.mockRejectedValue(new TonightCandidatesLoadError(
      [], [{ id: 550, mediaType: "movie" }],
    ));
    await renderPicker();

    expect(screen.getByText("Some title details could not be loaded")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(screen.queryByText("Could not pick anything tonight")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("recovers missing details on retry while retaining every selected filter", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockRejectedValueOnce(new TonightCandidatesLoadError(
      [candidate()], [{ id: 1396, mediaType: "tv" }],
    ));
    await renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    fireEvent.click(screen.getByRole("button", { name: "Under 1 hour" }));
    fireEvent.change(screen.getByRole("combobox", { name: "In the mood for" }), { target: { value: "Drama" } });
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));
    getTonightShortlist.mockResolvedValueOnce([
      candidate(),
      candidate({ id: 1396, mediaType: "tv", title: "Breaking Bad", slug: "breaking-bad-1396", runtime: 45 }),
    ]);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });

    expect(getTonightShortlist).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "Breaking Bad" })).toBeDefined();
    expect(screen.queryByText("Some title details could not be loaded")).toBeNull();
    for (const name of ["Series", "Under 1 hour", "Only what I can play now"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("true");
    }
    expect((screen.getByRole("combobox", { name: "In the mood for" }) as HTMLSelectElement).value).toBe("Drama");
    expect(screen.getByText(/1 of 2 saved titles fit\./)).toBeDefined();
  });

  it("combines detail and availability failures into one retry", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockRejectedValue(new TonightCandidatesLoadError(
      [candidate({ availability: "unknown", providers: [] })], [{ id: 1396, mediaType: "tv" }],
    ));
    await renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));

    expect(screen.getByText("Some title details could not be loaded")).toBeDefined();
    expect(screen.getByText(/Streaming availability also could not be checked for 1 title/)).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
  });

  it("retains the selected genre when that genre's detail lookup fails during a retry", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockRejectedValueOnce(new TonightCandidatesLoadError(
      [candidate()], [{ id: 1396, mediaType: "tv" }],
    ));
    await renderPicker();
    fireEvent.change(screen.getByRole("combobox", { name: "In the mood for" }), { target: { value: "Drama" } });
    getTonightShortlist.mockRejectedValueOnce(new TonightCandidatesLoadError(
      [candidate({ id: 1396, mediaType: "tv", genres: ["Comedy"] })], [{ id: 550, mediaType: "movie" }],
    ));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });

    expect((screen.getByRole("combobox", { name: "In the mood for" }) as HTMLSelectElement).value).toBe("Drama");
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
  });

  it("keeps a verified pick available alongside a retry for unchecked titles", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValue([
      candidate(),
      candidate({ id: 680, title: "Unchecked film", availability: "unknown", providers: [] }),
    ]);
    await renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));

    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();
    expect(screen.getByText("Could not check streaming availability")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeDefined();
  });

  it("only reports missing availability for titles that fit the other filters", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValue([
      candidate({ availability: "unknown", providers: [] }),
    ]);
    await renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));
    expect(screen.getByText("Could not check streaming availability")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Under 1 hour/ }));
    expect(screen.queryByText("Could not check streaming availability")).toBeNull();
    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();
  });

  it("offers a retry that asks again", async () => {
    saveOneTitle();
    getTonightShortlist.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderPicker();

    getTonightShortlist.mockResolvedValueOnce([]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getTonightShortlist).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Could not pick anything tonight")).toBeNull();
  });

  it.each([
    ["region", REGION_KEY, "CZ"],
    ["subscriptions", SELECTED_PROVIDERS_KEY, ""],
  ])("refreshes after %s change in another tab and hides the previous availability", async (
    _setting,
    key,
    value,
  ) => {
    saveOneTitle();
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "8");
    refreshSettings();
    getTonightShortlist.mockResolvedValueOnce([candidate()]);
    await renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Only what I can play now" }));
    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();

    let finish!: (shortlist: TonightCandidate[]) => void;
    getTonightShortlist.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    await act(async () => { changeSettingInAnotherTab(key, value); });

    expect(getTonightShortlist).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();

    await act(async () => { finish([candidate({ availability: "streaming" })]); });
    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Only what I can play now" })
      .getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the old country's pick hidden when the refresh fails and retries with current settings", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValueOnce([candidate()]);
    await renderPicker();
    expect(screen.getByRole("link", { name: "Fight Club" })).toBeDefined();

    getTonightShortlist.mockRejectedValueOnce(new Error("TMDB is down"));
    await act(async () => { changeSettingInAnotherTab(REGION_KEY, "CZ"); });
    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
    expect(screen.getByText("Could not pick anything tonight")).toBeDefined();

    getTonightShortlist.mockResolvedValueOnce([candidate({ title: "Current-region pick" })]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });
    expect(getTonightShortlist).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("link", { name: "Current-region pick" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
  });

  it("ignores a pending response from a region that has since changed again", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValueOnce([candidate()]);
    await renderPicker();

    let finishOld!: (shortlist: TonightCandidate[]) => void;
    getTonightShortlist.mockImplementationOnce(() => new Promise((resolve) => {
      finishOld = resolve;
    }));
    await act(async () => { changeSettingInAnotherTab(REGION_KEY, "CZ"); });

    getTonightShortlist.mockResolvedValueOnce([candidate({ title: "UK pick" })]);
    await act(async () => { changeSettingInAnotherTab(REGION_KEY, "GB"); });
    expect(screen.getByRole("link", { name: "UK pick" })).toBeDefined();

    await act(async () => { finishOld([candidate({ title: "Stale Czech pick" })]); });
    expect(screen.getByRole("link", { name: "UK pick" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Stale Czech pick" })).toBeNull();
  });

  it("aborts a superseded lookup and ignores its late partial failure", async () => {
    saveFilmAndSeries();
    getTonightShortlist.mockResolvedValueOnce([candidate()]);
    await renderPicker();

    let rejectOld!: (error: Error) => void;
    let oldSignal!: AbortSignal;
    getTonightShortlist.mockImplementationOnce((_refs, signal: AbortSignal) => {
      oldSignal = signal;
      return new Promise((_resolve, reject) => { rejectOld = reject; });
    });
    await act(async () => { changeSettingInAnotherTab(REGION_KEY, "CZ"); });
    expect(oldSignal.aborted).toBe(false);

    getTonightShortlist.mockResolvedValueOnce([candidate({ title: "UK pick" })]);
    await act(async () => { changeSettingInAnotherTab(REGION_KEY, "GB"); });
    expect(oldSignal.aborted).toBe(true);

    await act(async () => {
      rejectOld(new TonightCandidatesLoadError(
        [candidate({ title: "Stale Czech pick" })], [{ id: 1396, mediaType: "tv" }],
      ));
    });

    expect(screen.getByRole("link", { name: "UK pick" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Stale Czech pick" })).toBeNull();
    expect(screen.queryByText("Some title details could not be loaded")).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });
});
