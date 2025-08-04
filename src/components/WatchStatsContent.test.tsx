// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { WATCHED_STORAGE_KEY } from "@/lib/watched";
import { EPISODE_PROGRESS_STORAGE_KEY } from "@/lib/episode-progress";
import { GOAL_STORAGE_KEY, MAX_GOAL, MIN_GOAL } from "@/lib/goal";
import { WatchStatsContent } from "./WatchStatsContent";

/**
 * The page that adds the record up.
 *
 * Two things here are worth pinning. The first is which titles it asks TMDB
 * about: the watched list *plus* every show with ticked episodes that was never
 * marked watched as a whole, deduplicated. That set is the input to a fan-out of
 * cached reads, and getting it wrong is either a series missing from the totals
 * or the same title fetched twice.
 *
 * The second is the goal. It is stored per calendar year, so a target set last
 * year has to read as history rather than as a bar nobody can move – and the
 * bounds are the only thing standing between a typo and a progress bar divided
 * by zero.
 */

const getWatchStatsFacts = vi.fn();

vi.mock("@/lib/api", () => ({
  getWatchStatsFacts: (...args: unknown[]) => getWatchStatsFacts(...args),
}));

vi.mock("@/components/Toast", () => ({
  toast: { showToast: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    // A next/link prop rather than a DOM attribute: React warns when one reaches
    // an <a>, and every link in this app sets it.
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const { toast } = await import("@/components/Toast");

// Local, as the page reads it: a run in Auckland on New Year's morning is in a
// different year from Greenwich, and the page has to agree with itself.
const YEAR = new Date().getFullYear().toString();

function seen(title: string, id: number, overrides = {}) {
  return {
    id,
    title,
    mediaType: "movie",
    posterPath: null,
    voteAverage: 8,
    releaseDate: "1999-10-15",
    watchedAt: `${YEAR}-02-01T00:00:00.000Z`,
    ...overrides,
  };
}

function facts(id: number, mediaType: "movie" | "tv", runtime: number | null) {
  return { id, mediaType, runtime, genres: ["Drama"], year: "1999" };
}

function seed({
  watched = [] as unknown[],
  progress = {} as Record<string, unknown>,
  goal = null as unknown,
} = {}) {
  window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watched));
  window.localStorage.setItem(
    EPISODE_PROGRESS_STORAGE_KEY,
    JSON.stringify(progress),
  );
  if (goal) window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
}

function show(tvId: number, name: string, seasons: Record<string, number[]>) {
  return {
    tvId,
    name,
    posterPath: null,
    seasons,
    updatedAt: `${YEAR}-02-01T00:00:00.000Z`,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <WatchedProvider>
      <EpisodeProgressProvider>{children}</EpisodeProgressProvider>
    </WatchedProvider>
  );
}

async function renderStats() {
  const result = render(<WatchStatsContent />, { wrapper });
  // The stores hydrate in mount effects and the runtimes are fetched after.
  await act(async () => {});
  await act(async () => {});
  return result;
}

beforeEach(() => {
  window.localStorage.clear();
  getWatchStatsFacts.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("with nothing recorded", () => {
  it("shows the empty state rather than a page of zeroes", async () => {
    seed();
    await renderStats();

    expect(screen.queryByText("Films")).toBeNull();
  });

  /**
   * The spinner keys off the same emptiness the empty state does. Without that,
   * a visitor with nothing recorded waits on a load that is never started.
   */
  it("does not wait on a lookup it never makes", async () => {
    seed();
    await renderStats();

    expect(getWatchStatsFacts).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("which titles it asks TMDB about", () => {
  it("asks about everything on the watched list", async () => {
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 949, mediaType: "movie" },
    ]);
  });

  /**
   * A series someone is part-way through was never "watched", but its episodes
   * are the bulk of the hours on this page. Leaving it out was a total that
   * disagreed with the episode count printed beside it.
   */
  it("includes a show with ticked episodes that was never marked watched", async () => {
    seed({
      watched: [seen("Fight Club", 550)],
      progress: { "1438": show(1438, "The Wire", { "1": [1, 2, 3] }) },
    });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 550, mediaType: "movie" },
      { id: 1438, mediaType: "tv" },
    ]);
  });

  it("asks once for a show that is both watched and ticked", async () => {
    seed({
      watched: [seen("The Wire", 1438, { mediaType: "tv" })],
      progress: { "1438": show(1438, "The Wire", { "1": [1, 2] }) },
    });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 1438, mediaType: "tv" },
    ]);
  });

  it("keeps a film and a show sharing an id apart", async () => {
    seed({
      watched: [seen("Both", 7), seen("Both", 7, { mediaType: "tv" })],
    });
    await renderStats();

    expect(getWatchStatsFacts).toHaveBeenCalledWith([
      { id: 7, mediaType: "movie" },
      { id: 7, mediaType: "tv" },
    ]);
  });
});

