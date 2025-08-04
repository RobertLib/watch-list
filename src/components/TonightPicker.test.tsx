// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TonightPicker } from "./TonightPicker";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";

/**
 * What the page says when it cannot pick anything.
 *
 * Three outcomes look alike from the outside and mean completely different
 * things: nothing saved, nothing matching the filters, and TMDB not answering.
 * The last one used to be rendered as the second – "Nothing on your list fits
 * that", with a button offering to reset filters that were never the problem.
 * On a page whose premise is that the list lives in this browser, an answer like
 * that reads as the list having gone missing.
 */

const { getTonightShortlist } = vi.hoisted(() => ({
  getTonightShortlist: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ getTonightShortlist }));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

function saveOneTitle() {
  window.localStorage.setItem(
    WATCHLIST_STORAGE_KEY,
    JSON.stringify([
      {
        id: 550,
        title: "Fight Club",
        mediaType: "movie",
        posterPath: "/poster.jpg",
        voteAverage: 8.4,
        releaseDate: "1999-10-15",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
}

async function renderPicker() {
  await act(async () => {
    render(
      <WatchlistProvider>
        <WatchedProvider>
          <TonightPicker />
        </WatchedProvider>
      </WatchlistProvider>,
    );
  });
}

beforeEach(() => {
  window.localStorage.clear();
  getTonightShortlist.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TonightPicker", () => {
  it("asks for titles before offering to pick one", async () => {
    getTonightShortlist.mockResolvedValue([]);
    await renderPicker();

    expect(screen.getByText("Nothing to pick from yet")).toBeDefined();
    expect(getTonightShortlist).not.toHaveBeenCalled();
  });

  // The regression: a rejected request fell through to the filter-reset panel.
  it("tells a failed load apart from a list that matches nothing", async () => {
    saveOneTitle();
    getTonightShortlist.mockRejectedValue(new Error("TMDB is down"));
    await renderPicker();

    expect(screen.getByText("Could not pick anything tonight")).toBeDefined();
    expect(screen.queryByText("Nothing on your list fits that.")).toBeNull();
  });

  it("still says nothing fits when the shortlist really is empty", async () => {
    saveOneTitle();
    getTonightShortlist.mockResolvedValue([]);
    await renderPicker();

    expect(screen.getByText("Nothing on your list fits that.")).toBeDefined();
    expect(screen.queryByText("Could not pick anything tonight")).toBeNull();
  });

  it("offers a retry that asks again", async () => {
    saveOneTitle();
    getTonightShortlist.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderPicker();

    getTonightShortlist.mockResolvedValueOnce([]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getTonightShortlist).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Could not pick anything tonight")).toBeNull();
  });
});
