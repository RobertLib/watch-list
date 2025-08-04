// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Genre } from "@/types/tmdb";

const getMovieGenres = vi.fn<() => Promise<{ genres: Genre[] }>>();
const getTVGenres = vi.fn<() => Promise<{ genres: Genre[] }>>();

vi.mock("@/lib/tmdb", () => ({
  tmdbApi: {
    getMovieGenres: () => getMovieGenres(),
    getTVGenres: () => getTVGenres(),
  },
}));

const { GenresProvider, useGenres } = await import("./GenresContext");

/**
 * The genre lists, fetched lazily.
 *
 * "Lazily" is the whole design and the thing worth pinning. This provider wraps
 * the entire app, so fetching on its own mount spent two TMDB requests on every
 * page view – including `/about`, `/profile` and `/offline`, which never name a
 * genre. Asking is what starts the fetch, and asking twice must not fetch twice.
 */

const wrapper = ({ children }: { children: ReactNode }) => (
  <GenresProvider>{children}</GenresProvider>
);

const MOVIE_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 18, name: "Drama" },
];

const TV_GENRES: Genre[] = [{ id: 10765, name: "Sci-Fi & Fantasy" }];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  getMovieGenres.mockResolvedValue({ genres: MOVIE_GENRES });
  getTVGenres.mockResolvedValue({ genres: TV_GENRES });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getMovieGenres.mockReset();
  getTVGenres.mockReset();
});

describe("GenresProvider", () => {
  it("fetches nothing until something asks", () => {
    renderHook(() => null, { wrapper });

    expect(getMovieGenres).not.toHaveBeenCalled();
    expect(getTVGenres).not.toHaveBeenCalled();
  });

  it("hands back both lists once a consumer asks", async () => {
    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movieGenres).toEqual(MOVIE_GENRES);
    expect(result.current.tvGenres).toEqual(TV_GENRES);
  });

  /**
   * A listing page holds a filter bar, a genre nav and a card row, all of which
   * ask on mount. One fetch is the point of the whole arrangement.
   */
  it("fetches once however many consumers ask", async () => {
    const { result } = renderHook(
      () => {
        useGenres();
        useGenres();
        return useGenres();
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
    expect(getTVGenres).toHaveBeenCalledTimes(1);
  });

  /**
   * A boolean cannot express this on its own: a consumer sets the status from an
   * effect *after* its first render, and in between it must not be told the
   * lists are simply empty.
   */
  it("reads as loading before the request has even started", () => {
    const { result } = renderHook(() => useGenres(), { wrapper });

    expect(result.current.movieGenres).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  // A failed fetch answers with two empty lists, and "empty" has to settle
  // rather than read as "still loading" for the rest of the session.
  it("settles rather than spinning when TMDB does not answer", async () => {
    getMovieGenres.mockRejectedValue(new Error("TMDB API error: 500"));

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movieGenres).toEqual([]);
    expect(result.current.tvGenres).toEqual([]);
  });

  // Every consumer maps over these lists, so a 200 carrying an unexpected body
  // must not put `undefined` into state.
  it("survives a 200 that is not shaped like a genre list", async () => {
    getMovieGenres.mockResolvedValue({} as { genres: Genre[] });

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movieGenres).toEqual([]);
    expect(result.current.tvGenres).toEqual(TV_GENRES);
  });

  it("refuses to be used outside its provider", () => {
    expect(() => renderHook(() => useGenres())).toThrow(
      /must be used within a GenresProvider/,
    );
  });
});
