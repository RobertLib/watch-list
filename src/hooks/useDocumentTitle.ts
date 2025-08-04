"use client";

import { useEffect } from "react";

const SUFFIX = "WatchList";

/**
 * Set the browser tab's title.
 *
 * Every page is client-rendered, so `export const metadata` is not available to
 * any of them – the root layout's title is what the served HTML carries, and
 * this replaces it once the page knows what it is showing. Passing null leaves
 * the default alone, which is what a page that is still loading wants.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;

    const previous = document.title;
    document.title = title === SUFFIX ? title : `${title} | ${SUFFIX}`;

    return () => {
      document.title = previous;
    };
  }, [title]);
}
