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
