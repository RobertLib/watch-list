// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useDocumentTitle } from "./useDocumentTitle";

/**
 * The tab's title on a site where `export const metadata` reaches none of the
 * pages that need it. Every title, person and collection page is client-rendered
 * over a shared shell, so this hook is the only thing standing between a browser
 * tab and the root layout's generic default.
 */

afterEach(() => {
  cleanup();
  document.title = "";
});

describe("useDocumentTitle", () => {
  it("appends the site suffix", () => {
    renderHook(() => useDocumentTitle("Fight Club (1999)"));

    expect(document.title).toBe("Fight Club (1999) | WatchList");
  });

  // Otherwise the home page reads "WatchList | WatchList".
  it("does not append the suffix to the suffix", () => {
    renderHook(() => useDocumentTitle("WatchList"));

    expect(document.title).toBe("WatchList");
  });

  it("leaves the title alone while the page is still loading", () => {
    document.title = "WatchList – Free Movie & TV Show Watchlist Tracker";

    renderHook(() => useDocumentTitle(null));

    expect(document.title).toBe(
      "WatchList – Free Movie & TV Show Watchlist Tracker",
    );
  });

  it("follows the title as the page resolves", () => {
    const { rerender } = renderHook(
      ({ title }: { title: string | null }) => useDocumentTitle(title),
      { initialProps: { title: "Fight Club (1999)" as string | null } },
    );

    rerender({ title: "Inception (2010)" });

    expect(document.title).toBe("Inception (2010) | WatchList");
  });

  /**
   * The restore matters because of how these pages are addressed. Navigating
   * from `/movie?id=550` to `/about` unmounts this hook and mounts nothing in
   * its place – without the cleanup, the new page would keep the old film's
   * name in the tab.
   */
  it("puts back the previous title on unmount", () => {
    document.title = "WatchList";

    const { unmount } = renderHook(() => useDocumentTitle("Fight Club (1999)"));
    expect(document.title).toBe("Fight Club (1999) | WatchList");

    unmount();
    expect(document.title).toBe("WatchList");
  });
});
