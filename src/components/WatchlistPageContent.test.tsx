// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { initializeProfileStorage, readProfileStore } from "@/lib/profile-storage";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PROFILES_STORAGE_KEY,
  readProfileSlot,
  switchProfile,
} from "@/lib/profiles";
import {
  refreshSettings,
  REGION_KEY,
  SELECTED_PROVIDERS_KEY,
} from "@/lib/settings";
import { WatchlistPageContent } from "./WatchlistPageContent";
import { getDefaultPreferences, savePreferences, type WatchlistPreferences } from "@/lib/watchlist-view";
import type { WatchlistAvailability } from "@/lib/watchlist-availability";

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
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  refreshSettings();
  window.location.hash = "";
  availabilityFor.mockResolvedValue({
    region: "CZ",
    hasSelectedProviders: false,
    byKey: {},
    checked: 0,
    failedKeys: [],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  /**
   * Next navigates with `history.pushState`, which fires no `hashchange`. On
   * `/watchlist#watched` the header's "Watchlist" link pushes `/watchlist`, and
   * the Watched tab stayed selected under a URL that names To Watch. The
   * Navigation API's `currententrychange` fires for every same-document URL
   * change, `pushState` included; jsdom has no Navigation API, so it is stood
   * in for here.
   */
  it("follows a navigation that drops the fragment without a hashchange", async () => {
    const navigation = new EventTarget();
    vi.stubGlobal("navigation", navigation);
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    const view = await renderPage();

    await setFragment("#watched");
    expect(screen.getByTestId("card").textContent).toBe("Heat");

    await act(async () => {
      window.history.pushState(null, "", window.location.pathname);
      navigation.dispatchEvent(new Event("currententrychange"));
    });
    expect(screen.getByTestId("card").textContent).toBe("Fight Club");

    // And lets go of the API with the page.
    const remove = vi.spyOn(navigation, "removeEventListener");
    view.unmount();
    expect(remove).toHaveBeenCalledWith("currententrychange", expect.any(Function));
  });
});

