// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { Navigation } from "./Navigation";
import { VideoOverlay } from "./VideoOverlay";
import { ShareButton } from "./ShareButton";
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
let trailerInSearch = false;

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
      {trailerInSearch && <SearchTrailer />}
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

function SearchTrailer() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Play search trailer</button>
      <VideoOverlay
        isOpen={isOpen}
        video={null}
        isLoading={false}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

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

/** Which keyboard the shortcut should be read for. */
function onPlatform(platform: "MacIntel" | "Win32") {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
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
  trailerInSearch = false;
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
  it("ignores an earlier answer while the next query is still being debounced", async () => {
    const slowTitles = deferred<{ results: MediaItem[] }>();
    const slowPeople = deferred<{ results: Person[] }>();
    vi.mocked(searchMulti)
      .mockReturnValueOnce(slowTitles.promise as never)
      .mockResolvedValueOnce({ results: [media("Batman", 2)] } as never);
    vi.mocked(searchPerson).mockReturnValueOnce(slowPeople.promise as never);
    renderNav();
    await openSearch();
    await search("bat");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "batman" } });
    await act(async () => {
      slowTitles.resolve({ results: [media("Bat Out Of Hell", 1)] });
      slowPeople.resolve({ results: [person("Old result", 3)] });
    });

    expect(searchMulti).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Bat Out Of Hell")).toBeNull();
    expect(screen.queryByText("Old result")).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(searchMulti).toHaveBeenLastCalledWith("batman", 1);
    expect(screen.getByText("Batman")).toBeTruthy();
  });

  it.each(["", "   "])("clears an active search immediately for %j and keeps its late answer out after retyping", async (empty) => {
    const slow = deferred<{ results: MediaItem[] }>();
    vi.mocked(searchMulti)
      .mockReturnValueOnce(slow.promise as never)
      .mockResolvedValueOnce({ results: [media("Heat", 949)] } as never);
    renderNav();
    await openSearch();
    await search("bat");
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: empty } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");

    fireEvent.change(input, { target: { value: "heat" } });
    await act(async () => slow.resolve({ results: [media("Batman", 2)] }));
    expect(screen.queryByText("Batman")).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(searchMulti).toHaveBeenCalledTimes(2);
    expect(searchMulti).toHaveBeenLastCalledWith("heat", 1);
    expect(screen.getByText("Heat")).toBeTruthy();
  });

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

