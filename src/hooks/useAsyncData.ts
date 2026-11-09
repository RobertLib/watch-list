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

/** What a load settled with, and which deps and attempt it was started for. */
interface Settled<T> {
  deps: readonly unknown[];
  attempt: number;
  data: T | null;
  error: unknown;
}

const LOADING = { data: null, isLoading: true, error: null } as const;

function sameDeps(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/**
 * Load something once, and again whenever `deps` change.
 *
 * The one shape every page in this app now needs. Server Components used to do
 * this by awaiting in the body; a static export has to do it in an effect, and
 * doing that by hand forty times is forty chances to forget the cancellation –
 * a fast click through three titles would otherwise leave whichever request
 * finished last on screen.
 *
 * `load` receives a signal that is aborted once its result can no longer be
 * shown: when the deps change, on `reload`, or when the page unmounts. Passing
 * it on to the TMDB transport releases requests nobody else is waiting for.
 *
 * `placeholder` is what to show until the first load settles: the snapshot the
 * build wrote into the page (`build-time-tmdb.ts`). It is what the prerendered
 * HTML was rendered with, so hydration finds the same markup instead of a
 * skeleton, and the visitor reads the listing while their own region's copy
 * loads. Only before anything has settled, though – once a real answer has
 * been on screen, a later load shows the loading state like any other, because
 * the snapshot describes page one of the default view and nothing else. The
 * caller passes it only while it is asking for that view.
 */
export function useAsyncData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  placeholder?: T | null,
): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  // Bumped by `reload`, and a dependency of the effect below – which is the
  // whole mechanism for running the load again.
  const [attempt, setAttempt] = useState(0);

  // One array per distinct set of deps: the identity a result is filed under.
  // Replaced during the render that first sees new deps, so that render and
  // every later one compare results against the new identity.
  const [renderedDeps, setRenderedDeps] = useState(deps);
  const currentDeps = sameDeps(renderedDeps, deps) ? renderedDeps : deps;
  if (currentDeps !== renderedDeps) setRenderedDeps(currentDeps);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Filed under the identity this effect was started for, never "whatever
    // is current when it settles".
    const request = { deps: renderedDeps, attempt };

    load(controller.signal).then(
      (data) => {
        if (!cancelled) setSettled({ ...request, data, error: null });
      },
      (error) => {
        if (cancelled) return;
        console.error("Failed to load page data:", error);
        setSettled({ ...request, data: null, error });
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `load` is a fresh closure on every render by design – the caller lists
    // what it actually depends on instead, and `renderedDeps` changes exactly
    // when those do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedDeps, attempt]);

  // A result is shown only under the deps and attempt it was loaded for. The
  // cancellation flag alone could not promise that: a navigation commits as a
  // transition, and its cleanup runs after the commit, so the previous load
  // could still settle in between and put the old film's details on the new
  // film's page until the new load answered.
  if (
    !settled ||
    settled.deps !== currentDeps ||
    settled.attempt !== attempt
  ) {
    if (!settled && placeholder != null) {
      return { data: placeholder, isLoading: false, error: null, reload };
    }
    return { ...LOADING, reload };
  }

  return { data: settled.data, isLoading: false, error: settled.error, reload };
}
