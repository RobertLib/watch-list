"use client";

import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  /** Set when the load threw. `data` stays null and the page shows its miss. */
  error: unknown;
  /**
   * Run the load again.
   *
   * What the "Try again" button of an error state calls. Without it a failed
   * load is final for the life of the page: the deps have not changed, so the
   * effect below will not re-run, and the visitor's only recourse is a full
   * reload of an app whose whole state lives in this tab.
   */
  reload: () => void;
}

interface LoadState<T> {
  data: T | null;
  isLoading: boolean;
  error: unknown;
}

const LOADING: LoadState<never> = { data: null, isLoading: true, error: null };

function sameDeps(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/**
 * Load something once, and again whenever `deps` change.
 *
 * The one shape every page in this app now needs. Server Components used to do
 * this by awaiting in the body; a static export has to do it in an effect, and
 * doing that by hand forty times is forty chances to forget the cancellation
 * flag – a fast click through three titles would otherwise leave whichever
 * request finished last on screen.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [state, setState] = useState<LoadState<T>>(LOADING);

  // Bumped by `reload`, and a dependency of the effect below – which is the
  // whole mechanism. Nothing else reads it.
  const [attempt, setAttempt] = useState(0);

  // Reset to loading *during* the render that first sees new deps, rather than
  // from the effect below. Both orders paint the same frames, but doing it here
  // keeps the stale data of the previous deps off screen for good and keeps the
  // effect free of the cascading render that `react-hooks/set-state-in-effect`
  // warns about.
  const [renderedDeps, setRenderedDeps] = useState(deps);
  if (!sameDeps(renderedDeps, deps)) {
    setRenderedDeps(deps);
    setState(LOADING);
  }

  const reload = useCallback(() => {
    setState(LOADING);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    load().then(
      (data) => {
        if (!cancelled) setState({ data, isLoading: false, error: null });
      },
      (error) => {
        if (cancelled) return;
        console.error("Failed to load page data:", error);
        setState({ data: null, isLoading: false, error });
      },
    );

    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure on every render by design – the caller lists
    // what it actually depends on instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { ...state, reload };
}
