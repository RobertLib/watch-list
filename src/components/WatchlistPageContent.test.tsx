// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { WatchlistPageContent } from "./WatchlistPageContent";
import type { WatchlistPreferences } from "@/lib/watchlist-view";

/**
 * The page the whole app exists to fill.
 *
 * What is pinned here is the behaviour that has no server to fall back on. The
 * tab lives in the URL *fragment* – deliberately, because a fragment never
 * reaches a prerender – so the static HTML always ships the first tab and the
 * browser corrects it. That correction is invisible to a build and to a type,
 * and getting it wrong means a linked `#watched` opens on the wrong list.
 *
 * "Clear All" is the other half. There is no account and no undo: the confirm is
 * the only thing between a click and a watchlist that is gone, it has to empty
 * the tab the visitor is looking at rather than the other one, and a browser
 * that refuses the write has to say so instead of blanking the screen over data
 * that is still there.
 *
 * And the availability lookup is debounced and conditional – one round trip
 * behind a fan-out of TMDB reads, which should not happen for a list nobody is
 * grouping that way.
 *
 * Two more things are pinned below. The grid renders sixty titles and then a
 * button, because a list may hold two thousand and every card is a component
 * with images and buttons of its own. And the tabs are a real tab list – one
 * stop in the Tab order, arrows between them – rather than two buttons wearing
 * the role.
 */

const availabilityFor = vi.fn();

vi.mock("@/lib/api", () => ({
  getWatchlistAvailabilityFor: (...args: unknown[]) => availabilityFor(...args),
}));

vi.mock("./Toast", () => ({
  toast: { showToast: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    // A next/link prop rather than a DOM attribute: React warns when one reaches
    // an <a>, and every link in this app sets it.
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

// The cards carry their own buttons, posters and links. This file is about which
// titles reach the screen and in what order, so they are reduced to their title.
vi.mock("@/components/MediaCard", () => ({
  MediaCard: ({ item }: { item: { title: string } }) => (
    <span data-testid="card">{item.title}</span>
  ),
}));

vi.mock("@/components/MediaListRow", () => ({
  MediaListRow: ({ item }: { item: { title: string } }) => (
    <span data-testid="row">{item.title}</span>
  ),
}));

vi.mock("@/components/ShareListButton", () => ({
  ShareListButton: () => <button type="button">Share</button>,
}));

/**
 * The controls, reduced to the two things this page reads back from them.
 *
 * Driving `onQueryChange` and `onChange` directly keeps the filtering assertions
 * about `WatchlistPageContent` rather than about how the real control bar is
 * laid out – which is its own component's business, and its own test's.
 */
vi.mock("@/components/WatchlistControls", () => ({
  WatchlistControls: ({
    preferences,
    onChange,
    query,
    onQueryChange,
    counts,
    isCheckingAvailability,
  }: {
    preferences: WatchlistPreferences;
    onChange: (next: WatchlistPreferences) => void;
    query: string;
    onQueryChange: (next: string) => void;
    counts: { all: number; movie: number; tv: number };
    isCheckingAvailability: boolean;
  }) => (
    <div>
      <input
        aria-label="Filter titles"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => onChange({ ...preferences, grouping: "availability" })}
      >
        Group by availability
      </button>
      <span data-testid="counts">
        {counts.all}/{counts.movie}/{counts.tv}
      </span>
      {isCheckingAvailability && <span data-testid="checking">Checking</span>}
    </div>
  ),
}));

const { toast } = await import("./Toast");

function saved(title: string, id: number, overrides = {}) {
  return {
    id,
    title,
    mediaType: "movie",
    posterPath: null,
    voteAverage: 8,
    releaseDate: "1999-10-15",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function seen(title: string, id: number, overrides = {}) {
  return {
    id,
    title,
    mediaType: "movie",
    posterPath: null,
    voteAverage: 8,
    releaseDate: "1999-10-15",
    watchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function seed({
  watchlist = [] as unknown[],
  watched = [] as unknown[],
} = {}) {
  window.localStorage.setItem(
    WATCHLIST_STORAGE_KEY,
    JSON.stringify(watchlist),
  );
  window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watched));
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <WatchlistProvider>
      <WatchedProvider>{children}</WatchedProvider>
    </WatchlistProvider>
  );
}

async function renderPage() {
  const result = render(<WatchlistPageContent />, { wrapper });
  // The providers hydrate from storage in a mount effect; without this the
  // assertions run against the "still loading" spinner.
  await act(async () => {});
  return result;
}

/** Set the fragment and let the store's `hashchange` listener see it. */
async function setFragment(fragment: string) {
  await act(async () => {
    window.location.hash = fragment;
    fireEvent(window, new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
  availabilityFor.mockResolvedValue({
    region: "CZ",
    hasSelectedProviders: false,
    byKey: {},
    checked: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.location.hash = "";
});

describe("with nothing saved anywhere", () => {
  it("offers somewhere to go instead of an empty grid", async () => {
    seed();
    await renderPage();

    expect(screen.getByText(/your watchlist is empty/i)).toBeTruthy();
    expect(screen.getByText(/discover content/i)).toBeTruthy();
  });

  it("shows no tabs, because there is nothing to switch between", async () => {
    seed();
    await renderPage();

    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("the tab in the URL fragment", () => {
  /**
   * The prerender cannot see a fragment, so the HTML always ships "to watch".
   * Anything else would be a hydration mismatch on the app's busiest page.
   */
  it("starts on to-watch when there is no fragment", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
  });

  it("opens the watched list for #watched", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    await setFragment("#watched");

    expect(screen.getByTestId("card").textContent).toBe("Heat");
  });

  it("goes back to to-watch when the fragment is cleared", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    await setFragment("#watched");
    expect(screen.getByTestId("card").textContent).toBe("Heat");

    await setFragment("");
    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
  });

  it("ignores a fragment that names no tab", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    await setFragment("#something-else");

    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
  });
});

describe("clearing a list", () => {
  /**
   * There is no server copy and no undo, so the confirm is the only thing
   * between a click and a watchlist that is gone.
   */
  it("does nothing when the confirm is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    seed({ watchlist: [saved("Fight Club", 550)] });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    });

    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
  });

  it("empties the watchlist from the to-watch tab", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    });

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    // The other tab is untouched.
    expect(JSON.parse(window.localStorage.getItem(WATCHED_STORAGE_KEY) ?? "[]"))
      .toHaveLength(1);
  });

  /**
   * The tab decides which list goes. Clearing the wrong one is the failure this
   * page can least afford, and nothing about the button says which it will be.
   */
  it("empties the watched list from the watched tab", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();
    await setFragment("#watched");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    });

    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "[]"),
    ).toHaveLength(1);
  });

  it("asks about the list the visitor is actually looking at", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();
    await setFragment("#watched");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    });

    expect(confirmSpy.mock.calls[0][0]).toMatch(/watched list/i);
  });

  it("reports a refused write rather than blanking the screen", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ watchlist: [saved("Fight Club", 550)] });
    await renderPage();

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      STORAGE_REFUSED_MESSAGE,
      "error",
    );
  });
});

