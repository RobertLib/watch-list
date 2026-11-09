// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { REGION_KEY, refreshSettings, setRegion } from "@/lib/settings";
import { MediaCard, MemoizedMediaCard } from "./MediaCard";
import type { MediaItem, WatchProvider } from "@/types/tmdb";

/**
 * The poster. There is one of these for every title in every grid and every
 * carousel in the app, which is what makes its two cheap-looking decisions
 * expensive to get wrong.
 *
 * The first is that watch providers are fetched *lazily* – on hover, or when the
 * overlay is forced open – and fetched once. A listing page holds forty of these,
 * so a card that asks on mount is forty TMDB requests for a screen nobody has
 * pointed at yet, and a card that asks again on every hover is unbounded.
 *
 * The second is the year. `releaseYear` exists because `new Date("2020-01-01")`
 * is an *instant*, and west of Greenwich it reports 2019 – on a catalogue where
 * TMDB stores a title it only knows the year of as the 1st of January. This card
 * is where that was visible, forty times a page.
 *
 * The third is structural. The poster is a link and it carries three buttons –
 * play, save, seen – and a button inside an anchor is invalid HTML that a screen
 * reader walking the link never finds. They are siblings of the link now, laid
 * over it, and the assertion that keeps them there is the cheapest one in the
 * file.
 */

const getTitleProviders = vi.fn();
let videoIsOpen = false;

vi.mock("@/lib/title-providers", () => ({
  getTitleProviders: (...args: unknown[]) => getTitleProviders(...args),
}));

vi.mock("@/hooks/useVideoOverlay", () => ({
  useVideoOverlay: () => ({
    isOpen: videoIsOpen,
    video: null,
    isLoading: false,
    openVideo: vi.fn(),
    closeVideo: vi.fn(),
  }),
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
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src}>{alt}</span>
  ),
}));

vi.mock("./GenreTags", () => ({ GenreTags: () => null }));

vi.mock("./WatchProviders", () => ({
  WatchProviders: ({
    providers,
    loading,
  }: {
    providers: { name?: string; provider_name?: string }[];
    loading: boolean;
  }) => (
    <div data-testid="providers">
      {loading ? "loading" : providers.map((p) => p.provider_name ?? p.name).join(",")}
    </div>
  ),
}));

vi.mock("./WatchlistButton", () => ({
  WatchlistButton: () => <button type="button">Save</button>,
}));

vi.mock("./WatchedButton", () => ({
  WatchedButton: () => <button type="button">Seen</button>,
}));

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 550,
    title: "Fight Club",
    overview: "",
    poster_path: "/poster.jpg",
    backdrop_path: null,
    release_date: "1999-10-15",
    vote_average: 8.43,
    vote_count: 27000,
    genre_ids: [18],
    media_type: "movie",
    ...overrides,
  } as MediaItem;
}

function provider(id: number, name: string): WatchProvider {
  return {
    provider_id: id,
    provider_name: name,
    logo_path: `/provider-${id}.jpg`,
    display_priority: 1,
  };
}

