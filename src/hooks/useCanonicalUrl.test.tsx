// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useCanonicalUrl } from "./useCanonicalUrl";

/**
 * `<link rel="canonical">` for the query-addressed pages, which is every title,
 * person and collection in the catalogue. The build cannot know their canonicals
 * – that is the whole reason they are query-addressed – so a bug here has every
 * film on the site claiming to be the same URL.
 */

function canonical(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
}

function seedExistingCanonical(href: string): void {
  const link = document.createElement("link");
  link.rel = "canonical";
  link.href = href;
  document.head.appendChild(link);
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('link[rel="canonical"]').forEach((link) => {
    link.remove();
  });
});

describe("useCanonicalUrl", () => {
  it("adds the tag the static shell does not ship", () => {
    expect(canonical()).toBeNull();

    renderHook(() =>
      useCanonicalUrl("https://www.watch-list.me/movie?id=550-fight-club"),
    );

    expect(canonical()?.href).toBe(
      "https://www.watch-list.me/movie?id=550-fight-club",
    );
  });

  it("removes a tag it created when the page goes away", () => {
    const { unmount } = renderHook(() =>
      useCanonicalUrl("https://www.watch-list.me/movie?id=550-fight-club"),
    );

    unmount();

    expect(canonical()).toBeNull();
  });

  it("declares nothing while the page is still resolving its id", () => {
    // A canonical pointing at the wrong title is worse than none.
    renderHook(() => useCanonicalUrl(null));

    expect(canonical()).toBeNull();
  });

  it("follows a client navigation from one title to another", () => {
    const { rerender } = renderHook(
      ({ url }: { url: string | null }) => useCanonicalUrl(url),
      {
        initialProps: {
          url: "https://www.watch-list.me/movie?id=550-fight-club" as
            | string
            | null,
        },
      },
    );

    rerender({ url: "https://www.watch-list.me/movie?id=27205-inception" });

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(
      1,
    );
    expect(canonical()?.href).toBe(
      "https://www.watch-list.me/movie?id=27205-inception",
    );
  });

  /**
   * A page that declares its own canonical statically – the home page does –
   * must get it back. Leaving a film's URL behind on a page that set one is how
   * a route ends up canonicalised to something it has nothing to do with.
   */
  it("restores a canonical the page declared for itself", () => {
    seedExistingCanonical("https://www.watch-list.me/");

    const { unmount } = renderHook(() =>
      useCanonicalUrl("https://www.watch-list.me/movie?id=550-fight-club"),
    );
    expect(canonical()?.href).toBe(
      "https://www.watch-list.me/movie?id=550-fight-club",
    );

    unmount();

    expect(canonical()?.href).toBe("https://www.watch-list.me/");
  });

  it("reuses an existing tag rather than adding a second", () => {
    seedExistingCanonical("https://www.watch-list.me/");

    renderHook(() =>
      useCanonicalUrl("https://www.watch-list.me/movie?id=550-fight-club"),
    );

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(
      1,
    );
  });
});
