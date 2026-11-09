// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MediaReviews } from "./MediaReviews";
import type { ReviewsResponse } from "@/types/tmdb";

const longContent = "A thoughtful and memorable film. ".repeat(15);

function reviews(content = longContent): ReviewsResponse {
  return {
    id: 1,
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [{
      id: "review-1",
      author: "Reviewer",
      author_details: { name: "Reviewer", username: "reviewer", rating: 8 },
      content,
      created_at: "2026-01-01T12:00:00Z",
      url: "https://www.themoviedb.org/review/review-1",
    }],
  };
}

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

function setTextSize(clientHeight: number, scrollHeight: number) {
  const text = screen.getByText((content, element) =>
    element?.tagName === "P" && content.startsWith("A thoughtful"),
  );
  Object.defineProperties(text, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
  return text;
}

function resizeText() {
  act(() => {
    for (const observer of observers) observer.callback();
  });
  flushFrames();
}

beforeEach(() => {
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
});

describe("MediaReviews expansion", () => {
  /**
   * The toggle used to unmount between "Show less" and the next measurement –
   * collapsed, but not yet measured as clamped – so the keyboard focus that had
   * just pressed it fell to the page.
   */
  it("keeps keyboard focus on the toggle through Read more and Show less", () => {
    render(<MediaReviews reviews={reviews()} />);
    setTextSize(100, 200);
    flushFrames();

    const toggle = screen.getByRole("button", { name: "Read more" });
    toggle.focus();
    fireEvent.click(toggle);
    flushFrames();
    expect(screen.getByRole("button", { name: "Show less" })).toBe(toggle);

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Read more" })).toBe(toggle);
    expect(document.activeElement).toBe(toggle);

    flushFrames();
    expect(document.activeElement).toBe(toggle);
  });

  it("offers Read more when a formerly fitting review becomes clipped after resizing", () => {
    render(<MediaReviews reviews={reviews()} />);
    setTextSize(100, 100);
    flushFrames();
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();

    const text = setTextSize(100, 200);
    resizeText();
    fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    expect(text.classList.contains("line-clamp-5")).toBe(false);
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    flushFrames();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    flushFrames();
    expect(text.classList.contains("line-clamp-5")).toBe(true);
    expect(screen.getByRole("button", { name: "Read more" })).toBeTruthy();
  });

  it("removes the expansion control when a collapsed review fits after widening", () => {
    render(<MediaReviews reviews={reviews()} />);
    setTextSize(100, 200);
    flushFrames();
    expect(screen.getByRole("button", { name: "Read more" })).toBeTruthy();

    setTextSize(100, 100);
    resizeText();
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
  });

  it("remeasures changed review text even when both versions exceed the length threshold", () => {
    const { rerender } = render(<MediaReviews reviews={reviews()} />);
    setTextSize(100, 100);
    flushFrames();

    rerender(<MediaReviews reviews={reviews(longContent.repeat(2))} />);
    setTextSize(100, 250);
    flushFrames();
    expect(screen.getByRole("button", { name: "Read more" })).toBeTruthy();

    rerender(<MediaReviews reviews={reviews("A thoughtful short review.")} />);
    setTextSize(20, 20);
    flushFrames();
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
  });

  it("remeasures on window resizing without ResizeObserver and cleans up on unmount", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { unmount } = render(<MediaReviews reviews={reviews()} />);
    setTextSize(100, 100);
    flushFrames();

    setTextSize(100, 200);
    fireEvent(window, new Event("resize"));
    flushFrames();
    expect(screen.getByRole("button", { name: "Read more" })).toBeTruthy();

    fireEvent(window, new Event("resize"));
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    fireEvent(window, new Event("resize"));
    expect(frames.size).toBe(0);
  });

  it("disconnects its layout observer and cancels pending measurements on unmount", () => {
    const { unmount } = render(<MediaReviews reviews={reviews()} />);
    expect(observers.size).toBe(1);
    expect(frames.size).toBe(1);
    unmount();
    expect(observers.size).toBe(0);
    expect(frames.size).toBe(0);
  });
});

/**
 * Reviews arrive as Markdown and are shown as plain text. The emphasis patterns
 * used to be bare non-greedy `_(.+?)_` and `*(.+?)*`, which paired any two
 * delimiters they found – across words, through identifiers, through URLs.
 */
describe("MediaReviews markdown", () => {
  function shown(content: string): string | null {
    render(<MediaReviews reviews={reviews(content)} />);
    return document.querySelector("article p.leading-relaxed")?.textContent ?? null;
  }

  it.each([
    [
      "leaves the underscores in a link's address",
      "Read https://en.wikipedia.org/wiki/Fight_Club_(film) first.",
      "Read https://en.wikipedia.org/wiki/Fight_Club_(film) first.",
    ],
    [
      "leaves underscores inside words",
      "The snake_case names and the other_name both stay.",
      "The snake_case names and the other_name both stay.",
    ],
    [
      "leaves an asterisk with spaces round it",
      "Rated 2 * 3 * 4 out of a hundred.",
      "Rated 2 * 3 * 4 out of a hundred.",
    ],
    [
      "keeps emphasis delimiters that are part of a bare address",
      "Mirror at www.example.com/_a_/b and _here_.",
      "Mirror at www.example.com/_a_/b and here.",
    ],
    [
      "leaves a # that does not start a heading",
      "C# fans rank it #1.",
      "C# fans rank it #1.",
    ],
  ])("%s", (_name, content, expected) => {
    expect(shown(content)).toBe(expected);
  });

  it.each([
    ["emphasis and strong emphasis at word edges", "A _really_ good, *very* fun, **bold** and __strong__ film.", "A really good, very fun, bold and strong film."],
    ["emphasis that runs to the end of a word with an underscore inside", "_foo_bar_ is fine", "foo_bar is fine"],
    ["inline code", "Run `make_film` again.", "Run make_film again."],
    ["a heading at the start of a line", "## Verdict\nIt was _great_.", "Verdict\nIt was great."],
    ["a link, keeping its label – and an address with parentheses whole", "See [Fight Club](https://en.wikipedia.org/wiki/Fight_Club_(film)) now.", "See Fight Club now."],
    ["an image, keeping its alt text", "![The poster](https://example.com/p.jpg) says it all.", "The poster says it all."],
  ])("still strips %s", (_name, content, expected) => {
    expect(shown(content)).toBe(expected);
  });
});
