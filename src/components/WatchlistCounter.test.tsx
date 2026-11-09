// @vitest-environment jsdom

import { afterEach, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { WatchlistCounter } from "./WatchlistCounter";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** An absent `className` used to be interpolated as the class "undefined". */
it("adds no stray class when given none", async () => {
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
    { id: 1, title: "Film", mediaType: "movie", addedAt: "2026-01-01T00:00:00.000Z" },
  ]));
  render(<WatchlistCounter />, { wrapper: WatchlistProvider });
  await act(async () => {});

  const badge = screen.getByText("1").parentElement!;
  expect(badge.className).not.toContain("undefined");
  expect(badge.className).toContain("bg-red-600");
});