describe("clearing a list", () => {
  it.each(["to-watch", "watched"])("waits for the queued %s clear and blocks another confirmation until it finishes", async (tab) => {
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();
    if (tab === "watched") await setFragment("#watched");
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      enter();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await entered;
    const requests = vi.spyOn(navigator.locks, "request");
    const button = screen.getByRole("button", { name: /clear all/i });

    await act(async () => { fireEvent.click(button); fireEvent.click(button); });

    // Busy but focusable: native `disabled` blurs the focused button.
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(requests).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("card").textContent).toBe(tab === "watched" ? "Heat" : "Fight Club");
    expect(toast.showToast).not.toHaveBeenCalled();

    await act(async () => { release(); await holding; });

    expect(readProfileStore(tab === "watched" ? WATCHED_STORAGE_KEY : WATCHLIST_STORAGE_KEY))
      .toBe(tab === "watched" ? null : "[]");
    expect(JSON.parse(readProfileStore(tab === "watched" ? WATCHLIST_STORAGE_KEY : WATCHED_STORAGE_KEY)!))
      .toHaveLength(1);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("awaits and reports a watched clear that the lock manager refuses", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ watched: [seen("Heat", 949)] });
    await renderPage();
    await setFragment("#watched");
    vi.spyOn(navigator.locks, "request").mockRejectedValue(new Error("Lock refused"));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /clear all/i })); });

    expect(screen.getByTestId("card").textContent).toBe("Heat");
    expect(screen.getByRole("button", { name: /clear all/i }).getAttribute("aria-disabled")).toBe("false");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
  });

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

    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe("[]");
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

  it.each([
    ["to-watch", false], ["watched", false],
    ["to-watch", true], ["watched", true],
  ] as const)(
    "keeps both profiles' lists before a %s click with pending storage events (filter rerender: %s)",
    async (tab, rerender) => {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
      seed({ watchlist: [saved("Alice film", 1)], watched: [seen("Alice watched", 10)] });
      const bobLists = {
        watchlist: JSON.stringify([saved("Bob film", 2)]),
        watched: JSON.stringify([seen("Bob watched", 20)]),
      };
      localStorage.setItem("profile-data:bob", JSON.stringify(bobLists));
      await renderPage();
      if (tab === "watched") await setFragment("#watched");

      // Another tab has switched the pointer; this page has not received its
      // storage events, so its button still belongs to Alice's displayed list.
      expect(await switchProfile("bob")).toBe(true);
      if (rerender) {
        fireEvent.change(screen.getByRole("textbox", { name: "Filter titles" }), {
          target: { value: "Alice" },
        });
      }
      expect(screen.getByTestId("card").textContent).toBe(
        tab === "watched" ? "Alice watched" : "Alice film",
      );
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /clear all/i })); });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(readProfileStore(WATCHLIST_STORAGE_KEY, "bob")).toBe(bobLists.watchlist);
      expect(readProfileStore(WATCHED_STORAGE_KEY, "bob")).toBe(bobLists.watched);
      const aliceLists = readProfileSlot("default");
      expect(JSON.parse(aliceLists.watchlist)[0].title).toBe("Alice film");
      expect(JSON.parse(aliceLists.watched)[0].title).toBe("Alice watched");
      expect(toast.showToast).toHaveBeenCalledWith(
        "Your active profile changed. Review the current list and try again.",
        "info",
      );
    },
  );

  it.each(["to-watch", "watched"])(
    "allows clearing the incoming %s list after its storage event updates the displayed data",
    async (tab) => {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      seed({ watchlist: [saved("Alice film", 1)], watched: [seen("Alice watched", 10)] });
      localStorage.setItem("profile-data:bob", JSON.stringify({
        watchlist: JSON.stringify([saved("Bob film", 2)]),
        watched: JSON.stringify([seen("Bob watched", 20)]),
      }));
      await renderPage();
      if (tab === "watched") await setFragment("#watched");
      expect(await switchProfile("bob")).toBe(true);

      const key = tab === "watched" ? WATCHED_STORAGE_KEY : WATCHLIST_STORAGE_KEY;
      fireEvent(window, new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      expect(screen.getByTestId("card").textContent).toBe(
        tab === "watched" ? "Bob watched" : "Bob film",
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /clear all/i })); });

      expect(readProfileStore(key, "bob")).toBe(key === WATCHLIST_STORAGE_KEY ? "[]" : null);
      const aliceLists = readProfileSlot("default");
      expect(JSON.parse(aliceLists.watchlist)[0].title).toBe("Alice film");
      expect(JSON.parse(aliceLists.watched)[0].title).toBe("Alice watched");
    },
  );

  it.each(["to-watch", "watched"])(
    "keeps both profiles' lists when the profile changes during %s confirmation",
    async (tab) => {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
      seed({ watchlist: [saved("Alice film", 1)], watched: [seen("Alice watched", 10)] });
      const bobLists = {
        watchlist: JSON.stringify([saved("Bob film", 2)]),
        watched: JSON.stringify([seen("Bob watched", 20)]),
      };
      localStorage.setItem("profile-data:bob", JSON.stringify(bobLists));
      await renderPage();
      if (tab === "watched") await setFragment("#watched");
      expect(screen.getByTestId("card").textContent).toBe(
        tab === "watched" ? "Alice watched" : "Alice film",
      );

      vi.spyOn(window, "confirm").mockImplementation(() => {
        // A different tab can switch while this tab's blocking dialog is open.
        initializeProfileStorage();
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
        return true;
      });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /clear all/i })); });

      expect(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)).toBe("bob");
      expect(readProfileStore(WATCHLIST_STORAGE_KEY, "bob")).toBe(bobLists.watchlist);
      expect(readProfileStore(WATCHED_STORAGE_KEY, "bob")).toBe(bobLists.watched);
      const aliceLists = readProfileSlot("default");
      expect(JSON.parse(aliceLists.watchlist)[0].title).toBe("Alice film");
      expect(JSON.parse(aliceLists.watched)[0].title).toBe("Alice watched");
      expect(toast.showToast).toHaveBeenCalledWith(
        "Your active profile changed. Review the current list and try again.",
        "info",
      );
    },
  );

  it.each(["before", "after"])(
    "keeps saved lists when the active profile cannot be read %s confirmation",
    async (when) => {
      seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
      await renderPage();
      const read = Storage.prototype.getItem;
      const originalWatchlist = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      const originalWatched = localStorage.getItem(WATCHED_STORAGE_KEY);
      let refuseProfileRead = when === "before";
      const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => {
        refuseProfileRead = true;
        return true;
      });
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(function(this: Storage, key) {
        if (refuseProfileRead && key === ACTIVE_PROFILE_STORAGE_KEY) {
          throw new DOMException("Read denied", "SecurityError");
        }
        return read.call(this, key);
      });
      const remove = vi.spyOn(Storage.prototype, "removeItem");

      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /clear all/i })); });

      expect(remove).not.toHaveBeenCalled();
      expect(localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(originalWatchlist);
      expect(localStorage.getItem(WATCHED_STORAGE_KEY)).toBe(originalWatched);
      expect(confirmSpy).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
      expect(toast.showToast).toHaveBeenCalledWith(
        "Could not check your active profile. Reload the page and try again.",
        "error",
      );
    },
  );

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

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
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
      // The selection travels through the fragment, like a click does – and
      // without any `hashchange` arriving to tell the store about it.
      fireEvent.keyDown(toWatch, { key: "ArrowRight" });
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
    });
    expect(document.activeElement).toBe(watched);

    await act(async () => {
      fireEvent.keyDown(watched, { key: "Home" });
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

describe("switching tabs and the URL", () => {
  /**
   * Assigning `location.hash` navigated: an empty fragment means "the top of
   * the document", so returning to "To Watch" scrolled the page up, and every
   * switch – one per arrow key – added an entry for the Back button.
   */
  it("rewrites the fragment in place, without a navigation or a Back entry", async () => {
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    const hashChanges = vi.fn();
    window.addEventListener("hashchange", hashChanges);
    const entries = window.history.length;
    const [toWatch, watched] = screen.getAllByRole("tab");

    await act(async () => { fireEvent.keyDown(toWatch, { key: "ArrowRight" }); });
    expect(window.location.hash).toBe("#watched");
    expect(screen.getByTestId("card").textContent).toBe("Heat");

    await act(async () => { fireEvent.keyDown(watched, { key: "ArrowLeft" }); });
    expect(window.location.hash).toBe("");
    // No dangling "#" either: the URL is the page's own again.
    expect(window.location.href.endsWith("#")).toBe(false);
    expect(screen.getByTestId("card").textContent).toBe("Fight Club");

    await act(async () => { fireEvent.click(watched); });
    expect(screen.getByTestId("card").textContent).toBe("Heat");

    expect(replace).toHaveBeenCalledTimes(3);
    expect(replace.mock.calls.every(([state]) => state === null)).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(entries);
    // Nothing navigated, so the browser had no fragment to scroll to.
    expect(hashChanges).not.toHaveBeenCalled();
    window.removeEventListener("hashchange", hashChanges);
  });

  it("keeps the query string when writing the fragment", async () => {
    window.history.replaceState(null, "", "/watchlist?from=nav");
    seed({ watchlist: [saved("Fight Club", 550)], watched: [seen("Heat", 949)] });
    await renderPage();

    await act(async () => { fireEvent.click(screen.getAllByRole("tab")[1]); });

    expect(window.location.pathname).toBe("/watchlist");
    expect(window.location.search).toBe("?from=nav");
    expect(window.location.hash).toBe("#watched");
    window.history.replaceState(null, "", "/");
  });
});

describe("the availability lookup", () => {
  function availability(
    region: string,
    status: "none" | "mine",
  ): WatchlistAvailability {
    return {
      region,
      hasSelectedProviders: status === "mine",
      byKey: { "movie-550": { status, providers: [] } },
      checked: 1,
      failedKeys: [],
    };
  }

  async function groupSavedTitle() {
    vi.useFakeTimers();
    seed({ watchlist: [saved("Fight Club", 550)] });
    const page = await renderPage();
    await act(() => {
      fireEvent.click(screen.getByRole("button", { name: /group by availability/i }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    return page;
  }

  function changeSettingInAnotherTab(key: string, value: string) {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  }

  it.each(["unmount", "grouping off", "region change"] as const)(
    "cancels an obsolete availability request on %s without reporting a load failure",
    async (change) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      let requestSignal!: AbortSignal;
      availabilityFor.mockImplementationOnce((_refs: unknown, signal: AbortSignal) => {
        requestSignal = signal;
        return new Promise<WatchlistAvailability>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      });
      const page = await groupSavedTitle();
      expect(requestSignal.aborted).toBe(false);

      await act(async () => {
        if (change === "unmount") page.unmount();
        else if (change === "grouping off") {
          savePreferences({ ...getDefaultPreferences(), grouping: "none" });
        } else {
          changeSettingInAnotherTab(REGION_KEY, "CZ");
        }
      });

      expect(requestSignal.aborted).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(log).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(availabilityFor).toHaveBeenCalledTimes(change === "region change" ? 2 : 1);
    },
  );

  it("offers a retry after every lookup fails instead of blaming the lookup limit", async () => {
    availabilityFor.mockResolvedValueOnce({
      region: "US", hasSelectedProviders: false, byKey: {}, checked: 0,
      failedKeys: ["movie-550"],
    }).mockResolvedValueOnce(availability("US", "none"));

    await groupSavedTitle();

    expect(screen.getByRole("alert").textContent).toContain("1 saved title");
    expect(screen.queryByText(/limited number of titles/)).toBeNull();
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByRole("status").textContent).toContain("Checking streaming availability");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(availabilityFor).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: /Not streaming in US/ })).toBeTruthy();
  });

  it("also makes a rejected availability request retryable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    availabilityFor.mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(availability("US", "mine"));

    await groupSavedTitle();
    expect(screen.getByRole("alert").textContent).toContain("1 saved title");
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(screen.getByRole("heading", { name: /Ready to watch on your platforms/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retries only failed titles and keeps confirmed groups throughout the retry", async () => {
    vi.useFakeTimers();
    availabilityFor.mockResolvedValueOnce({
      ...availability("US", "mine"),
      failedKeys: ["movie-949"],
    });
    let resolve!: (result: WatchlistAvailability) => void;
    availabilityFor.mockReturnValueOnce(new Promise<WatchlistAvailability>((done) => { resolve = done; }));
    seed({ watchlist: [saved("Fight Club", 550), saved("Heat", 949)] });
    await renderPage();
    await act(() => fireEvent.click(screen.getByRole("button", { name: /group by availability/i })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(screen.getByRole("alert").textContent).toContain("1 saved title");
    expect(screen.queryByText(/limited number of titles/)).toBeNull();
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(availabilityFor).toHaveBeenLastCalledWith(
      [{ id: 949, mediaType: "movie" }], expect.any(AbortSignal),
    );
    expect(screen.getByRole("heading", { name: /Ready to watch on your platforms/ })).toBeTruthy();
    await act(async () => { resolve({
      region: "US", hasSelectedProviders: true, checked: 1, failedKeys: [],
      byKey: { "movie-949": { status: "none", providers: [] } },
    }); });

    expect(screen.getByRole("heading", { name: /Ready to watch on your platforms/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Not streaming in US/ })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/more saved .*not been checked/)).toBeNull();
  });

  it("retries on returning online only until failed availability has recovered", async () => {
    availabilityFor.mockResolvedValueOnce({
      region: "US", hasSelectedProviders: false, byKey: {}, checked: 0,
      failedKeys: ["movie-550"],
    }).mockResolvedValueOnce(availability("US", "none"));
    await groupSavedTitle();

    act(() => fireEvent(window, new Event("online")));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(availabilityFor).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => fireEvent(window, new Event("online")));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(availabilityFor).toHaveBeenCalledTimes(2);
  });

  it("does not retry failed availability on returning online while grouping is off", async () => {
    availabilityFor.mockResolvedValueOnce({
      region: "US", hasSelectedProviders: false, byKey: {}, checked: 0,
      failedKeys: ["movie-550"],
    });
    await groupSavedTitle();
    act(() => savePreferences({ ...getDefaultPreferences(), grouping: "none" }));

    act(() => fireEvent(window, new Event("online")));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(availabilityFor).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains the lookup limit separately from failed requests", async () => {
    vi.useFakeTimers();
    const byKey = Object.fromEntries(Array.from({ length: 120 }, (_, index) => [
      `movie-${index + 1}`, { status: "none", providers: [] },
    ]));
    availabilityFor.mockResolvedValueOnce({
      region: "US", hasSelectedProviders: false, byKey, checked: 120, failedKeys: [],
    });
    seed({ watchlist: Array.from({ length: 121 }, (_, index) => saved(`Film ${index + 1}`, index + 1)) });
    await renderPage();
    await act(() => fireEvent.click(screen.getByRole("button", { name: /group by availability/i })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(availabilityFor.mock.calls[0][0]).toHaveLength(120);
    expect(screen.getByRole("note").textContent).toContain("1 more saved title has not been checked");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    act(() => fireEvent(window, new Event("online")));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(availabilityFor).toHaveBeenCalledTimes(1);
  });

  it("keeps a title beyond the cap separate while retrying a partial failure", async () => {
    vi.useFakeTimers();
    const byKey = Object.fromEntries(Array.from({ length: 119 }, (_, index) => [
      `movie-${index + 1}`, { status: "none", providers: [] },
    ]));
    availabilityFor.mockResolvedValueOnce({
      region: "US", hasSelectedProviders: false, byKey, checked: 119,
      failedKeys: ["movie-120"],
    }).mockResolvedValueOnce({
      region: "US", hasSelectedProviders: false, checked: 1, failedKeys: [],
      byKey: { "movie-120": { status: "none", providers: [] } },
    });
    seed({ watchlist: Array.from({ length: 121 }, (_, index) => saved(`Film ${index + 1}`, index + 1)) });
    await renderPage();
    await act(() => fireEvent.click(screen.getByRole("button", { name: /group by availability/i })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(screen.getByRole("alert").textContent).toContain("1 saved title");
    expect(screen.getByRole("note").textContent).toContain("1 more saved title has not been checked");
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(availabilityFor).toHaveBeenLastCalledWith(
      [{ id: 120, mediaType: "movie" }], expect.any(AbortSignal),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("1 more saved title has not been checked");
    await act(() => fireEvent.click(screen.getByRole("button", { name: /show 60 more/i })));
    await act(() => fireEvent.click(screen.getByRole("button", { name: /show 1 more/i })));
    expect(screen.getByRole("heading", { name: /Not streaming in US/ }).textContent).toContain("(120)");
  });

  it.each([
    {
      name: "region",
      key: REGION_KEY,
      value: "CZ",
      next: availability("CZ", "none"),
      heading: /Not streaming in CZ/,
    },
    {
      name: "selected providers",
      key: SELECTED_PROVIDERS_KEY,
      value: "8",
      next: availability("US", "mine"),
      heading: /Ready to watch on your platforms/,
    },
  ])("refreshes after changing $name in another tab", async ({ key, value, next, heading }) => {
    availabilityFor.mockResolvedValueOnce(availability("US", "none"));
    let resolve!: (result: WatchlistAvailability) => void;
    availabilityFor.mockReturnValueOnce(new Promise<WatchlistAvailability>((done) => { resolve = done; }));
    await groupSavedTitle();
    expect(screen.getByRole("heading", { name: /Not streaming in US/ })).toBeTruthy();

    act(() => changeSettingInAnotherTab(key, value));

    // The old region/platform claim disappears before the debounce completes.
    expect(screen.queryByRole("heading", { name: /Not streaming in US/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Not checked/ })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(availabilityFor).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("checking")).toBeTruthy();

    await act(async () => { resolve(next); });
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.queryByTestId("checking")).toBeNull();
  });

  it("does not restore old-region groups when a refreshed lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    availabilityFor.mockResolvedValueOnce(availability("US", "none"))
      .mockRejectedValueOnce(new Error("TMDB is down"));
    await groupSavedTitle();

    act(() => changeSettingInAnotherTab(REGION_KEY, "CZ"));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(screen.queryByRole("heading", { name: /Not streaming in US/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Not checked/ })).toBeTruthy();
    expect(screen.getByTestId("card").textContent).toBe("Fight Club");
  });

  it("ignores a pending response for previous settings", async () => {
    let resolve!: (result: WatchlistAvailability) => void;
    availabilityFor.mockReturnValueOnce(new Promise<WatchlistAvailability>((done) => { resolve = done; }))
      .mockResolvedValueOnce(availability("CZ", "none"));
    await groupSavedTitle();

    act(() => changeSettingInAnotherTab(REGION_KEY, "CZ"));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByRole("heading", { name: /Not streaming in CZ/ })).toBeTruthy();

    await act(async () => { resolve(availability("US", "none")); });

    expect(screen.queryByRole("heading", { name: /Not streaming in US/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Not streaming in CZ/ })).toBeTruthy();
    expect(screen.queryByTestId("checking")).toBeNull();
  });

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