describe("counts and their plurals", () => {
  it("says 'item' for one and 'items' for more", async () => {
    seed({ watchlist: [saved("Fight Club", 550)] });
    const { unmount } = await renderPage();
    expect(screen.getByText(/1 item to watch/i)).toBeTruthy();
    unmount();

    seed({ watchlist: [saved("Fight Club", 550), saved("Heat", 949)] });
    await renderPage();
    expect(screen.getByText(/2 items to watch/i)).toBeTruthy();
  });

  it("says 'title' for one watched and 'titles' for more", async () => {
    seed({ watched: [seen("Heat", 949)] });
    const { unmount } = await renderPage();
    await setFragment("#watched");
    expect(screen.getByText(/1 title you already saw/i)).toBeTruthy();
    unmount();

    window.location.hash = "";
    seed({ watched: [seen("Heat", 949), seen("Fight Club", 550)] });
    await renderPage();
    await setFragment("#watched");
    expect(screen.getByText(/2 titles you already saw/i)).toBeTruthy();
  });

  it("counts films and shows separately for the filter bar", async () => {
    seed({
      watchlist: [
        saved("Fight Club", 550),
        saved("The Wire", 1438, { mediaType: "tv" }),
        saved("Heat", 949),
      ],
    });
    await renderPage();

    expect(screen.getByTestId("counts").textContent).toBe("3/2/1");
  });
});

describe("filtering", () => {
  it("narrows the grid to what matches the query", async () => {
    seed({
      watchlist: [saved("Fight Club", 550), saved("Heat", 949)],
    });
    await renderPage();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Filter titles"), {
        target: { value: "heat" },
      });
    });

    expect(screen.getAllByTestId("card")).toHaveLength(1);
    expect(screen.getByTestId("card").textContent).toBe("Heat");
  });

  it("says so when a filter matches nothing, rather than showing a blank page", async () => {
    seed({ watchlist: [saved("Fight Club", 550)] });
    await renderPage();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Filter titles"), {
        target: { value: "zzzz" },
      });
    });

    expect(screen.getByText(/nothing here matches those filters/i)).toBeTruthy();
  });
});

