// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalendarContent } from "./CalendarContent";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";

/**
 * The release calendar, and the difference between empty and broken.
 *
 * A failed request used to be written into the calendar as `EMPTY`, which the
 * render below cannot tell from a genuinely quiet month – so somebody following
 * twenty shows was shown "Nothing on the horizon" because TMDB had not answered.
 * Every date here comes from TMDB while the list itself is in this browser, so
 * that reading is not just unhelpful, it is alarming.
 */

const { getReleaseCalendar } = vi.hoisted(() => ({
  getReleaseCalendar: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ getReleaseCalendar }));

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
        id: 1396,
        title: "Breaking Bad",
        mediaType: "tv",
        posterPath: "/poster.jpg",
        voteAverage: 8.9,
        releaseDate: "2008-01-20",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
}

async function renderCalendar() {
  await act(async () => {
    render(
      <WatchlistProvider>
        <EpisodeProgressProvider>
          <CalendarContent />
        </EpisodeProgressProvider>
      </WatchlistProvider>,
    );
  });
}

beforeEach(() => {
  window.localStorage.clear();
  getReleaseCalendar.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CalendarContent", () => {
  it("asks for nothing when nothing is followed", async () => {
    await renderCalendar();

    expect(screen.getByText("Nothing to schedule yet")).toBeDefined();
    expect(getReleaseCalendar).not.toHaveBeenCalled();
  });

  // The regression: a rejected request rendered as a quiet calendar.
  it("tells a failed load apart from an empty calendar", async () => {
    saveOneTitle();
    getReleaseCalendar.mockRejectedValue(new Error("TMDB is down"));
    await renderCalendar();

    expect(screen.getByText("Could not load your calendar")).toBeDefined();
    expect(screen.queryByText("Nothing on the horizon")).toBeNull();
  });

  it("still says the horizon is clear when it really is", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [],
      awaiting: [],
      today: "2026-09-13",
      checked: 1,
      eligible: 1,
    });
    await renderCalendar();

    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
    expect(screen.queryByText("Could not load your calendar")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  /**
   * The look-ups are capped, so a long list is checked in part. A calendar that
   * presented that part as the whole – including "Nothing on the horizon" for a
   * list it had only half read – was quietly wrong for exactly the visitors who
   * follow the most.
   */
  it("says when some of what is followed was not checked", async () => {
    saveOneTitle();
    getReleaseCalendar.mockResolvedValue({
      events: [],
      awaiting: [],
      today: "2026-09-13",
      checked: 30,
      eligible: 45,
    });
    await renderCalendar();

    expect(screen.getByRole("note").textContent).toMatch(
      /checked for 30 of the 45 titles/,
    );
  });

  it("offers a retry that asks again", async () => {
    saveOneTitle();
    getReleaseCalendar.mockRejectedValueOnce(new Error("TMDB is down"));
    await renderCalendar();

    getReleaseCalendar.mockResolvedValueOnce({
      events: [],
      awaiting: [],
      today: "2026-09-13",
      checked: 1,
      eligible: 1,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });

    expect(getReleaseCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Nothing on the horizon")).toBeDefined();
  });
});
