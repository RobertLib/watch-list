"use client";

import { useEffect } from "react";

const SUFFIX = "WatchList";

/**
 * Set the browser tab's title.
 *
 * Every page still exports `metadata`, but a static export resolves it at build
 * time – and the pages addressed by query string are exactly the ones the build
 * cannot name. Nothing at build time knows which film `?id=550` is, so those
 * pages ship a generic title in their HTML and replace it here once the browser
 * has the answer. Passing null leaves the built-in one alone, which is what a
 * page that is still loading wants.
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