describe("the totals", () => {
  it("counts films and series apart", async () => {
    seed({
      watched: [
        seen("Fight Club", 550),
        seen("Heat", 949),
        seen("The Wire", 1438, { mediaType: "tv" }),
      ],
    });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", 139),
      "movie-949": facts(949, "movie", 170),
      "tv-1438": facts(1438, "tv", 60),
    });

    await renderStats();

    const value = (label: string) =>
      screen.getByText(label).previousElementSibling?.textContent;

    expect(value("Films")).toBe("2");
    expect(value("Series")).toBe("1");
  });

  it("counts ticked episodes", async () => {
    seed({
      progress: {
        "1438": show(1438, "The Wire", { "1": [1, 2, 3], "2": [1, 2] }),
      },
    });
    getWatchStatsFacts.mockResolvedValue({ "tv-1438": facts(1438, "tv", 60) });

    await renderStats();

    expect(
      screen.getByText("Episodes").previousElementSibling?.textContent,
    ).toBe("5");
  });

  /**
   * TMDB does not carry a runtime for everything, and a total that quietly
   * omits them reads as precise when it is a floor. Saying so is the whole
   * point of the hint.
   */
  it("says when a runtime was missing, and counts how many", async () => {
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", null),
      "movie-949": facts(949, "movie", null),
    });

    await renderStats();

    expect(screen.getByText(/2 titles had no runtime on TMDb/i)).toBeTruthy();
  });

  it("says 'title' rather than 'titles' when only one was missing", async () => {
    seed({ watched: [seen("Fight Club", 550), seen("Heat", 949)] });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", null),
      "movie-949": facts(949, "movie", 170),
    });

    await renderStats();

    expect(screen.getByText(/1 title had no runtime on TMDb/i)).toBeTruthy();
  });

  it("leaves the hint off when every runtime was known", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    getWatchStatsFacts.mockResolvedValue({
      "movie-550": facts(550, "movie", 139),
    });

    await renderStats();

    expect(screen.queryByText(/had no runtime on TMDb/i)).toBeNull();
  });

  /**
   * The runtimes are an enrichment, not the record. A TMDB outage should cost
   * the watch time and nothing else.
   */
  it("still shows the counts when the lookup failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getWatchStatsFacts.mockRejectedValue(new Error("TMDB is down"));
    seed({ watched: [seen("Fight Club", 550)] });

    await renderStats();

    expect(screen.getByText("Films").previousElementSibling?.textContent).toBe(
      "1",
    );
  });
});

describe("the yearly goal", () => {
  it("offers to set one when there is none", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    expect(screen.getByText(`Set a target for ${YEAR}`)).toBeTruthy();
  });

  it("saves a target that is in range", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(`Titles to watch in ${YEAR}`), {
        target: { value: "40" },
      });
      fireEvent.click(screen.getByRole("button", { name: /set goal/i }));
    });

    expect(JSON.parse(window.localStorage.getItem(GOAL_STORAGE_KEY) ?? "{}")).toEqual(
      { year: YEAR, target: 40 },
    );
  });

  /**
   * The bounds are declared on the input itself, which is the first line: the
   * browser refuses to submit a number outside them and the handler below is
   * never reached. Worth pinning because it is why the handler's own check looks
   * untested – remove these attributes and the only thing left is the backstop.
   */
  it("declares the bounds on the field, so the browser enforces them too", async () => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    const field = screen.getByLabelText(`Titles to watch in ${YEAR}`);
    expect(field.getAttribute("min")).toBe(String(MIN_GOAL));
    expect(field.getAttribute("max")).toBe(String(MAX_GOAL));
  });

  /**
   * And the backstop, exercised the way anything that gets past the attributes
   * would arrive: a submit that did not come from clicking the button, which is
   * what a scripted submit or a browser skipping constraint validation looks
   * like. Without this the only thing between a typo and a progress bar divided
   * by a target of zero is markup.
   */
  it.each([
    ["zero", String(MIN_GOAL - 1)],
    ["past the cap", String(MAX_GOAL + 1)],
    ["not a whole number", "12.5"],
    ["empty", ""],
  ])("refuses a target that is %s even when the field did not stop it", async (
    _label,
    value,
  ) => {
    seed({ watched: [seen("Fight Club", 550)] });
    await renderStats();

    const field = screen.getByLabelText(`Titles to watch in ${YEAR}`);
    await act(async () => {
      fireEvent.change(field, { target: { value } });
      fireEvent.submit(field.closest("form")!);
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      `Pick a number between ${MIN_GOAL} and ${MAX_GOAL}`,
      "error",
    );
    expect(window.localStorage.getItem(GOAL_STORAGE_KEY)).toBeNull();
  });

  /**
   * A target belongs to a calendar year. Last year's is history, and showing it
   * as a live bar is a number that can never be moved again.
   */
  it("asks for a new target when the stored one is last year's", async () => {
    seed({
      watched: [seen("Fight Club", 550)],
      goal: { year: String(Number(YEAR) - 1), target: 52 },
    });
    await renderStats();

    expect(screen.getByText(`Set a target for ${YEAR}`)).toBeTruthy();
  });

  it("shows this year's target as a live one", async () => {
    seed({
      watched: [seen("Fight Club", 550)],
      goal: { year: YEAR, target: 52 },
    });
    await renderStats();

    expect(screen.queryByText(`Set a target for ${YEAR}`)).toBeNull();
  });
});