function deferredProviders() {
  let resolve!: (value: { streaming: WatchProvider[] }) => void;
  const promise = new Promise<{ streaming: WatchProvider[] }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function wrapper({ children }: { children: ReactNode }) {
  return <WatchedProvider>{children}</WatchedProvider>;
}

function renderCard(props: Partial<React.ComponentProps<typeof MediaCard>> = {}) {
  return render(<MediaCard item={item()} {...props} />, { wrapper });
}

const poster = () => screen.getByRole("article");

/**
 * Put a phone under the card. `useIsMobile` asks `matchMedia`, which jsdom does
 * not ship, and the touch half of its test is already true there – jsdom's
 * window carries `ontouchstart` like every other `GlobalEventHandlers` property.
 */
function pretendPhone() {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    media: "(max-width: 767px)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  refreshSettings();
  videoIsOpen = false;
  getTitleProviders.mockResolvedValue({ streaming: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("where the card points", () => {
  it("builds a slugged detail link for a film", () => {
    renderCard();

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/movie?id=fight-club-550",
    );
  });

  it("points a show at the tv route", () => {
    renderCard({
      item: item({ id: 1438, title: "The Wire", media_type: "tv" }),
    });

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/tv?id=the-wire-1438",
    );
  });

  /**
   * TMDB names a film `title` and a show `name`, and the same grid holds both –
   * a multi-search returns them mixed. A show whose name is dropped renders as
   * "Unknown Title" and links to a slug built from it.
   */
  it("falls back to a show's name when there is no title", () => {
    renderCard({
      item: item({
        id: 1438,
        title: undefined,
        name: "The Wire",
        media_type: "tv",
      } as Partial<MediaItem>),
    });

    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/tv?id=the-wire-1438",
    );
    expect(screen.getByRole("link").getAttribute("aria-label")).toContain(
      "The Wire",
    );
  });
});

// `next.config.ts` sets `unoptimized`, so the TMDB size named is the file the
// browser downloads.
describe("the poster size", () => {
  it("asks for w500 where the card is wide enough to need it", () => {
    renderCard({ size: "medium" });

    expect(screen.getByText("Poster for Fight Club").getAttribute("data-src")).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg",
    );
  });

  it("asks for w342 for a small card, which w500 would only waste", () => {
    renderCard({ size: "small" });

    expect(screen.getByText("Poster for Fight Club").getAttribute("data-src")).toBe(
      "https://image.tmdb.org/t/p/w342/poster.jpg",
    );
  });
});

describe("the year", () => {
  /**
   * The bug `lib/dates.ts` exists for, seen from the component that showed it.
   * A New York timezone reading "2020-01-01" as an instant reports 1999+21-1.
   */
  it("reads the calendar year off the date, not the instant", () => {
    renderCard({ item: item({ release_date: "2020-01-01" }) });

    expect(screen.getByRole("link").getAttribute("aria-label")).toContain(
      "(2020)",
    );
  });

  it("omits the year for a title TMDB has no date for", () => {
    renderCard({ item: item({ release_date: "" }) });

    const label = screen.getByRole("link").getAttribute("aria-label") ?? "";
    expect(label).toBe("View details for Fight Club");
  });
});

