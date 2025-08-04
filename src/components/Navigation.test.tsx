// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { Navigation } from "./Navigation";
import type { MediaItem, Person } from "@/types/tmdb";

/**
 * The header, which is the one component on every page in the app.
 *
 * Four things here are worth pinning, and all four are invisible to a build.
 *
 * The stale-response guard is the first. Search fires per keystroke and the
 * responses come back out of order, so typing "bat" then "batman" can leave the
 * slower "bat" results on screen over a box that says "batman". `searchRunId`
 * exists for exactly that, and nothing about it shows up until it is gone.
 *
 * The debounce is the second: without it every keystroke is two TMDB requests on
 * a shared read token, which is how the app collects a 429.
 *
 * The "/" shortcut is the third, and the half that matters is where it *stands
 * down* – it has to do nothing inside a text field, or the character never
 * reaches the box the visitor is typing in.
 *
 * And the active-link rules are the fourth. They are a ladder of `startsWith`
 * special cases – `/movie` marks "Movies", `/person` marks "People" – and the
 * only thing that says which pathname lights which link is the ladder itself.
 *
 * Underneath those sit the two things a screen reader meets first: the results
 * are a *non-modal* popup owned by the search box (a modal one declared the box
 * being typed into off limits), and the collapsed mobile menu is inert, so its
 * nine links are not nine invisible tab stops.
 */

const push = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
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

vi.mock("@/lib/api", () => ({
  searchMulti: vi.fn(),
  searchPerson: vi.fn(),
}));

// The carousel and the grid pull posters and links of their own. What this file
// needs from them is only which titles reached the screen, so they are reduced
// to that – the alternative is a header test that fails when a card changes.
vi.mock("./MediaCarousel", () => ({
  MediaCarousel: ({ items }: { items: MediaItem[] }) => (
    <div data-testid="media-results">
      {items.map((item) => (
        <span key={item.id}>{item.title}</span>
      ))}
    </div>
  ),
}));

vi.mock("./PersonGrid", () => ({
  PersonGrid: ({ people }: { people: Person[] }) => (
    <div data-testid="person-results">
      {people.map((person) => (
        <span key={person.id}>{person.name}</span>
      ))}
    </div>
  ),
}));

const { searchMulti, searchPerson } = await import("@/lib/api");

function media(title: string, id: number): MediaItem {
  return {
    id,
    title,
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "1999-10-15",
    vote_average: 8,
    vote_count: 10,
    genre_ids: [],
    media_type: "movie",
  } as MediaItem;
}

function person(name: string, id: number): Person {
  return {
    id,
    name,
    profile_path: null,
    known_for_department: "Acting",
  } as Person;
}

/** A promise this test decides when to settle, for the out-of-order race. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function wrapper({ children }: { children: ReactNode }) {
  return <WatchlistProvider>{children}</WatchlistProvider>;
}

function renderNav() {
  return render(<Navigation />, { wrapper });
}

/**
 * Expand the search panel.
 *
 * Needed before anything inside it can be found by role: the container carries
 * `aria-hidden` while collapsed, which takes the form out of the accessibility
 * tree – correctly, and `getByRole` honours it.
 */
async function openSearch() {
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Open search"));
    await vi.advanceTimersByTimeAsync(150);
  });
}

