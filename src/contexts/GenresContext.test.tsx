// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { Genre } from "@/types/tmdb";

const getMovieGenres = vi.fn<() => Promise<{ genres: Genre[] }>>();
const getTVGenres = vi.fn<() => Promise<{ genres: Genre[] }>>();

vi.mock("@/lib/tmdb", () => ({
  tmdbApi: {
    getMovieGenres: () => getMovieGenres(),
    getTVGenres: () => getTVGenres(),
  },
}));

vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const { GenresProvider, useGenres } = await import("./GenresContext");
const { GenresContent } = await import("@/components/GenresContent");
const { GenreTags } = await import("@/components/GenreTags");

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

  // A failed list settles and stays retryable while the successful list survives.
  it("settles rather than spinning when TMDB does not answer", async () => {
    getMovieGenres.mockRejectedValue(new Error("TMDB API error: 500"));

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movieGenres).toEqual([]);
    expect(result.current.tvGenres).toEqual(TV_GENRES);
    expect(result.current.movieFailed).toBe(true);
    expect(result.current.tvFailed).toBe(false);
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
  });

  // Every consumer maps over these lists, so a 200 carrying an unexpected body
  // must not put `undefined` into state.
  it("survives a 200 that is not shaped like a genre list", async () => {
    getMovieGenres.mockResolvedValue({} as { genres: Genre[] });

    const { result } = renderHook(() => useGenres(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movieGenres).toEqual([]);
    expect(result.current.tvGenres).toEqual(TV_GENRES);
    expect(result.current.movieFailed).toBe(true);
  });

  it("retries only the failed list, keeping the successful list during the retry", async () => {
    getMovieGenres.mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(() => useGenres(), { wrapper });
    await waitFor(() => expect(result.current.movieFailed).toBe(true));

    let finish!: (value: { genres: Genre[] }) => void;
    getMovieGenres.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { result.current.requestGenres(); });
    expect(result.current.loading).toBe(true);
    expect(result.current.tvGenres).toEqual(TV_GENRES);
    expect(getTVGenres).toHaveBeenCalledTimes(1);

    await act(async () => { finish({ genres: MOVIE_GENRES }); });
    expect(result.current.movieGenres).toEqual(MOVIE_GENRES);
    expect(result.current.movieFailed).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(getMovieGenres).toHaveBeenCalledTimes(2);
  });

  it("does not retry continuously when both requests fail", async () => {
    getMovieGenres.mockRejectedValue(new Error("Offline"));
    getTVGenres.mockRejectedValue(new Error("Offline"));
    const { result, rerender } = renderHook(() => useGenres(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender();
    await act(async () => {});
    expect(result.current.movieFailed).toBe(true);
    expect(result.current.tvFailed).toBe(true);
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
    expect(getTVGenres).toHaveBeenCalledTimes(1);
  });

  it("recovers when a consumer remounts under the persistent layout", async () => {
    getMovieGenres.mockRejectedValueOnce(new Error("Offline"));
    function Consumer() {
      const genres = useGenres();
      return <p>{genres.movieGenres.map((genre) => genre.name).join(",")}</p>;
    }
    const view = render(<GenresProvider><Consumer /></GenresProvider>);
    await waitFor(() => expect(getTVGenres).toHaveBeenCalledTimes(1));
    await act(async () => {});
    view.rerender(<GenresProvider>{null}</GenresProvider>);
    view.rerender(<GenresProvider><Consumer /></GenresProvider>);

    await screen.findByText("Action,Drama");
    expect(getMovieGenres).toHaveBeenCalledTimes(2);
    expect(getTVGenres).toHaveBeenCalledTimes(1);
  });

  it("retries on reconnect only while a consumer needs genres", async () => {
    getMovieGenres.mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(() => useGenres(), { wrapper });
    await waitFor(() => expect(result.current.movieFailed).toBe(true));
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(result.current.movieFailed).toBe(false));
    expect(result.current.movieGenres).toEqual(MOVIE_GENRES);
    expect(getMovieGenres).toHaveBeenCalledTimes(2);
    expect(getTVGenres).toHaveBeenCalledTimes(1);

    act(() => { window.dispatchEvent(new Event("online")); });
    expect(getMovieGenres).toHaveBeenCalledTimes(2);
  });

  it("does not fetch on reconnect before any consumer mounts", () => {
    renderHook(() => null, { wrapper });
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(getMovieGenres).not.toHaveBeenCalled();
    expect(getTVGenres).not.toHaveBeenCalled();
  });

  it("does not retry in the background after navigating away from consumers", async () => {
    getMovieGenres.mockRejectedValueOnce(new Error("Offline"));
    function Consumer() {
      const { movieFailed } = useGenres();
      return <p>{movieFailed ? "failed" : "waiting"}</p>;
    }
    const view = render(<GenresProvider><Consumer /></GenresProvider>);
    await screen.findByText("failed");
    view.rerender(<GenresProvider>{null}</GenresProvider>);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
    expect(getTVGenres).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable failure rather than claiming a failed list is empty", async () => {
    getTVGenres.mockRejectedValueOnce(new Error("Offline"));
    render(<GenresProvider><GenresContent /></GenresProvider>);
    await screen.findByText("Could not load TV show genres");
    expect(screen.getByRole("link", { name: "Action Movies" })).toBeTruthy();
    expect(screen.queryByText("No genres found.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await screen.findByRole("link", { name: "Sci-Fi & Fantasy TV Shows" });
    expect(screen.queryByText("Could not load TV show genres")).toBeNull();
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
    expect(getTVGenres).toHaveBeenCalledTimes(2);
  });

  it("caches a genuinely empty successful list without retrying it", async () => {
    getMovieGenres.mockResolvedValue({ genres: [] });
    const { result } = renderHook(() => useGenres(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.requestGenres(); });
    expect(result.current.movieFailed).toBe(false);
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
  });

  it("keeps successful genre tags visible while the other list retries", async () => {
    getMovieGenres.mockRejectedValueOnce(new Error("Offline"));
    render(<GenresProvider>
      <GenresContent />
      <GenreTags genreIds={[10765]} mediaType="tv" />
    </GenresProvider>);
    await screen.findByText("Could not load movie genres");
    expect(screen.getByText("Sci-Fi & Fantasy", { selector: "span" })).toBeTruthy();

    getMovieGenres.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByText("Retrying movie genres…")).toBeTruthy();
    expect(screen.getByText("Sci-Fi & Fantasy", { selector: "span" })).toBeTruthy();
  });

  it("refuses to be used outside its provider", () => {
    expect(() => renderHook(() => useGenres())).toThrow(
      /must be used within a GenresProvider/,
    );
  });
});