describe("watched titles", () => {
  it("says so in the link label, for a reader who cannot see the ring", () => {
    window.localStorage.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify([
        {
          id: 550,
          title: "Fight Club",
          mediaType: "movie",
          posterPath: null,
          voteAverage: 8.4,
          releaseDate: "1999-10-15",
          watchedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );

    renderCard();

    expect(screen.getByRole("link").getAttribute("aria-label")).toContain(
      "watched",
    );
  });

  /**
   * The static export ships one HTML file to everyone, so the ring cannot be in
   * it – the watched list is read in a mount effect, and a card that arrived
   * already ringed would be a hydration mismatch on the most-rendered node in
   * the app.
   *
   * Asserted against the *server* render rather than a mounted one, because that
   * is the markup the claim is about: `render` from Testing Library flushes the
   * mount effect before it returns, by which point the ring is correctly on.
   */
  it("keeps the ring out of the prerendered markup", async () => {
    window.localStorage.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify([
        {
          id: 550,
          title: "Fight Club",
          mediaType: "movie",
          posterPath: null,
          voteAverage: 8.4,
          releaseDate: "1999-10-15",
          watchedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );

    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(
      <WatchedProvider>
        <MediaCard item={item()} />
      </WatchedProvider>,
    );

    expect(html).not.toContain("ring-green-500");
    expect(html).toContain("Fight Club");
  });

  it("puts the ring on once the browser has read storage", () => {
    window.localStorage.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify([
        {
          id: 550,
          title: "Fight Club",
          mediaType: "movie",
          posterPath: null,
          voteAverage: 8.4,
          releaseDate: "1999-10-15",
          watchedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );

    renderCard();

    expect(poster().className).toContain("ring-green-500");
  });
});

describe("lazily loading watch providers", () => {
  /**
   * Forty cards on a listing page. Asking on mount is forty TMDB requests for a
   * screen nobody has pointed at.
   */
  it("asks for nothing until the card is pointed at", async () => {
    renderCard();
    await act(async () => {});

    expect(getTitleProviders).not.toHaveBeenCalled();
  });

  it("asks once the card is hovered", async () => {
    renderCard();

    await act(async () => {
      fireEvent.mouseEnter(poster());
    });

    expect(getTitleProviders).toHaveBeenCalledWith(550, "movie");
  });

  it("asks straight away when the overlay is forced open", async () => {
    renderCard({ forceShowOverlay: true });
    await act(async () => {});

    expect(getTitleProviders).toHaveBeenCalledTimes(1);
  });

  /**
   * `hasLoadedProviders` is what makes this bounded. Without it, every hover of
   * every card is another request – and a visitor scanning a row of posters with
   * the mouse generates them as fast as they can move it.
   */
  it("does not ask again on a second hover", async () => {
    renderCard();

    await act(async () => {
      fireEvent.mouseEnter(poster());
    });
    await act(async () => {
      fireEvent.mouseLeave(poster());
      fireEvent.mouseEnter(poster());
    });

    expect(getTitleProviders).toHaveBeenCalledTimes(1);
  });

  it("does not ask at all when the providers were handed in", async () => {
    renderCard({
      providers: [{ provider_id: 8, provider_name: "Netflix" }] as never,
      forceShowOverlay: true,
    });
    await act(async () => {});

    expect(getTitleProviders).not.toHaveBeenCalled();
  });

  /**
   * The props used to be read once, into a `useState` initialiser, and never
   * again – so a parent that had the list a render later was ignored, and the
   * card fetched its own copy on hover regardless.
   */
  it("follows providers handed in after the first render", async () => {
    const { rerender } = renderCard({ forceShowOverlay: true, loadingProviders: true });
    expect(screen.getByTestId("providers").textContent).toBe("loading");

    rerender(
      <MediaCard
        item={item()}
        forceShowOverlay
        loadingProviders={false}
        providers={[{ id: 8, name: "Netflix" } as never]}
      />,
    );
    await act(async () => {});

    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
  });

  it("shows what came back", async () => {
    getTitleProviders.mockResolvedValue({
      streaming: [{ id: 8, name: "Netflix" }],
    });

    renderCard({ forceShowOverlay: true });
    await act(async () => {});

    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
  });

  it("reports a failed lookup without treating it as confirmed empty or retrying continuously", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTitleProviders.mockRejectedValue(new Error("TMDB is down"));

    const { rerender } = renderCard({ forceShowOverlay: true });
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Retry streaming availability for Fight Club" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Could not load platforms.");
    expect(screen.queryByTestId("providers")).toBeNull();
    rerender(<MediaCard item={item()} forceShowOverlay />);
    await act(async () => {});
    expect(getTitleProviders).toHaveBeenCalledTimes(1);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Retry streaming availability/ })));
    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toContain("Could not load platforms.");
  });

  it("retries a failed lookup when the card is hovered again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const replacement = deferredProviders();
    getTitleProviders
      .mockRejectedValueOnce(new Error("Offline"))
      .mockReturnValueOnce(replacement.promise);
    renderCard();
    await act(async () => fireEvent.mouseEnter(poster()));

    expect(screen.getByRole("button", { name: /Retry streaming availability/ })).toBeTruthy();
    await act(async () => fireEvent.mouseLeave(poster()));
    await act(async () => fireEvent.mouseEnter(poster()));
    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("providers").textContent).toBe("loading");
    expect(screen.queryByRole("button", { name: /Retry streaming availability/ })).toBeNull();

    await act(async () => replacement.resolve({ streaming: [provider(8, "Netflix")] }));
    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
  });

  it("retries a failed lookup when keyboard focus returns to the card", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTitleProviders
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ streaming: [provider(8, "Netflix")] });
    renderCard();
    const link = screen.getByRole("link");
    await act(async () => link.focus());
    expect(screen.getByRole("button", { name: /Retry streaming availability/ })).toBeTruthy();

    await act(async () => link.blur());
    await act(async () => link.focus());

    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
  });

  it("keeps keyboard focus on the card while its focused Retry control is replaced by loading", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const replacement = deferredProviders();
    getTitleProviders
      .mockRejectedValueOnce(new Error("Offline"))
      .mockReturnValueOnce(replacement.promise);
    renderCard();
    const link = screen.getByRole("link");
    await act(async () => link.focus());
    const retry = screen.getByRole("button", { name: /Retry streaming availability/ });
    act(() => retry.focus());

    await act(async () => fireEvent.click(retry));

    expect(document.activeElement).toBe(link);
    expect(screen.getByTestId("providers").textContent).toBe("loading");
    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    await act(async () => replacement.resolve({ streaming: [provider(8, "Netflix")] }));
    expect(document.activeElement).toBe(link);
    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
  });

  it("retries a visible failed lookup once when the connection returns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTitleProviders
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ streaming: [provider(8, "Netflix")] });
    renderCard({ forceShowOverlay: true });
    await act(async () => {});

    await act(async () => fireEvent(window, new Event("online")));

    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
    await act(async () => fireEvent(window, new Event("online")));
    expect(getTitleProviders).toHaveBeenCalledTimes(2);
  });

  it("keeps reconnect recovery lazy after a failed card is no longer being viewed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTitleProviders
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ streaming: [provider(8, "Netflix")] });
    renderCard();
    await act(async () => fireEvent.mouseEnter(poster()));
    await act(async () => fireEvent.mouseLeave(poster()));

    await act(async () => fireEvent(window, new Event("online")));
    expect(getTitleProviders).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.mouseEnter(poster()));
    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("providers").textContent).toBe("Netflix");
  });

  it("does not retry a successful lookup that confirms no streaming providers", async () => {
    renderCard({ forceShowOverlay: true });
    await act(async () => {});

    await act(async () => fireEvent(window, new Event("online")));
    await act(async () => fireEvent.mouseEnter(poster()));
    await act(async () => fireEvent.mouseLeave(poster()));

    expect(getTitleProviders).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Retry streaming availability/ })).toBeNull();
    expect(screen.getByTestId("providers").textContent).toBe("");
  });

  /**
   * The request outliving the card is ordinary – a visitor scrolls, the row
   * unmounts. What must not happen is the response writing to a component that
   * is gone, which React reports as a warning and nothing else catches.
   */
  it("drops a response that arrives after the card is gone", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let settle!: (value: { streaming: [] }) => void;
    getTitleProviders.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    const { unmount } = renderCard({ forceShowOverlay: true });
    await act(async () => {});
    unmount();

    await act(async () => {
      settle({ streaming: [] });
    });

    expect(error).not.toHaveBeenCalled();
  });

  it.each(["this tab", "another tab"])(
    "replaces the providers when the region changes in %s",
    async (source) => {
      const replacement = deferredProviders();
      getTitleProviders
        .mockResolvedValueOnce({ streaming: [provider(8, "US provider")] })
        .mockReturnValueOnce(replacement.promise);
      renderCard({ forceShowOverlay: true });
      await act(async () => {});
      expect(screen.getByTestId("providers").textContent).toBe("US provider");

      act(() => {
        if (source === "this tab") {
          setRegion("CZ");
        } else {
          window.localStorage.setItem(REGION_KEY, "CZ");
          fireEvent(window, new StorageEvent("storage", { key: REGION_KEY }));
        }
      });

      expect(getTitleProviders).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("providers").textContent).toBe("loading");
      await act(async () => {
        replacement.resolve({ streaming: [provider(9, "CZ provider")] });
      });
      expect(screen.getByTestId("providers").textContent).toBe("CZ provider");
    },
  );

  it("keeps a region change lazy when the card is no longer being viewed", async () => {
    getTitleProviders.mockResolvedValueOnce({ streaming: [provider(8, "US provider")] });
    renderCard();
    await act(async () => fireEvent.mouseEnter(poster()));
    fireEvent.mouseLeave(poster());

    act(() => { setRegion("CZ"); });
    expect(getTitleProviders).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("providers").textContent).toBe("");

    getTitleProviders.mockResolvedValueOnce({ streaming: [provider(9, "CZ provider")] });
    await act(async () => fireEvent.mouseEnter(poster()));
    expect(getTitleProviders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("providers").textContent).toBe("CZ provider");
  });

  it("drops a previous region's response even when it finishes last", async () => {
    const oldRegion = deferredProviders();
    const newRegion = deferredProviders();
    getTitleProviders
      .mockReturnValueOnce(oldRegion.promise)
      .mockReturnValueOnce(newRegion.promise);
    renderCard({ forceShowOverlay: true });
    act(() => { setRegion("CZ"); });

    await act(async () => {
      newRegion.resolve({ streaming: [provider(9, "CZ provider")] });
    });
    await act(async () => {
      oldRegion.resolve({ streaming: [provider(8, "US provider")] });
    });
    expect(screen.getByTestId("providers").textContent).toBe("CZ provider");
  });

  it("continues to use handed-in providers after a region change", async () => {
    renderCard({ providers: [provider(8, "Parent's provider")], forceShowOverlay: true });
    act(() => { setRegion("CZ"); });
    await act(async () => {});

    expect(getTitleProviders).not.toHaveBeenCalled();
    expect(screen.getByTestId("providers").textContent).toBe("Parent's provider");
  });
});