describe("a long list", () => {
  /** Enough titles to need a second page, with no two sharing a name. */
  function manyTitles(count: number) {
    return Array.from({ length: count }, (_, i) =>
      saved(`Title ${String(i + 1).padStart(3, "0")}`, 1000 + i),
    );
  }

  it("renders the first sixty and offers the rest", async () => {
    seed({ watchlist: manyTitles(70) });
    await renderPage();

    expect(screen.getAllByTestId("card")).toHaveLength(60);
    expect(screen.getByRole("button", { name: /show 10 more/i })).toBeTruthy();
    expect(screen.getByText(/10 more titles not shown/i)).toBeTruthy();
  });

  it("renders the next page on request, and drops the button when it is all out", async () => {
    seed({ watchlist: manyTitles(70) });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show 10 more/i }));
    });

    expect(screen.getAllByTestId("card")).toHaveLength(70);
    expect(screen.queryByRole("button", { name: /show .* more/i })).toBeNull();
  });

  it("offers nothing more for a list that fits on one page", async () => {
    seed({ watchlist: manyTitles(60) });
    await renderPage();

    expect(screen.getAllByTestId("card")).toHaveLength(60);
    expect(screen.queryByRole("button", { name: /show .* more/i })).toBeNull();
  });

  /**
   * A count carried across a filter change would open the narrowed list already
   * three pages deep – and, worse, carry a "show more" over to a tab whose list
   * is shorter than the count.
   */
  it("starts over when the filter changes", async () => {
    seed({ watchlist: manyTitles(130) });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /show 60 more/i }));
    });
    expect(screen.getAllByTestId("card")).toHaveLength(120);

    // Titles 100–130 all match "Title 1" … so do 100–199; narrow to "Title 12",
    // which leaves 120–129: ten titles, one page.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Filter titles"), {
        target: { value: "Title 12" },
      });
    });
    expect(screen.getAllByTestId("card")).toHaveLength(10);

    // Back to everything: the count is a fresh sixty, not the hundred and
    // twenty it had been.
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Filter titles"), {
        target: { value: "" },
      });
    });
    expect(screen.getAllByTestId("card")).toHaveLength(60);
  });
});

describe("the tabs, from the keyboard", () => {
  it("keeps only the selected tab in the Tab order", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    const [toWatch, watched] = screen.getAllByRole("tab");
    expect(toWatch.getAttribute("aria-selected")).toBe("true");
    expect(toWatch.getAttribute("tabindex")).toBe("0");
    expect(watched.getAttribute("aria-selected")).toBe("false");
    expect(watched.getAttribute("tabindex")).toBe("-1");
  });

  it("moves to the next tab on the right arrow, and selects it", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    const [toWatch, watched] = screen.getAllByRole("tab");
    toWatch.focus();

    await act(async () => {
      fireEvent.keyDown(toWatch, { key: "ArrowRight" });
      // The selection travels through the fragment, like a click does.
      fireEvent(window, new HashChangeEvent("hashchange"));
    });

    expect(document.activeElement).toBe(watched);
    expect(watched.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("card").textContent).toBe("Heat");
  });

  it("wraps from the first tab to the last on the left arrow", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    const [toWatch, watched] = screen.getAllByRole("tab");

    await act(async () => {
      fireEvent.keyDown(toWatch, { key: "ArrowLeft" });
      fireEvent(window, new HashChangeEvent("hashchange"));
    });

    expect(document.activeElement).toBe(watched);
    expect(screen.getByTestId("card").textContent).toBe("Heat");
  });

  it("goes to the first and last tabs on Home and End", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    const [toWatch, watched] = screen.getAllByRole("tab");

    await act(async () => {
      fireEvent.keyDown(toWatch, { key: "End" });
      fireEvent(window, new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement).toBe(watched);

    await act(async () => {
      fireEvent.keyDown(watched, { key: "Home" });
      fireEvent(window, new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement).toBe(toWatch);
    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
  });

  it("points each tab at its panel", async () => {
    seed({ watchlist: [saved("Fight Club", 550)] });
    await renderPage();

    const [toWatch] = screen.getAllByRole("tab");
    const panel = screen.getByRole("tabpanel");
    expect(toWatch.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(toWatch.id);
  });
});

describe("the availability lookup", () => {
  /**
   * One round trip standing in front of a fan-out of TMDB reads. A list nobody
   * is grouping that way should not pay for it at all.
   */
  it("is not requested while the grouping does not ask for it", async () => {
    vi.useFakeTimers();
    seed({ watchlist: [saved("Fight Club", 550)] });

    render(<WatchlistPageContent />, { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(availabilityFor).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("is requested once the grouping asks, after the debounce", async () => {
    vi.useFakeTimers();
    seed({ watchlist: [saved("Fight Club", 550)] });

    render(<WatchlistPageContent />, { wrapper });
    await act(async () => {});

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /group by availability/i }),
      );
    });

    // Still inside the 300ms window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(availabilityFor).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(availabilityFor).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  /**
   * Keyed on the list rather than on the view, so typing in the filter box –
   * which changes what is on screen but not what is saved – does not re-request
   * anything.
   */
  it("is not repeated when only the filter query changes", async () => {
    vi.useFakeTimers();
    seed({ watchlist: [saved("Fight Club", 550), saved("Heat", 949)] });

    render(<WatchlistPageContent />, { wrapper });
    await act(async () => {});

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /group by availability/i }),
      );
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(availabilityFor).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Filter titles"), {
        target: { value: "heat" },
      });
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(availabilityFor).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("survives a failed lookup without taking the page with it", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    availabilityFor.mockRejectedValue(new Error("TMDB is down"));
    seed({ watchlist: [saved("Fight Club", 550)] });

    render(<WatchlistPageContent />, { wrapper });
    await act(async () => {});

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /group by availability/i }),
      );
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
    vi.useRealTimers();
  });
});
