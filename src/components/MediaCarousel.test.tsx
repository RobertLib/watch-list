// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MediaCarousel } from "./MediaCarousel";
import type { MediaItem } from "@/types/tmdb";

vi.mock("./MediaCard", () => ({
  MemoizedMediaCard: ({ item }: { item: MediaItem }) => <span>{item.title}</span>,
}));

const items: MediaItem[] = [1, 2, 3].map((id) => ({
  id,
  title: `Film ${id}`,
  overview: "",
  poster_path: null,
  backdrop_path: null,
  release_date: "2026-01-01",
  vote_average: 7,
  vote_count: 100,
  genre_ids: [],
  media_type: "movie",
}));

const frames = new Map<number, FrameRequestCallback>();
const observers = new Set<MockResizeObserver>();
let nextFrame = 0;

class MockResizeObserver {
  constructor(readonly callback: () => void) {
    observers.add(this);
  }
  observe = vi.fn();
  disconnect = vi.fn(() => observers.delete(this));
}

function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

function resizeRow() {
  act(() => {
    for (const observer of observers) observer.callback();
  });
  flushFrames();
}

function setRowSize(clientWidth: number, scrollWidth: number, scrollLeft = 0) {
  const row = document.querySelector<HTMLDivElement>(".overflow-x-auto")!;
  Object.defineProperties(row, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    scrollLeft: { configurable: true, writable: true, value: scrollLeft },
  });
  return row;
}

/**
 * The arrows stay mounted whether or not there is anywhere to scroll – so the
 * question is whether one is usable, not whether it exists.
 */
function arrow(name: "Scroll left" | "Scroll right") {
  return screen.getByRole("button", { name });
}

function isEnabled(name: "Scroll left" | "Scroll right") {
  return arrow(name).getAttribute("aria-disabled") !== "true";
}

beforeEach(() => {
  sessionStorage.clear();
  frames.clear();
  observers.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MediaCarousel overflow controls", () => {
  it.each([
    { scrollWidth: 400, hasArrow: false },
    { scrollWidth: 800, hasArrow: true },
  ])("measures a fresh row with width $scrollWidth before any scroll", ({ scrollWidth, hasArrow }) => {
    render(<MediaCarousel title="Popular" items={items} />);
    setRowSize(500, scrollWidth);
    flushFrames();

    expect(isEnabled("Scroll right")).toBe(hasArrow);
    expect(isEnabled("Scroll left")).toBe(false);
  });

  it("reveals newly available content after a row shrinks and removes arrows when it fits", () => {
    render(<MediaCarousel title="Popular" items={items} />);
    setRowSize(500, 400);
    flushFrames();
    expect(isEnabled("Scroll right")).toBe(false);

    setRowSize(200, 400);
    resizeRow();
    expect(isEnabled("Scroll right")).toBe(true);

    setRowSize(600, 400);
    resizeRow();
    expect(isEnabled("Scroll right")).toBe(false);
  });

  it("remeasures appended titles without resetting the current scroll position", () => {
    const { rerender } = render(<MediaCarousel title="Popular" items={items.slice(0, 1)} />);
    setRowSize(200, 400, 200);
    flushFrames();
    expect(isEnabled("Scroll right")).toBe(false);

    rerender(<MediaCarousel title="Popular" items={items} />);
    const row = setRowSize(200, 800, 200);
    flushFrames();

    expect(row.scrollLeft).toBe(200);
    expect(isEnabled("Scroll right")).toBe(true);
    expect(isEnabled("Scroll left")).toBe(true);
  });

  it("restores saved progress when a loading or empty row receives its titles", () => {
    sessionStorage.setItem("carousel-scroll-popular", "150");
    const { rerender } = render(<MediaCarousel title="Popular" items={[]} loading />);
    flushFrames();
    expect(observers.size).toBe(0);

    rerender(<MediaCarousel title="Popular" items={[]} />);
    expect(document.querySelector(".overflow-x-auto")).toBeNull();

    rerender(<MediaCarousel title="Popular" items={items} />);
    const row = setRowSize(200, 800);
    flushFrames();
    expect(row.scrollLeft).toBe(150);
    expect(isEnabled("Scroll left")).toBe(true);
    expect(observers.size).toBe(1);

    rerender(<MediaCarousel title="Popular" items={items} loading />);
    expect(observers.size).toBe(0);
    rerender(<MediaCarousel title="Popular" items={items} />);
    setRowSize(900, 800);
    flushFrames();
    expect(isEnabled("Scroll right")).toBe(false);
    expect(observers.size).toBe(1);
  });

  it("follows window resizing without ResizeObserver and releases pending work on unmount", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { unmount } = render(<MediaCarousel title="Popular" items={items} />);
    setRowSize(500, 400);
    flushFrames();

    setRowSize(200, 400);
    fireEvent(window, new Event("resize"));
    flushFrames();
    expect(isEnabled("Scroll right")).toBe(true);

    fireEvent(window, new Event("resize"));
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    fireEvent(window, new Event("resize"));
    expect(frames.size).toBe(0);
  });

  it("disconnects the observer and cancels a saved-position frame on unmount", () => {
    sessionStorage.setItem("carousel-scroll-popular", "150");
    const { unmount } = render(<MediaCarousel title="Popular" items={items} />);
    expect(frames.size).toBe(2);
    expect(observers.size).toBe(1);

    unmount();
    expect(frames.size).toBe(0);
    expect(observers.size).toBe(0);
  });
});

