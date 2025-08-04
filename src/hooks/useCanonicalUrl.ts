"use client";

import { useEffect } from "react";

/**
 * Maintain `<link rel="canonical">` for a page addressed by query string.
 *
 * The counterpart to `useDocumentTitle`, and it exists for the same reason: a
 * title's real canonical is `/movie?id=550-fight-club`, which the build cannot
 * know – there is no build-time list of every film on TMDB, which is the whole
 * reason these pages are query-addressed in the first place.
 *
 * Setting it from the browser reaches exactly the audience that can see the page
 * at all. These pages are an empty shell until JS fills them in, so a crawler
 * that does not run JS has no content here to index either way; one that does
 * runs this effect along with everything else and reads the resolved tag.
 *
 * Passing null removes the tag, which is what a page still resolving its id
 * wants – a canonical pointing at the wrong title is worse than none.
 */
export function useCanonicalUrl(url: string | null): void {
  useEffect(() => {
    if (!url) return;

    // Reuse the tag if one is already there: the static shell has none, but a
    // client navigation between two titles runs this twice before React has
    // torn the first one down.
    let link = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const existing = link?.getAttribute("href") ?? null;
    const created = !link;

    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }

    link.href = url;

    return () => {
      if (created) {
        link.remove();
        return;
      }

      // Put back whatever the page declared before, rather than leaving this
      // title's URL on the next page that does not set one.
      if (existing === null) link.removeAttribute("href");
      else link.href = existing;
    };
  }, [url]);
}
