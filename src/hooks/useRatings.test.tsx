// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useRatings } from "./useRatings";
import { RATINGS_STORAGE_KEY } from "@/lib/ratings";

/**
 * The viewer's own scores, shared by every card on the page.
 *
 * The write path is the one worth pinning. `rate` and `unrate` deliberately read
 * through the store rather than the copy this render is holding, because a page
 * can have the same title in three places – a carousel, a grid and a detail
 * panel – and two quick changes made through different copies would otherwise
 * have the second overwrite the first with a map that predates it.
 */

function Card() {
  const { ratingFor } = useRatings();
  return <p>{ratingFor(550, "movie") ?? "unrated"}</p>;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useRatings", () => {
  it("renders unrated in the prerendered HTML", () => {
    window.localStorage.setItem(
      RATINGS_STORAGE_KEY,
      JSON.stringify({
        "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    expect(renderToString(<Card />)).toContain("unrated");
  });

  it("reads the stored scores once the browser takes over", () => {
    window.localStorage.setItem(
      RATINGS_STORAGE_KEY,
      JSON.stringify({
        "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    const { result } = renderHook(() => useRatings());

    expect(result.current.ratingFor(550, "movie")).toBe(9);
  });

  it("answers null for a title with no score", () => {
    const { result } = renderHook(() => useRatings());

    expect(result.current.ratingFor(550, "movie")).toBeNull();
  });

  it("keeps a film and a series with the same id apart", () => {
    const { result } = renderHook(() => useRatings());

    act(() => result.current.rate(550, "movie", 9));

    expect(result.current.ratingFor(550, "movie")).toBe(9);
    expect(result.current.ratingFor(550, "tv")).toBeNull();
  });

  it("records a score and clears it again", () => {
    const { result } = renderHook(() => useRatings());

    act(() => result.current.rate(550, "movie", 9));
    expect(result.current.ratingFor(550, "movie")).toBe(9);

    act(() => result.current.unrate(550, "movie"));
    expect(result.current.ratingFor(550, "movie")).toBeNull();
  });

  it("reaches every copy of the hook on the page", () => {
    const detail = renderHook(() => useRatings());
    const card = renderHook(() => useRatings());

    act(() => detail.result.current.rate(550, "movie", 8));

    expect(card.result.current.ratingFor(550, "movie")).toBe(8);
  });

  /**
   * Two titles scored through two different copies of the hook, neither of which
   * has re-rendered in between. Reading the render-time map instead of the store
   * would lose the first score.
   */
  it("does not let one copy's write undo another's", () => {
    const carousel = renderHook(() => useRatings());
    const grid = renderHook(() => useRatings());

    act(() => {
      carousel.result.current.rate(550, "movie", 9);
      grid.result.current.rate(27205, "movie", 7);
    });

    expect(grid.result.current.ratingFor(550, "movie")).toBe(9);
    expect(carousel.result.current.ratingFor(27205, "movie")).toBe(7);
  });

  it("survives a hand-edited store rather than taking the page down", () => {
    window.localStorage.setItem(RATINGS_STORAGE_KEY, "{ not json");

    const { result } = renderHook(() => useRatings());

    expect(result.current.ratings).toEqual({});
  });
});