describe("closing search with the toolbar button", () => {
  it("dismisses results, clears the query and restores page scrolling", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Dune", 438631)],
    } as never);
    renderNav();
    await openSearch();
    await search("Dune");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByLabelText("Close search"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Open search")).toBeTruthy();
    expect(document.body.style.overflow).not.toBe("hidden");
    const input = screen.getByLabelText(/search movies, tv shows and people/i);
    expect((input as HTMLInputElement).value).toBe("");
    expect(input.tabIndex).toBe(-1);
  });

  it("cancels a queued query before the debounce runs", async () => {
    renderNav();
    await openSearch();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Dune" } });
    fireEvent.click(screen.getByLabelText("Close search"));

    await act(async () => { await vi.advanceTimersByTimeAsync(350); });

    expect(searchMulti).not.toHaveBeenCalled();
    expect(searchPerson).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("ignores an in-flight answer after the toolbar closes search", async () => {
    const slow = deferred<{ results: MediaItem[] }>();
    vi.mocked(searchMulti).mockReturnValue(slow.promise as never);
    renderNav();
    await openSearch();
    await search("Dune");
    fireEvent.click(screen.getByLabelText("Close search"));

    await act(async () => {
      slow.resolve({ results: [media("Dune", 438631)] });
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Dune")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("independent search failures", () => {
  it("keeps titles when people fail and drops people from the previous query", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(searchPerson)
      .mockResolvedValueOnce({ results: [person("Brad Pitt", 287)] } as never)
      .mockRejectedValueOnce(new Error("People search is unavailable"));
    vi.mocked(searchMulti)
      .mockResolvedValueOnce({ results: [] } as never)
      .mockResolvedValueOnce({ results: [media("Dune", 438631)] } as never);
    renderNav();
    await search("Brad");
    expect(screen.getByText("Brad Pitt")).toBeTruthy();

    await search("Dune");

    expect(screen.getByText("Dune")).toBeTruthy();
    expect(screen.queryByText("Brad Pitt")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("keeps people when the title search fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(searchMulti).mockRejectedValueOnce(new Error("Titles are unavailable"));
    vi.mocked(searchPerson).mockResolvedValueOnce({
      results: [person("Brad Pitt", 287)],
    } as never);
    renderNav();

    await search("Brad");

    expect(screen.getByText("Brad Pitt")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("reports an outage without claiming no matches and clears it on the next search", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(searchMulti).mockRejectedValueOnce(new Error("Offline"));
    vi.mocked(searchPerson).mockRejectedValueOnce(new Error("Offline"));
    renderNav();
    await search("Dune");

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/No results found/i)).toBeNull();

    vi.mocked(searchMulti).mockResolvedValue({ results: [media("Arrival", 329865)] } as never);
    await search("Arrival");

    expect(screen.getByText("Arrival")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops a request closed before the reset debounce runs", async () => {
    const slow = deferred<{ results: MediaItem[] }>();
    vi.mocked(searchMulti).mockReturnValueOnce(slow.promise as never);
    renderNav();
    await search("Dune");

    fireEvent.click(screen.getByLabelText("Close search results"));
    await act(async () => {
      slow.resolve(Promise.reject(new Error("Offline")) as never);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("navigation while search is open", () => {
  it.each(["/", "/tv-shows"])(
    "dismisses populated results and releases scrolling after navigating to %s",
    async (nextPathname) => {
      pathname = "/movies";
      vi.mocked(searchMulti).mockResolvedValue({
        results: [media("Fight Club", 550)],
      } as never);
      const view = renderNav();
      await openSearch();
      await search("fight");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(document.body.style.overflow).toBe("hidden");

      pathname = nextPathname;
      view.rerender(<Navigation />);

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByLabelText("Open search")).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByLabelText("Open search"));
      expect((screen.getByLabelText(/search movies, tv shows and people/i) as HTMLInputElement).value).toBe("");
      expect(document.body.style.overflow).toBe("");
    },
  );

  it("cancels a queued search and toolbar focus when the pathname changes", async () => {
    const view = renderNav();
    fireEvent.click(screen.getByLabelText("Open search"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fight" } });
    const movies = screen.getByRole("link", { name: "Movies" });
    movies.focus();

    pathname = "/movies";
    view.rerender(<Navigation />);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });

    expect(searchMulti).not.toHaveBeenCalled();
    expect(searchPerson).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(movies);
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores a delayed answer from the previous route after a new search starts", async () => {
    const slow = deferred<{ results: MediaItem[] }>();
    vi.mocked(searchMulti)
      .mockReturnValueOnce(slow.promise as never)
      .mockResolvedValueOnce({ results: [media("Dune", 438631)] } as never);
    const view = renderNav();
    await openSearch();
    await search("fight");

    pathname = "/movies";
    view.rerender(<Navigation />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    await openSearch();
    await search("dune");
    await act(async () => slow.resolve({ results: [media("Fight Club", 550)] }));

    expect(screen.getByText("Dune")).toBeTruthy();
    expect(screen.queryByText("Fight Club")).toBeNull();
  });

  it("dismisses search on query-only browser history navigation", async () => {
    pathname = "/movie";
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    const view = renderNav();
    await openSearch();
    await search("fight");
    expect(document.activeElement).toBe(screen.getByRole("combobox"));

    fireEvent(window, new PopStateEvent("popstate"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Open search")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Open search"));
    expect(document.body.style.overflow).toBe("");

    // A pathname-changing Back also updates the hook after the popstate event.
    pathname = "/movies";
    view.rerender(<Navigation />);
    fireEvent.keyDown(document.activeElement!, { key: "/" });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(screen.getByLabelText("Close search")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("restores focus from a search result control before history closes its panel", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    renderNav();
    await openSearch();
    await search("fight");
    screen.getByRole("button", { name: "Close search results" }).focus();

    fireEvent(window, new PopStateEvent("popstate"));

    expect(document.activeElement).toBe(screen.getByLabelText("Open search"));
  });

  it.each(["pathname", "popstate"])("restores focus from the mobile menu on %s navigation", (navigation) => {
    const view = renderNav();
    fireEvent.click(screen.getByLabelText("Open menu"));
    const mobileLink = screen.getAllByRole("link", { name: "Movies" }).find(
      (link) => link.closest("#mobile-menu"),
    )!;
    mobileLink.focus();

    if (navigation === "pathname") {
      pathname = "/movies";
      view.rerender(<Navigation />);
    } else {
      fireEvent(window, new PopStateEvent("popstate"));
    }

    expect(screen.getByLabelText("Open menu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Open search"));
  });

  it.each(["pathname", "popstate"])("keeps focus already owned by the destination page on %s navigation", async (navigation) => {
    const view = renderNav();
    await openSearch();
    const destinationControl = document.createElement("button");
    document.body.appendChild(destinationControl);
    destinationControl.focus();

    if (navigation === "pathname") {
      pathname = "/movies";
      view.rerender(<Navigation />);
    } else {
      fireEvent(window, new PopStateEvent("popstate"));
    }

    expect(screen.getByLabelText("Open search")).toBeTruthy();
    expect(document.activeElement).toBe(destinationControl);
    destinationControl.remove();
  });

  it("releases scrolling when history navigation also unmounts a search trailer", async () => {
    trailerInSearch = true;
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    renderNav();
    await openSearch();
    await search("fight");
    fireEvent.click(screen.getByRole("button", { name: "Play search trailer" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);

    fireEvent(window, new PopStateEvent("popstate"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
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

  it("opens search on Cmd+K on a Mac, and leaves Ctrl+K to the text editing it means there", async () => {
    onPlatform("MacIntel");
    renderNav();

    const ctrl = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => { document.dispatchEvent(ctrl); });
    expect(ctrl.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Open search")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "k", metaKey: true });
    });
    expect(screen.getByLabelText("Close search")).toBeTruthy();
  });

  it("opens search on Ctrl+K elsewhere, but not on the Windows or Super key", async () => {
    onPlatform("Win32");
    renderNav();

    await act(async () => {
      fireEvent.keyDown(document, { key: "k", metaKey: true });
    });
    expect(screen.getByLabelText("Open search")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    });
    expect(screen.getByLabelText("Close search")).toBeTruthy();
  });

  it.each(["textarea", "contenteditable", "input"])("leaves Cmd/Ctrl+K alone inside a %s", async (kind) => {
    onPlatform("MacIntel");
    renderNav();
    const field = kind === "textarea"
      ? document.createElement("textarea")
      : kind === "input" ? document.createElement("input") : document.createElement("div");
    if (kind === "contenteditable") {
      field.contentEditable = "true";
      // jsdom does not derive this from the attribute.
      Object.defineProperty(field, "isContentEditable", { value: true });
      field.tabIndex = 0;
    }
    document.body.appendChild(field);
    field.focus();

    const chord = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true });
    await act(async () => { field.dispatchEvent(chord); });

    expect(chord.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Open search")).toBeTruthy();
    field.remove();
  });

  it("still answers Cmd+K from inside the search box itself", async () => {
    onPlatform("MacIntel");
    renderNav();
    await openSearch();
    const input = screen.getByRole("combobox");

    const chord = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(chord); });

    expect(chord.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Close search")).toBeTruthy();
  });

  /**
   * Escape is how an input method's composition is cancelled. Taken as the
   * search's Escape too, it closed the results – or, with none up, threw away
   * the query – in the middle of typing Japanese or Chinese.
   */
  it.each([
    ["isComposing", { isComposing: true }],
    ["key code 229", { keyCode: 229 }],
  ])("ignores keys that belong to an IME composition (%s)", async (_, composing) => {
    vi.mocked(searchMulti).mockResolvedValue({ results: [media("Fight Club", 550)] } as never);
    renderNav();
    await openSearch();
    await search("fight");
    const input = screen.getByRole("combobox") as HTMLInputElement;

    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape", ...composing });
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(input.value).toBe("fight");

    // The same Escape after the composition has ended still closes them.
    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(input.value).toBe("fight");

    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape", ...composing });
    });
    expect(screen.getByLabelText("Close search")).toBeTruthy();
    expect(input.value).toBe("fight");
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

  it("cancels toolbar focus when Escape closes search before its timer runs", async () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Open search"));
    fireEvent.keyDown(document, { key: "Escape" });
    const toggle = screen.getByLabelText("Open search");
    expect(document.activeElement).toBe(toggle);

    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    expect(document.activeElement).toBe(toggle);
    expect(screen.getByLabelText(/search movies, tv shows and people/i).tabIndex).toBe(-1);
  });

  it("cancels toolbar focus when a navigation link closes search", async () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Open search"));
    const movies = screen.getByRole("link", { name: "Movies" });
    movies.focus();
    fireEvent.click(movies);

    await act(async () => { await vi.advanceTimersByTimeAsync(150); });

    expect(document.activeElement).toBe(movies);
    expect(screen.getByLabelText("Open search")).toBeTruthy();
  });

  it.each(["Escape", "navigation", "route change", "unmount"])(
    "cancels shortcut focus on %s before its animation frame runs",
    (action) => {
      const frames = new Map<number, FrameRequestCallback>();
      vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
        frames.set(42, callback);
        return 42;
      });
      const cancel = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
        frames.delete(id);
      });
      const view = renderNav();
      fireEvent.keyDown(document, { key: "/" });
      expect(frames.size).toBe(1);

      if (action === "Escape") {
        fireEvent.keyDown(document, { key: "Escape" });
      } else if (action === "navigation") {
        fireEvent.click(screen.getByRole("link", { name: "Movies" }));
      } else if (action === "route change") {
        pathname = "/movies";
        view.rerender(<Navigation />);
      } else {
        view.unmount();
      }

      expect(cancel).toHaveBeenCalledWith(42);
      expect(frames.size).toBe(0);
    },
  );

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

  it("cancels a debounced query on Escape and lets later typing search again", async () => {
    vi.mocked(searchMulti)
      .mockResolvedValueOnce({ results: [media("Fight Club", 550)] } as never)
      .mockResolvedValueOnce({ results: [media("Batman", 2)] } as never);

    renderNav();
    await openSearch();
    await search("fight");
    expect(screen.getByRole("dialog")).toBeTruthy();

    const input = screen.getByLabelText(/search movies, tv shows and people/i);
    fireEvent.change(input, { target: { value: "fight club" } });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("fight club");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(searchMulti).toHaveBeenCalledTimes(1);
    expect(searchPerson).toHaveBeenCalledTimes(1);

    await search("batman");

    expect(searchMulti).toHaveBeenLastCalledWith("batman", 1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Batman")).toBeTruthy();
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
  it("closes on Escape and hands focus back to its toggle", async () => {
    renderNav();
    const toggle = screen.getByLabelText("Open menu");
    fireEvent.click(toggle);
    const mobileLink = screen.getAllByRole("link", { name: "Movies" }).find(
      (link) => link.closest("#mobile-menu"),
    )!;
    mobileLink.focus();

    await act(async () => {
      fireEvent.keyDown(mobileLink, { key: "Escape" });
    });

    expect(document.getElementById("mobile-menu")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.getElementById("mobile-menu")?.hasAttribute("inert")).toBe(true);
    expect(screen.getByLabelText("Open menu").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("leaves focus that is elsewhere on the page where it is", async () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Open menu"));
    const pageControl = document.createElement("button");
    document.body.appendChild(pageControl);
    pageControl.focus();

    await act(async () => {
      fireEvent.keyDown(pageControl, { key: "Escape" });
    });

    expect(document.getElementById("mobile-menu")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(pageControl);
    pageControl.remove();
  });

  it("closes empty search and cancels its delayed focus when opening the menu", async () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Open search"));
    const menuToggle = screen.getByLabelText("Open menu");
    menuToggle.focus();

    fireEvent.click(menuToggle);
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });

    expect(screen.getByLabelText("Open search").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.getElementById("mobile-menu")?.getAttribute("aria-hidden")).toBe("false");
    expect(document.activeElement).toBe(menuToggle);
  });

  it.each(["queued", "loading", "populated"])("dismisses a %s search before opening the menu", async (phase) => {
    const slow = deferred<{ results: MediaItem[] }>();
    if (phase === "loading") {
      vi.mocked(searchMulti).mockReturnValueOnce(slow.promise as never);
    } else {
      vi.mocked(searchMulti).mockResolvedValue({ results: [media("Fight Club", 550)] } as never);
    }
    renderNav();
    await openSearch();
    if (phase === "queued") {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "fight" } });
    } else {
      await search("fight");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(document.body.style.overflow).toBe("hidden");
    }
    const menuToggle = screen.getByLabelText("Open menu");
    menuToggle.focus();

    fireEvent.click(menuToggle);
    await act(async () => {
      slow.resolve({ results: [media("Fight Club", 550)] });
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(screen.getByLabelText("Open search").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("mobile-menu")?.getAttribute("aria-hidden")).toBe("false");
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(menuToggle);
    if (phase === "queued") {
      expect(searchMulti).not.toHaveBeenCalled();
      expect(searchPerson).not.toHaveBeenCalled();
    }
  });

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

describe("the watchlist link", () => {
  function saveTitles(count: number) {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(
      Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        title: `Film ${index + 1}`,
        mediaType: "movie",
        addedAt: "2026-01-01T00:00:00.000Z",
      })),
    ));
  }

  /**
   * It used to carry `aria-label="My watchlist"`, which replaced its content –
   * counter included – so a screen reader never heard how many titles waited.
   */
  it("includes the number of saved titles in its name", async () => {
    saveTitles(3);
    renderNav();
    await act(async () => {});

    // `hidden` so the collapsed mobile menu's copy of the link counts too.
    const links = screen.getAllByRole("link", { name: "Watchlist, 3 titles saved", hidden: true });
    expect(links).toHaveLength(2);
    expect(links.every((link) => !link.hasAttribute("aria-label"))).toBe(true);
  });

  it("speaks the real count where the badge caps at 99+", async () => {
    saveTitles(120);
    renderNav();
    await act(async () => {});

    const [link] = screen.getAllByRole("link", { name: "Watchlist, 120 titles saved" });
    expect(link.textContent).toContain("99+");
  });

  it("is just \"Watchlist\" with nothing saved", async () => {
    saveTitles(1);
    const view = renderNav();
    await act(async () => {});
    expect(screen.getAllByRole("link", { name: "Watchlist, 1 title saved", hidden: true })).toHaveLength(2);
    view.unmount();

    window.localStorage.clear();
    renderNav();
    await act(async () => {});
    expect(screen.getAllByRole("link", { name: "Watchlist", hidden: true })).toHaveLength(2);
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

describe("page behind search results", () => {
  function page() {
    return (
      <>
        <a href="#main-content">Skip to main content</a>
        <Navigation />
        <main id="main-content"><button>Page action</button></main>
        <footer><a href="/about">Footer action</a></footer>
      </>
    );
  }

  function background() {
    return [
      screen.getByText("Skip to main content"),
      document.getElementById("main-content")!,
      document.querySelector("footer")!,
    ];
  }

  it("disables covered content during loading and after results arrive, keeping the header and popup available", async () => {
    const pending = deferred<{ results: MediaItem[] }>();
    vi.mocked(searchMulti).mockReturnValue(pending.promise as never);
    render(page(), { wrapper });
    await openSearch();
    expect(background().every((element) => !element.hasAttribute("inert"))).toBe(true);

    await search("fight");

    expect(screen.getByRole("dialog", { name: "Searching..." })).toBeTruthy();
    expect(background().every((element) => element.hasAttribute("inert"))).toBe(true);
    expect(screen.getByRole("combobox").closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Close search results" }).closest("[inert]")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main navigation" }).closest("[inert]")).toBeNull();

    await act(async () => { pending.resolve({ results: [media("Fight Club", 550)] }); });

    expect(screen.getByRole("dialog", { name: "Search Results" })).toBeTruthy();
    expect(background().every((element) => element.hasAttribute("inert"))).toBe(true);
  });

  it("returns focus to search if Tab reached the page during the debounce", async () => {
    render(page(), { wrapper });
    await openSearch();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "missing" } });
    screen.getByRole("button", { name: "Page action" }).focus();

    await act(async () => { await vi.advanceTimersByTimeAsync(350); });

    expect(screen.getByRole("dialog", { name: "No Results" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    expect(background().every((element) => element.hasAttribute("inert"))).toBe(true);
  });

  it.each(["Escape", "clear", "pathname", "popstate", "unmount"])(
    "releases covered content on %s",
    async (action) => {
      const view = render(page(), { wrapper });
      await openSearch();
      await search("missing");
      const elements = background();
      expect(elements.every((element) => element.hasAttribute("inert"))).toBe(true);

      if (action === "Escape") fireEvent.keyDown(document, { key: "Escape" });
      else if (action === "clear") fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      else if (action === "pathname") {
        pathname = "/movies";
        view.rerender(page());
      } else if (action === "popstate") fireEvent(window, new PopStateEvent("popstate"));
      else view.unmount();

      expect(elements.every((element) => !element.hasAttribute("inert"))).toBe(true);
    },
  );

  it("preserves a pre-existing inert attribute when search closes", async () => {
    render(page(), { wrapper });
    const footer = document.querySelector("footer")!;
    footer.setAttribute("inert", "existing");
    await openSearch();
    await search("missing");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(footer.getAttribute("inert")).toBe("existing");
    expect(document.getElementById("main-content")!.hasAttribute("inert")).toBe(false);
    expect(screen.getByText("Skip to main content").hasAttribute("inert")).toBe(false);
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

/**
 * A panel on the page – Share here – and the header's own layers both close on
 * Escape, and one key closes one of them. The header used to listen on
 * `document` like the panels, so which ran first was a matter of registration
 * order: a search bar opened before the panel re-registered its listener ahead
 * of the panel's, missed the panel's `preventDefault`, and closed too, taking
 * focus up to the header and away from the control the visitor was on.
 */
describe("one Escape, one layer", () => {
  function renderWithShare() {
    return render(
      <>
        <Navigation />
        <main id="main-content">
          <ShareButton title="Fight Club" url="https://example.com/movie/fight-club-550" />
        </main>
      </>,
      { wrapper },
    );
  }

  /** jsdom has no `navigator.share`, so Share opens its own panel. */
  async function openSharePanel() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share" }));
    });
    return screen.getByRole("button", { name: /Copy link/ });
  }

  it("closes only the Share panel, and leaves the search bar opened before it", async () => {
    renderWithShare();
    await openSearch();
    const copy = await openSharePanel();
    copy.focus();

    await act(async () => {
      fireEvent.keyDown(copy, { key: "Escape" });
    });

    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
    expect(screen.getByLabelText("Close search").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share" }));
  });

  it("closes only the Share panel, and leaves the mobile menu open", async () => {
    renderWithShare();
    fireEvent.click(screen.getByLabelText("Open menu"));
    const copy = await openSharePanel();
    copy.focus();

    await act(async () => {
      fireEvent.keyDown(copy, { key: "Escape" });
    });

    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
    expect(screen.getByLabelText("Close menu").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Share" }));
  });

  it("takes the panel first with focus elsewhere, and the search bar on the next Escape", async () => {
    renderWithShare();
    await openSearch();
    await openSharePanel();
    const input = screen.getByRole("combobox");
    expect(document.activeElement).toBe(input);

    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
    expect(screen.getByLabelText("Close search")).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(screen.getByLabelText("Open search")).toBeTruthy();
  });
});

/**
 * A header link closes search because following it leaves the page. A
 * Cmd/Ctrl/Shift-click does not leave – it opens a new tab or window – and Next's
 * Link calls `onClick` for it all the same, so the overlay and its query used
 * to vanish under a visitor opening several things in background tabs.
 */
describe("modified clicks on header links", () => {
  it.each([
    ["Cmd", { metaKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Shift", { shiftKey: true }],
  ])("keep the search results open on a %s-click", async (_, modifier) => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    renderNav();
    await openSearch();
    await search("fight");

    await act(async () => {
      fireEvent.click(screen.getAllByRole("link", { name: "Movies" })[0], modifier);
    });

    expect(screen.getByTestId("media-results").textContent).toContain("Fight Club");
    expect(
      (screen.getByLabelText(/search movies, tv shows and people/i) as HTMLInputElement).value,
    ).toBe("fight");
  });

  it("still close search on a plain click", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    renderNav();
    await openSearch();
    await search("fight");

    await act(async () => {
      fireEvent.click(screen.getAllByRole("link", { name: "Movies" })[0]);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Open search")).toBeTruthy();
  });

  it("keep the mobile menu open on a Cmd-click inside it", async () => {
    renderNav();
    fireEvent.click(screen.getByLabelText("Open menu"));
    const mobileLink = screen.getAllByRole("link", { name: "Movies" }).find(
      (link) => link.closest("#mobile-menu"),
    )!;

    await act(async () => {
      fireEvent.click(mobileLink, { metaKey: true });
    });
    expect(screen.getByLabelText("Close menu")).toBeTruthy();

    await act(async () => {
      fireEvent.click(mobileLink);
    });
    expect(screen.getByLabelText("Open menu")).toBeTruthy();
  });
});

/**
 * The ✕ in the box used to be "Close search" under another name: it collapsed
 * the bar and sent focus to the toolbar, so starting a new query meant opening
 * search all over again.
 */
describe("clearing the box", () => {
  it("empties it and closes the results, but keeps the bar open with focus in it", async () => {
    vi.mocked(searchMulti).mockResolvedValue({
      results: [media("Fight Club", 550)],
    } as never);
    renderNav();
    await openSearch();
    await search("fight");
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Clear search"));
    });

    const input = screen.getByLabelText(/search movies, tv shows and people/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Close search").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(input);
  });

  it("does not let the cleared query's pending answer reopen the results", async () => {
    let answer!: (value: unknown) => void;
    vi.mocked(searchMulti).mockReturnValue(new Promise((resolve) => { answer = resolve; }) as never);
    renderNav();
    await openSearch();
    await search("fight");

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Clear search"));
    });
    await act(async () => {
      answer({ results: [media("Fight Club", 550)] });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * `e.key` is the character the layout types. On a Russian, Greek or Hebrew
 * keyboard that is not "k", and the shortcut never fired; the physical key is
 * the fallback for a layout with no Latin letter there – and only for one, or
 * Dvorak's Cmd+T (the "t" sits where QWERTY has K) would be claimed too.
 */
describe("Cmd/Ctrl+K on other keyboard layouts", () => {
  it.each([["Russian", "л"], ["Greek", "κ"], ["Hebrew", "ל"]])(
    "opens search on a %s layout",
    async (_, key) => {
      onPlatform("MacIntel");
      renderNav();

      await act(async () => {
        fireEvent.keyDown(document, { key, code: "KeyK", metaKey: true });
      });

      expect(screen.getByLabelText("Close search")).toBeTruthy();
    },
  );

  it("leaves a Latin layout's own letter on that key alone", async () => {
    onPlatform("MacIntel");
    renderNav();

    const chord = new KeyboardEvent("keydown", {
      key: "t",
      code: "KeyK",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => { document.dispatchEvent(chord); });

    expect(chord.defaultPrevented).toBe(false);
    expect(screen.getByLabelText("Open search")).toBeTruthy();
  });
});