describe("memoized card updates", () => {
  it.each(["item", "prop"])("shows replacement providers passed through the %s", (source) => {
    const title = item();
    const props = (providers: WatchProvider[]) => source === "item"
      ? { item: { ...title, providers } }
      : { item: title, providers };
    const { rerender } = render(
      <MemoizedMediaCard {...props([provider(8, "Netflix")])} forceShowOverlay />,
      { wrapper },
    );
    expect(screen.getByTestId("providers").textContent).toBe("Netflix");

    rerender(<MemoizedMediaCard {...props([provider(9, "Amazon")])} forceShowOverlay />);
    expect(screen.getByTestId("providers").textContent).toBe("Amazon");
    expect(getTitleProviders).not.toHaveBeenCalled();
  });

  it("shows updated title, poster, year and rating for the same id", () => {
    const { rerender } = render(
      <MemoizedMediaCard item={item()} showOverlay={false} />,
      { wrapper },
    );
    rerender(
      <MemoizedMediaCard item={item({
        title: "Updated title",
        poster_path: "/updated-poster.jpg",
        release_date: "2025-01-01",
        vote_average: 9.1,
      })} showOverlay={false} />,
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe("/movie?id=updated-title-550");
    expect(screen.getByRole("link").getAttribute("aria-label")).toContain("2025");
    expect(screen.getByText("Poster for Updated title").getAttribute("data-src"))
      .toContain("/updated-poster.jpg");
    expect(screen.getByLabelText("Rating: 9.1 out of 10 stars")).toBeTruthy();
  });

  it("uses the latest click callback with otherwise unchanged props", () => {
    const title = item();
    const previous = vi.fn();
    const current = vi.fn();
    const { rerender } = render(
      <MemoizedMediaCard item={title} onCardClick={previous} />,
      { wrapper },
    );
    rerender(<MemoizedMediaCard item={title} onCardClick={current} />);
    const link = screen.getByRole("link");
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);

    expect(previous).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
  });
});

