// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useHydrated } from "./useHydrated";

/**
 * The guard in front of everything that must not render until browser storage is
 * readable.
 *
 * It is one `useSyncExternalStore` call, which is exactly why it is worth a test:
 * the two snapshot arguments look interchangeable and are not. Swap them and
 * every caller renders its browser-only output into the prerendered HTML, which
 * is a hydration mismatch on every page at once rather than a visible bug on one.
 */

function Panel() {
  return <p>{useHydrated() ? "browser" : "prerender"}</p>;
}

afterEach(cleanup);

describe("useHydrated", () => {
  it("is false in the static export's HTML", () => {
    expect(renderToString(<Panel />)).toContain("prerender");
  });

  it("is true once the browser has taken over", () => {
    const { result } = renderHook(() => useHydrated());

    expect(result.current).toBe(true);
  });

  // The server and client snapshots have to disagree for the hook to mean
  // anything, and agree in shape for React to accept them.
  it("gives the prerender and the browser different answers", () => {
    const prerendered = renderToString(<Panel />);
    render(<Panel />);

    expect(prerendered).toContain("prerender");
    expect(screen.getByText("browser")).toBeTruthy();
  });
});