describe("MediaCarousel keyboard focus", () => {
  // The arrow used to be unmounted the moment the row reached its end, taking
  // keyboard focus with it to <body>.
  it("keeps focus on Scroll right when the row reaches its end", () => {
    render(<MediaCarousel title="Popular" items={items} />);
    const row = setRowSize(200, 800);
    row.scrollBy = vi.fn();
    flushFrames();

    const right = arrow("Scroll right");
    right.focus();
    fireEvent.click(right);
    expect(row.scrollBy).toHaveBeenCalledOnce();

    setRowSize(200, 800, 600);
    act(() => {
      fireEvent.scroll(row);
    });

    expect(arrow("Scroll right")).toBe(right);
    expect(document.activeElement).toBe(right);
    expect(right.getAttribute("aria-disabled")).toBe("true");
    // Out of the tab order from here on, but not blurred.
    expect(right.tabIndex).toBe(-1);
    expect(right.hasAttribute("disabled")).toBe(false);
    expect(isEnabled("Scroll left")).toBe(true);

    // An arrow with nowhere to go does nothing when pressed again.
    fireEvent.click(right);
    expect(row.scrollBy).toHaveBeenCalledOnce();
  });

  it("puts an arrow back in the tab order once it has somewhere to go", () => {
    render(<MediaCarousel title="Popular" items={items} />);
    setRowSize(200, 800);
    flushFrames();

    expect(arrow("Scroll left").tabIndex).toBe(-1);
    expect(arrow("Scroll right").tabIndex).toBe(0);

    const row = setRowSize(200, 800, 300);
    act(() => {
      fireEvent.scroll(row);
    });

    expect(arrow("Scroll left").tabIndex).toBe(0);
    expect(arrow("Scroll right").tabIndex).toBe(0);
  });
});

describe("MediaCarousel heading", () => {
  it("is a section of the page by default", () => {
    render(<MediaCarousel title="Popular" items={items} />);

    expect(screen.getByRole("heading", { level: 2, name: "Popular" })).toBeTruthy();
  });

  // On the home page the rows sit under "Movies" and "TV Shows" h2s.
  it("can be a subsection, loading or loaded", () => {
    const { rerender } = render(
      <MediaCarousel title="Popular" items={[]} loading headingLevel={3} />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Popular" })).toBeTruthy();

    rerender(<MediaCarousel title="Popular" items={items} headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3, name: "Popular" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });
});