/** Type into the box, then let the 300ms debounce elapse. */
async function search(query: string) {
  fireEvent.change(
    screen.getByLabelText(/search movies, tv shows and people/i),
    {
      target: { value: query },
    },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}

beforeEach(() => {
  pathname = "/";
  vi.useFakeTimers();
  vi.mocked(searchMulti).mockResolvedValue({
    results: [],
    total_pages: 1,
  } as never);
  vi.mocked(searchPerson).mockResolvedValue({
    results: [],
    total_pages: 1,
  } as never);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("out-of-order search responses", () => {
  /**
   * The race the `searchRunId` ref exists for. Both requests are in flight at
   * once and the *first* one answers last, which is the ordering a slow query
   * followed by a fast one actually produces.
   */
  it("ignores a slow earlier search that answers after a later one", async () => {
    const slow = deferred<{ results: MediaItem[] }>();

    vi.mocked(searchMulti)
      .mockReturnValueOnce(slow.promise as never)
      .mockResolvedValueOnce({ results: [media("Batman", 2)] } as never);

    renderNav();
    await search("bat");
    await search("batman");

    expect(screen.getByText("Batman")).toBeTruthy();

    // "bat" answers now, two keystrokes too late.
    await act(async () => {
      slow.resolve({ results: [media("Bat Out Of Hell", 1)] });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByText("Bat Out Of Hell")).toBeNull();
    expect(screen.getByText("Batman")).toBeTruthy();
  });

  /**
   * The same guard on the failure path. A rejected stale search used to be free
   * to blank the results of the search that superseded it.
   */
  it("lets a stale rejection pass without clearing fresh results", async () => {
    const slow = deferred<{ results: MediaItem[] }>();
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(searchMulti)
      .mockReturnValueOnce(slow.promise as never)
      .mockResolvedValueOnce({ results: [media("Batman", 2)] } as never);

    renderNav();
    await search("bat");
    await search("batman");
    expect(screen.getByText("Batman")).toBeTruthy();

    await act(async () => {
      slow.resolve(Promise.reject(new Error("network")) as never);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("Batman")).toBeTruthy();
  });
});

describe("debounce", () => {
  it("asks TMDB once for a burst of keystrokes, not once each", async () => {
    renderNav();
    const input = screen.getByLabelText(/search movies, tv shows and people/i);

    for (const value of ["f", "fi", "fig", "figh", "fight"]) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }

    // Still inside the window that started with the last keystroke.
    expect(searchMulti).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(searchMulti).toHaveBeenCalledTimes(1);
    expect(searchMulti).toHaveBeenCalledWith("fight", 1);
  });

  it("does not search for a query that is only whitespace", async () => {
    renderNav();
    await search("   ");

    expect(searchMulti).not.toHaveBeenCalled();
  });
});

describe("keyboard shortcuts", () => {
  it("opens search on /", async () => {
    renderNav();
    expect(screen.getByLabelText("Open search")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "/" });
    });

    expect(screen.getByLabelText("Close search")).toBeTruthy();
  });

  it("opens search on Cmd+K and on Ctrl+K", async () => {
    const { unmount } = renderNav();

    await act(async () => {
      fireEvent.keyDown(document, { key: "k", metaKey: true });
    });
    expect(screen.getByLabelText("Close search")).toBeTruthy();
    unmount();

    renderNav();
    await act(async () => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    });
    expect(screen.getByLabelText("Close search")).toBeTruthy();
  });

  /**
   * The half of the "/" shortcut that is easy to lose. A visitor typing a title
   * into any text field must get the character, not the search panel – and the
   * app's own search box is itself an input, so a regression here makes the box
   * impossible to type "/" into.
   */
  it("stands down while text is being entered", async () => {
    renderNav();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      fireEvent.keyDown(input, { key: "/" });
    });

    expect(screen.getByLabelText("Open search")).toBeTruthy();
    input.remove();
  });

  it("leaves / alone when it is a modified keystroke", async () => {
    renderNav();

    await act(async () => {
      fireEvent.keyDown(document, { key: "/", metaKey: true });
    });

    expect(screen.getByLabelText("Open search")).toBeTruthy();
  });

  it("closes the results overlay on Escape", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    renderNav();
    await search("fight");
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * The combobox pattern's Escape: the popup goes, the box keeps its text and
   * gets focus back. It used to reset the query as well, and left focus wherever
   * it happened to be.
   */
  it("returns focus to the box, with its text intact, when Escape closes the results", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    renderNav();
    await openSearch();
    await search("fight");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    const input = screen.getByLabelText(/search movies, tv shows and people/i);
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("fight");
  });

  /**
   * Escape used to do nothing unless results were up, so a search bar opened
   * with "/" and then abandoned had no key that would close it again.
   */
  it("closes an empty search bar on Escape and hands focus back to its button", async () => {
    renderNav();
    await openSearch();
    expect(screen.getByLabelText("Close search")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(screen.getByLabelText("Open search")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Open search"));
  });

  /**
   * The request for "fight" is still in flight when Escape lands. Its answer
   * must not reopen the panel the visitor just closed.
   */
  it("does not let a late answer reopen results closed with Escape", async () => {
    const slow = deferred<{ results: MediaItem[] }>();
    vi.mocked(searchMulti).mockReturnValue(slow.promise as never);

    renderNav();
    await search("fight");
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      slow.resolve({ results: [media("Fight Club", 550)] });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the search box as a screen reader meets it", () => {
  it("owns the results popup, and says whether it is open", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    renderNav();
    await openSearch();
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    await search("fight");

    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(
      screen.getByRole("dialog").id,
    );
  });

  /**
   * A modal dialog tells assistive technology that everything outside it is out
   * of bounds. The input driving this popup is outside it.
   */
  it("does not declare the results modal", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    renderNav();
    await search("fight");

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBeNull();
  });
});