describe("what a screen reader is told", () => {
  it("gives the rating as a number out of ten", () => {
    renderCard();

    expect(screen.getByLabelText("Rating: 8.4 out of 10 stars")).toBeTruthy();
  });

  it("labels the trailer button with the title it plays", () => {
    renderCard({ forceShowOverlay: true });

    expect(screen.getByLabelText("Play trailer for Fight Club")).toBeTruthy();
  });

  it("carries a poster alt naming the title", () => {
    renderCard();

    expect(screen.getByText("Poster for Fight Club")).toBeTruthy();
  });

  /**
   * A button inside an anchor is invalid HTML. Browsers repair the nesting in
   * different ways and a screen reader announcing the link never reaches the
   * controls, so the play, save and seen buttons must sit *beside* the link.
   */
  it("keeps every button out of the link", () => {
    renderCard({ forceShowOverlay: true });

    const link = screen.getByRole("link");
    expect(link.querySelector("button")).toBeNull();
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(3);
  });
});

describe("on a phone", () => {
  /**
   * The first tap reveals the details rather than navigating – the overlay has
   * no hover to appear on. The mobile-only close button that comes with it is
   * an icon alone, and it used to have no name at all.
   */
  it("reveals the details on the first tap and names the close button", async () => {
    pretendPhone();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByRole("link"));
    });

    expect(screen.getByLabelText("Hide details for Fight Club")).toBeTruthy();
  });

  it("hides them again from that button", async () => {
    pretendPhone();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByRole("link"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Hide details for Fight Club"));
    });

    expect(screen.queryByLabelText("Hide details for Fight Club")).toBeNull();
    expect(screen.getByText("Tap for details")).toBeTruthy();
  });

  it("restores focus after a long trailer and restarts the details timeout on close", async () => {
    vi.useFakeTimers();
    pretendPhone();
    const { rerender } = renderCard();

    await act(async () => {
      fireEvent.click(screen.getByRole("link"));
    });
    act(() => vi.advanceTimersByTime(4000));
    const play = screen.getByRole("button", { name: "Play trailer for Fight Club" });
    act(() => play.focus());

    videoIsOpen = true;
    rerender(<MediaCard item={item()} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close video player" }),
    );

    act(() => vi.advanceTimersByTime(15000));
    expect(play.isConnected).toBe(true);
    expect(play.closest("[inert]")).toBeNull();

    videoIsOpen = false;
    rerender(<MediaCard item={item()} />);
    expect(document.activeElement).toBe(play);

    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole("button", { name: "Play trailer for Fight Club" })).toBe(play);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("button", { name: "Play trailer for Fight Club" })).toBeNull();
    expect(screen.getByText("Tap for details")).toBeTruthy();
  });
});

