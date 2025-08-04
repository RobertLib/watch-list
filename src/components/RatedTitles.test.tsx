// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RatedTitles } from "./RatedTitles";
import { RATINGS_STORAGE_KEY } from "@/lib/ratings";

/**
 * The rated list, which is half local and half TMDB.
 *
 * The scores are in this browser; the posters and titles they hang on are not.
 * So a failed request leaves a page that has the data and cannot draw it – and
 * before this it drew nothing at all, silently, which from the outside is
 * indistinguishable from a ratings store that has been wiped. Saying which half
 * failed is the whole point: one of them is recoverable by pressing a button and
 * the other is not.
 */

const { getTitlesByRefs } = vi.hoisted(() => ({ getTitlesByRefs: vi.fn() }));

vi.mock("@/lib/api", () => ({ getTitlesByRefs }));

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

vi.mock("./ShareListButton", () => ({ ShareListButton: () => null }));

function saveOneRating() {
  window.localStorage.setItem(
    RATINGS_STORAGE_KEY,
    JSON.stringify({
      "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
    }),
  );
}

const card = {
  id: 550,
  media_type: "movie" as const,
  title: "Fight Club",
  poster_path: "/poster.jpg",
  vote_average: 8.4,
  release_date: "1999-10-15",
  overview: "",
  genre_ids: [],
};

async function renderRated() {
  await act(async () => {
    render(<RatedTitles />);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  getTitlesByRefs.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RatedTitles", () => {
  it("asks for nothing when nothing is rated", async () => {
    await renderRated();

    expect(screen.getByText("You have not rated anything")).toBeDefined();
    expect(getTitlesByRefs).not.toHaveBeenCalled();
  });

  it("shows the rated titles once they resolve", async () => {
    saveOneRating();
    getTitlesByRefs.mockResolvedValue([card]);
    await renderRated();

    expect(screen.getByText("Fight Club")).toBeDefined();
  });

  // The regression: a rejected request rendered as a page with no scores on it,
  // which is exactly what a wiped ratings store looks like.
  it("tells a failed load apart from having rated nothing", async () => {
    saveOneRating();
    getTitlesByRefs.mockRejectedValue(new Error("TMDB is down"));
    await renderRated();

    expect(screen.getByText("Could not load your rated titles")).toBeDefined();
    expect(screen.queryByText("You have not rated anything")).toBeNull();
  });

  it("offers a retry that asks again", async () => {
    saveOneRating();
    getTitlesByRefs.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderRated();

    getTitlesByRefs.mockResolvedValueOnce([card]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getTitlesByRefs).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Fight Club")).toBeDefined();
  });
});