describe("the mobile menu", () => {
  /**
   * `aria-hidden` hides the collapsed menu from a screen reader, but not from
   * the Tab key: without `inert` its links were nine focus stops that landed on
   * nothing visible.
   */
  it("is inert while closed and live while open", async () => {
    renderNav();

    const menu = document.getElementById("mobile-menu");
    expect(menu?.hasAttribute("inert")).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open menu"));
    });

    expect(menu?.hasAttribute("inert")).toBe(false);
  });
});

describe("which link is marked as the current page", () => {
  /**
   * A detail page is not its listing's path, so each of these is a `startsWith`
   * rule rather than an equality one – and every one of them was a deliberate
   * choice that nothing else records.
   */
  const cases: [string, string][] = [
    ["/", "Home"],
    ["/movies", "Movies"],
    ["/movie", "Movies"],
    ["/tv-shows", "TV Shows"],
    ["/tv", "TV Shows"],
    ["/genres", "Genres"],
    ["/genres/movie", "Genres"],
  ];

  for (const [path, label] of cases) {
    it(`marks ${label} for ${path}`, () => {
      pathname = path;
      renderNav();

      const current = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");

      expect(current.some((link) => link.textContent?.includes(label))).toBe(
        true,
      );
    });
  }

  it("marks nothing on a route that is in no section", () => {
    pathname = "/about";
    renderNav();

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(0);
  });

  /**
   * `/watchlist` is an equality rule, not a prefix one: `/watchlist/ranking` is
   * its own page and marking the parent would light two links at once.
   */
  it("does not mark Watchlist for the ranking sub-page", () => {
    pathname = "/watchlist/ranking";
    renderNav();

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(0);
  });
});

describe("leaving the overlay for the search page", () => {
  it("navigates on submit and escapes the query", async () => {
    renderNav();
    await openSearch();

    fireEvent.change(
      screen.getByLabelText(/search movies, tv shows and people/i),
      { target: { value: "am&lie" } },
    );
    await act(async () => {
      fireEvent.submit(screen.getByRole("search"));
    });

    expect(push).toHaveBeenCalledWith("/search?q=am%26lie");
  });

  it("ignores a submit with nothing to search for", async () => {
    renderNav();
    await openSearch();

    await act(async () => {
      fireEvent.submit(screen.getByRole("search"));
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("closes the overlay behind it", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    renderNav();
    await openSearch();
    await search("fight");
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.submit(screen.getByRole("search"));
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("body scroll", () => {
  /**
   * The overlay is `position: fixed` over the page. Without the lock the page
   * underneath scrolls when the results do, and closing the overlay leaves the
   * visitor somewhere they never navigated to.
   */
  it("locks while the overlay is up and releases when it closes", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    renderNav();
    await search("fight");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(document.body.style.overflow).toBe("");
  });

  it("releases on unmount, so a route change cannot strand it", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);

    const { unmount } = renderNav();
    await search("fight");
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
  });

  /**
   * `VideoOverlay` locks the same property. Each lock has to put back what it
   * found rather than a constant, or closing one undoes the other – which is
   * what a trailer opened from these results used to do to them.
   */
  it("puts back whatever was there before, so another lock survives it", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    document.body.style.overflow = "hidden";

    renderNav();
    await search("fight");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(document.body.style.overflow).toBe("hidden");
    document.body.style.overflow = "";
  });
});

describe("results", () => {
  it("shows people alongside titles", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    vi.mocked(searchPerson).mockResolvedValue({
      results: [person("Edward Norton", 819)],
    } as never);

    renderNav();
    await search("fight");

    expect(screen.getByText("Fight Club")).toBeTruthy();
    expect(screen.getByText("Edward Norton")).toBeTruthy();
  });

  it("caps the people row at eight", async () => {
    vi.mocked(searchPerson).mockResolvedValue({
      results: Array.from({ length: 20 }, (_, i) => person(`Person ${i}`, i)),
    } as never);

    renderNav();
    await search("a");

    expect(screen.getByTestId("person-results").children).toHaveLength(8);
  });

  it("says so plainly when nothing matched", async () => {
    renderNav();
    await search("zzzzzzzz");

    expect(
      screen.getByText(/no results found\. try a different search term/i),
    ).toBeTruthy();
  });
});
