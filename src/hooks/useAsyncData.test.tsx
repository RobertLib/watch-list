// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTransition, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
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

  /**
   * A client navigation commits as a transition, and a transition's effect
   * cleanups run after its commit rather than inside it. The previous load
   * settling in that gap used to be accepted – the old effect had not been told
   * yet – so film A's details sat on film B's page until B's own load answered.
   *
   * `act` would flush the cleanups before any promise could settle, so this
   * drives a real root on React's own scheduler instead.
   */
  it("never shows the previous deps' result under deps committed in a transition", async () => {
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const wasActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    const loads = { A: deferred<string>(), B: deferred<string>() };
    const frames: string[] = [];
    let navigate!: (id: "A" | "B") => void;

    function Page() {
      const [id, setId] = useState<"A" | "B">("A");
      navigate = (next) => startTransition(() => setId(next));
      const { data, isLoading } = useAsyncData(() => loads[id].promise, [id]);
      frames.push(`id=${id} data=${data} loading=${isLoading}`);

      // Settles A after B has committed, before the passive cleanup that
      // would have marked it cancelled.
      useLayoutEffect(() => {
        if (id === "B") loads.A.resolve("A-data");
      }, [id]);

      return null;
    }

    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      root.render(<Page />);
      await vi.waitFor(() => expect(frames.at(-1)).toBe("id=A data=null loading=true"));

      navigate("B");
      await vi.waitFor(() => expect(frames.some((frame) => frame.startsWith("id=B"))).toBe(true));
      // Give the settled A a chance to render, as it used to.
      await new Promise((resolve) => setTimeout(resolve, 20));
      loads.B.resolve("B-data");
      await vi.waitFor(() => expect(frames.at(-1)).toBe("id=B data=B-data loading=false"));

      expect(frames.filter((frame) => frame.startsWith("id=B"))
        .every((frame) => frame === "id=B data=null loading=true" ||
          frame === "id=B data=B-data loading=false")).toBe(true);
    } finally {
      root.unmount();
      reactEnvironment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
    }
  });

  it("aborts the signal it handed to a load that can no longer be shown", async () => {
    const signals: AbortSignal[] = [];
    const { rerender, unmount } = renderHook(
      ({ key }) => useAsyncData((signal) => {
        signals.push(signal);
        return new Promise<string>(() => {});
      }, [key]),
      { initialProps: { key: "a" } },
    );

    rerender({ key: "b" });
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);

    unmount();
    expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
  });

  it("ignores the answer to an attempt that a reload replaced", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const answers = [first.promise, second.promise];
    let call = 0;
    const { result } = renderHook(() => useAsyncData(() => answers[call++], []));

    act(() => result.current.reload());
    expect(result.current.isLoading).toBe(true);

    await act(async () => { first.resolve("superseded"); });
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => { second.resolve("current"); });
    expect(result.current.data).toBe("current");
  });
});

/**
 * The build writes a snapshot of page one into the prerendered HTML; the hook
 * shows it in place of the loading state until the first real answer, so
 * hydration finds the markup the prerender wrote – and only until then.
 */
describe("useAsyncData placeholder", () => {
  it("shows the placeholder, not a loading state, until the first load settles", async () => {
    const load = deferred<string>();
    const { result } = renderHook(() =>
      useAsyncData(() => load.promise, [], "snapshot"),
    );

    expect(result.current).toMatchObject({ data: "snapshot", isLoading: false, error: null });

    await act(async () => { load.resolve("live"); });
    expect(result.current).toMatchObject({ data: "live", isLoading: false });
  });

  it("keeps the placeholder across a deps change that happens before anything settled", async () => {
    // A visitor whose region differs from the build's: the settings snapshot
    // changes the deps straight after hydration, and the screen should not
    // drop to a skeleton for it.
    const loads = [deferred<string>(), deferred<string>()];
    let call = 0;
    const { result, rerender } = renderHook(
      ({ region }) => useAsyncData(() => loads[call++].promise, [region], "snapshot"),
      { initialProps: { region: "US" } },
    );

    rerender({ region: "CZ" });
    expect(result.current).toMatchObject({ data: "snapshot", isLoading: false });

    await act(async () => { loads[1].resolve("CZ titles"); });
    expect(result.current.data).toBe("CZ titles");
  });

  it("shows the loading state for later deps once a real answer has been on screen", async () => {
    const loads = [deferred<string>(), deferred<string>()];
    let call = 0;
    const { result, rerender } = renderHook(
      ({ page }) => useAsyncData(() => loads[call++].promise, [page], "snapshot"),
      { initialProps: { page: 1 } },
    );
    await act(async () => { loads[0].resolve("page one"); });

    rerender({ page: 2 });
    expect(result.current).toMatchObject({ data: null, isLoading: true });
  });

  it("treats a null placeholder as none", () => {
    const { result } = renderHook(() =>
      useAsyncData(() => new Promise<string>(() => {}), [], null),
    );

    expect(result.current).toMatchObject({ data: null, isLoading: true });
  });

  it("reports a failed first load as an error rather than keeping the placeholder", async () => {
    const load = deferred<string>();
    const { result } = renderHook(() =>
      useAsyncData(() => load.promise, [], "snapshot"),
    );

    await act(async () => { load.reject(new Error("offline")); });
    expect(result.current).toMatchObject({ data: null, isLoading: false });
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
