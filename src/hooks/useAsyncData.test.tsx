// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useAsyncData } from "./useAsyncData";

/**
 * The one shape every page in this app needs, which makes it the single piece of
 * React worth pinning hardest: a static export cannot await in a Server
 * Component, so all forty-odd pages load through this hook. A regression here is
 * not one broken page, it is every page at once.
 */

/** A promise whose settling this test controls, for racing two loads. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  // The hook logs a failed load on purpose; the error-path tests would otherwise
  // print a stack per assertion and bury a real one.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAsyncData", () => {
  it("starts loading, then hands back the data", async () => {
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.resolve("titles"), []),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe("titles");
    expect(result.current.error).toBeNull();
  });

  /**
   * `data` has to stay null on failure rather than hold a partial answer: the
   * pages read `data` to decide between a grid and their error state, and a
   * half-populated one renders a shelf with nothing on it.
   */
  it("surfaces the error and leaves data null", async () => {
    const boom = new Error("TMDB API error: 503");

    const { result } = renderHook(() =>
      useAsyncData(() => Promise.reject(boom), []),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBeNull();
  });

  /**
   * What the "Try again" button calls. Without it a failed load is final for the
   * life of the page – the deps have not changed, so the effect will not re-run,
   * and the visitor's only recourse is a full reload of an app whose entire
   * state lives in this tab.
   */
  it("re-runs the load when reload is called", async () => {
    let attempt = 0;
    const load = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve("recovered");
    });

    const { result } = renderHook(() => useAsyncData(load, []));

    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.data).toBe("recovered"));

    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  /**
   * The previous deps' data must leave the screen in the same frame the new deps
   * arrive. Held one render longer, a click from one title to the next shows the
   * old film's cast under the new film's heading.
   */
  it("clears stale data in the render that first sees new deps", async () => {
    const answers: Record<string, string> = { 550: "Fight Club", 27205: "Inception" };

    const { result, rerender } = renderHook(
      ({ id }) => useAsyncData(() => Promise.resolve(answers[id]), [id]),
      { initialProps: { id: "550" } },
    );

    await waitFor(() => expect(result.current.data).toBe("Fight Club"));

    rerender({ id: "27205" });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.data).toBe("Inception"));
  });

  /**
   * The reason the hook exists in one place rather than forty. A fast click
   * through three titles leaves three requests in flight, and without the
   * cancellation flag whichever one the network happens to answer last is what
   * stays on screen – reliably the wrong one, because the slowest request is
   * usually the one that was abandoned.
   */
  it("ignores a stale load that settles after a newer one", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads: Record<string, Promise<string>> = {
      a: first.promise,
      b: second.promise,
    };

    const { result, rerender } = renderHook(
      ({ key }) => useAsyncData(() => loads[key], [key]),
      { initialProps: { key: "a" } },
    );

    rerender({ key: "b" });

    await act(async () => {
      second.resolve("newer");
    });

    expect(result.current.data).toBe("newer");

    // The abandoned request answers last, which is the case that used to win.
    await act(async () => {
      first.resolve("stale");
    });

    expect(result.current.data).toBe("newer");
  });

  /**
   * The same race on the failure path: a stale rejection must not replace good
   * data with an error state, which would read as an outage on a page that has
   * already loaded fine.
   */
  it("ignores a stale rejection that arrives after a newer success", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads: Record<string, Promise<string>> = {
      a: first.promise,
      b: second.promise,
    };

    const { result, rerender } = renderHook(
      ({ key }) => useAsyncData(() => loads[key], [key]),
      { initialProps: { key: "a" } },
    );

    rerender({ key: "b" });

    await act(async () => {
      second.resolve("newer");
    });

    await act(async () => {
      first.reject(new Error("abandoned"));
    });

    expect(result.current.data).toBe("newer");
    expect(result.current.error).toBeNull();
  });
});
