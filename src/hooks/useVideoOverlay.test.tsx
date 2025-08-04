// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Video, VideosResponse } from "@/types/tmdb";

const getMovieVideos = vi.fn<(id: number) => Promise<VideosResponse>>();
const getTVShowVideos = vi.fn<(id: number) => Promise<VideosResponse>>();

vi.mock("@/lib/tmdb", () => ({
  tmdbApi: {
    getMovieVideos: (id: number) => getMovieVideos(id),
    getTVShowVideos: (id: number) => getTVShowVideos(id),
  },
}));

const { useVideoOverlay } = await import("./useVideoOverlay");

/**
 * The trailer button, on a catalogue where "the trailer" is a guess.
 *
 * TMDB answers with everything anyone has attached to a title: teasers, clips,
 * bloopers, a Vimeo link, four trailers in three languages. The ordering here is
 * what decides which one a click plays, and getting it wrong is how a poster's
 * play button opens six minutes of behind-the-scenes footage.
 *
 * The other half is timing. The lookup is a round trip and the visitor is free
 * to close the overlay, open another title or leave the page before it answers;
 * a late answer used to land in whatever state it found.
 */

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "abc",
    key: "k-official-trailer",
    name: "Official Trailer",
    site: "YouTube",
    type: "Trailer",
    official: true,
    published_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function response(results: Video[]): VideosResponse {
  return { id: 550, results };
}

/** A lookup this test decides when to settle. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getMovieVideos.mockReset();
  getTVShowVideos.mockReset();
});

describe("useVideoOverlay", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useVideoOverlay());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.video).toBeNull();
  });

  it("opens immediately and fills in when TMDB answers", async () => {
    const trailer = video({ key: "k-trailer" });
    getMovieVideos.mockResolvedValue(response([trailer]));

    const { result } = renderHook(() => useVideoOverlay());

    // The overlay is up before the request settles, so the click has a visible
    // effect rather than appearing to do nothing for a round trip.
    act(() => {
      void result.current.openVideo(550, "movie");
    });
    expect(result.current.isOpen).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.video?.key).toBe("k-trailer");
  });

  it("prefers the official trailer over an unofficial one", async () => {
    getMovieVideos.mockResolvedValue(
      response([
        video({ key: "k-fan-cut", official: false }),
        video({ key: "k-official" }),
      ]),
    );

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(550, "movie");
    });

    expect(result.current.video?.key).toBe("k-official");
  });

  it("prefers any trailer over a teaser or a featurette", async () => {
    getMovieVideos.mockResolvedValue(
      response([
        video({ key: "k-teaser", type: "Teaser" }),
        video({ key: "k-unofficial-trailer", official: false }),
      ]),
    );

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(550, "movie");
    });

    expect(result.current.video?.key).toBe("k-unofficial-trailer");
  });

  // Better something than an empty player, when the title simply has no trailer.
  it("falls back to whatever the title has", async () => {
    getMovieVideos.mockResolvedValue(
      response([video({ key: "k-clip", type: "Clip", official: false })]),
    );

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(550, "movie");
    });

    expect(result.current.video?.key).toBe("k-clip");
  });

  it("settles on nothing when the title has no videos at all", async () => {
    getMovieVideos.mockResolvedValue(response([]));

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(550, "movie");
    });

    expect(result.current.video).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("asks the series endpoint for a series", async () => {
    getTVShowVideos.mockResolvedValue(response([video({ key: "k-tv" })]));

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(1396, "tv");
    });

    expect(getTVShowVideos).toHaveBeenCalledWith(1396);
    expect(getMovieVideos).not.toHaveBeenCalled();
  });

  // A failed lookup must still stop loading, or the overlay spins for as long as
  // the tab is open.
  it("stops loading when the request fails", async () => {
    getMovieVideos.mockRejectedValue(new Error("TMDB API error: 500"));

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(550, "movie");
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.video).toBeNull();
    expect(result.current.isOpen).toBe(true);
  });

  it("drops the video when closed, so the next open cannot flash the last one", async () => {
    getMovieVideos.mockResolvedValue(response([video({ key: "k-trailer" })]));

    const { result } = renderHook(() => useVideoOverlay());
    await act(async () => {
      await result.current.openVideo(550, "movie");
    });

    act(() => result.current.closeVideo());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.video).toBeNull();
  });
});

describe("a lookup that answers late", () => {
  /**
   * Closed before TMDB answered. The answer must not be written into the closed
   * overlay – it would sit there and flash on the next open – and loading must
   * not be left on, since the request that would have cleared it is disowned.
   */
  it("is ignored once the overlay has been closed", async () => {
    const slow = deferred<VideosResponse>();
    getMovieVideos.mockReturnValue(slow.promise);

    const { result } = renderHook(() => useVideoOverlay());
    act(() => {
      void result.current.openVideo(550, "movie");
    });
    expect(result.current.isLoading).toBe(true);

    act(() => result.current.closeVideo());
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      slow.resolve(response([video({ key: "k-late" })]));
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.video).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  // Two titles opened in quick succession; the first answers last.
  it("loses to a later open for a different title", async () => {
    const slow = deferred<VideosResponse>();
    getMovieVideos
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(response([video({ key: "k-second" })]));

    const { result } = renderHook(() => useVideoOverlay());
    act(() => {
      void result.current.openVideo(550, "movie");
    });
    await act(async () => {
      await result.current.openVideo(680, "movie");
    });
    expect(result.current.video?.key).toBe("k-second");

    await act(async () => {
      slow.resolve(response([video({ key: "k-first" })]));
    });

    expect(result.current.video?.key).toBe("k-second");
  });

  // The same guard on the failure path: a stale rejection may not blank a
  // trailer that a later open has already put up.
  it("lets a stale rejection pass without touching the current video", async () => {
    const slow = deferred<VideosResponse>();
    getMovieVideos
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(response([video({ key: "k-second" })]));

    const { result } = renderHook(() => useVideoOverlay());
    act(() => {
      void result.current.openVideo(550, "movie");
    });
    await act(async () => {
      await result.current.openVideo(680, "movie");
    });

    await act(async () => {
      slow.resolve(Promise.reject(new Error("network")) as never);
    });

    expect(result.current.video?.key).toBe("k-second");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("writes nothing after the component is gone", async () => {
    const slow = deferred<VideosResponse>();
    getMovieVideos.mockReturnValue(slow.promise);

    const { result, unmount } = renderHook(() => useVideoOverlay());
    act(() => {
      void result.current.openVideo(550, "movie");
    });
    unmount();

    await act(async () => {
      slow.resolve(response([video({ key: "k-late" })]));
    });

    // React 19 drops a write to an unmounted component without a warning, so
    // the observable promise is only that nothing throws and nothing is logged.
    expect(console.error).not.toHaveBeenCalled();
  });
});
