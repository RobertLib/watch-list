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

    expect(Boolean(screen.queryByRole("button", { name: "Scroll right" }))).toBe(hasArrow);
    expect(screen.queryByRole("button", { name: "Scroll left" })).toBeNull();
  });

  it("reveals newly available content after a row shrinks and removes arrows when it fits", () => {
    render(<MediaCarousel title="Popular" items={items} />);
    setRowSize(500, 400);
    flushFrames();
    expect(screen.queryByRole("button", { name: "Scroll right" })).toBeNull();

    setRowSize(200, 400);
    resizeRow();
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeTruthy();

    setRowSize(600, 400);
    resizeRow();
    expect(screen.queryByRole("button", { name: "Scroll right" })).toBeNull();
  });

  it("remeasures appended titles without resetting the current scroll position", () => {
    const { rerender } = render(<MediaCarousel title="Popular" items={items.slice(0, 1)} />);
    setRowSize(200, 400, 200);
    flushFrames();
    expect(screen.queryByRole("button", { name: "Scroll right" })).toBeNull();

    rerender(<MediaCarousel title="Popular" items={items} />);
    const row = setRowSize(200, 800, 200);
    flushFrames();

    expect(row.scrollLeft).toBe(200);
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scroll left" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Scroll left" })).toBeTruthy();
    expect(observers.size).toBe(1);

    rerender(<MediaCarousel title="Popular" items={items} loading />);
    expect(observers.size).toBe(0);
    rerender(<MediaCarousel title="Popular" items={items} />);
    setRowSize(900, 800);
    flushFrames();
    expect(screen.queryByRole("button", { name: "Scroll right" })).toBeNull();
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
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeTruthy();

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
