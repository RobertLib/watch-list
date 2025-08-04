// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useViewMode } from "./useViewMode";
import { DEFAULT_VIEW_MODE } from "@/lib/view-mode";

/**
 * The layout every listing on the page shares.
 *
 * "Shares" is the part worth pinning: a page can hold half a dozen carousels and
 * a grid, each with its own copy of this hook, and flipping the toggle in one of
 * them has to move all of them. A `storage` event does not do that – it only
 * fires in *other* tabs – so the store dispatches its own event, and this is
 * what proves the hook is listening for it.
 */

function Listing() {
  return <p>{useViewMode().viewMode}</p>;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("useViewMode", () => {
  it("starts on the default the prerendered HTML shipped", () => {
    expect(renderToString(<Listing />)).toContain(DEFAULT_VIEW_MODE);
  });

  it("reads the saved preference once the browser takes over", () => {
    window.localStorage.setItem("view-mode", "list");

    const { result } = renderHook(() => useViewMode());

    expect(result.current.viewMode).toBe("list");
  });

  it("ignores a hand-edited value rather than laying out nothing", () => {
    window.localStorage.setItem("view-mode", "mosaic");

    const { result } = renderHook(() => useViewMode());

    expect(result.current.viewMode).toBe(DEFAULT_VIEW_MODE);
  });

  it("moves every listing on the page, not just the one that was toggled", () => {
    const toggled = renderHook(() => useViewMode());
    const elsewhere = renderHook(() => useViewMode());

    act(() => toggled.result.current.setViewMode("list"));

    expect(toggled.result.current.viewMode).toBe("list");
    expect(elsewhere.result.current.viewMode).toBe("list");
  });

  it("remembers the choice", () => {
    const { result } = renderHook(() => useViewMode());

    act(() => result.current.setViewMode("list"));

    expect(window.localStorage.getItem("view-mode")).toBe("list");
  });
});