describe("the overlay", () => {
  it("is left out entirely when the card asks for no overlay", () => {
    renderCard({ showOverlay: false, forceShowOverlay: false });

    expect(screen.queryByTestId("providers")).toBeNull();
  });

  it("is inert until the card is hovered or focused", () => {
    renderCard();

    const overlay = screen.getByTestId("providers").closest("[inert]");
    expect(overlay).not.toBeNull();
  });

  it("reveals trailer controls and loads providers when the poster receives keyboard focus", async () => {
    renderCard();
    const link = screen.getByRole("link");

    await act(async () => link.focus());

    const play = screen.getByRole("button", { name: "Play trailer for Fight Club" });
    expect(play.closest("[inert]")).toBeNull();
    expect(play.closest(".transition-opacity")?.className).toContain("opacity-100");
    expect(getTitleProviders).toHaveBeenCalledWith(550, "movie");

    // Tabbing from the poster to its controls and moving the mouse away must
    // keep those controls available while the keyboard is using the card.
    act(() => play.focus());
    fireEvent.mouseLeave(poster());
    expect(document.activeElement).toBe(play);
    expect(play.closest("[inert]")).toBeNull();
  });

  it("hides the overlay after focus leaves the card", () => {
    renderCard();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      act(() => screen.getByRole("link").focus());
      act(() => outside.focus());

      expect(screen.getByTestId("providers").closest("[inert]")).not.toBeNull();
    } finally {
      outside.remove();
    }
  });

  it("keeps the trailer opener available while its dialog takes focus", () => {
    const { rerender } = renderCard();
    const play = screen.getByRole("button", { name: "Play trailer for Fight Club" });
    act(() => {
      screen.getByRole("link").focus();
      play.focus();
    });

    videoIsOpen = true;
    rerender(<MediaCard item={item()} />);
    // The dialog's own control. A stand-in appended to the page would not do:
    // the dialog hands focus that lands outside it back to this button.
    const dialogControl = screen.getByRole("button", { name: "Close video player" });
    act(() => dialogControl.focus());
    expect(document.activeElement).toBe(dialogControl);
    expect(play.closest("[inert]")).toBeNull();

    videoIsOpen = false;
    rerender(<MediaCard item={item()} />);
    expect(play.closest("[inert]")).toBeNull();
    act(() => play.focus());
    expect(document.activeElement).toBe(play);
  });
});
