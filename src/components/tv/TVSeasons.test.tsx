// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { TVSeasons } from "./TVSeasons";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import type { Season, SeasonDetails } from "@/types/tmdb";

/**
 * Expanding a season, and what happens when that fails.
 *
 * The episodes are the one thing on a series page that is not fetched with the
 * rest of it – a show with twelve seasons would otherwise pull twelve episode
 * lists nobody asked for – so each row loads its own on first open. Which means
 * each row also owns a failure, a retry, and the state in between.
 */

const { fetchSeasonDetails } = vi.hoisted(() => ({
  fetchSeasonDetails: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ fetchSeasonDetails }));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

function season(over: Partial<Season> = {}): Season {
  return {
    id: 1,
    name: "Season 1",
    season_number: 1,
    episode_count: 2,
    air_date: "2008-01-20",
    overview: "",
    poster_path: null,
    vote_average: 0,
    ...over,
  };
}

function details(): SeasonDetails {
  return {
    id: 1,
    name: "Season 1",
    season_number: 1,
    air_date: "2008-01-20",
    overview: "",
    poster_path: null,
    episodes: [
      {
        id: 101,
        name: "Pilot",
        overview: "",
        episode_number: 1,
        season_number: 1,
        air_date: "2008-01-20",
        still_path: null,
        vote_average: 0,
        runtime: 58,
      },
    ],
  } as SeasonDetails;
}

function renderSeasons() {
  return render(
    <EpisodeProgressProvider>
      <TVSeasons
        seasons={[season()]}
        tvId={1396}
        showName="Breaking Bad"
        posterPath={null}
      />
    </EpisodeProgressProvider>,
  );
}

/** Open or close the season, and let the transition it starts settle. */
async function clickHeader() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Season 1/ }));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  fetchSeasonDetails.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TVSeasons", () => {
  it("loads the episodes when a season is opened", async () => {
    fetchSeasonDetails.mockResolvedValue(details());
    renderSeasons();

    await clickHeader();

    expect(screen.getByText("Pilot")).toBeDefined();
    expect(fetchSeasonDetails).toHaveBeenCalledWith(1396, 1);
  });

  it("says so when the episodes could not be loaded", async () => {
    // `fetchSeasonDetails` answers null rather than throwing, so this is the
    // only signal the row gets.
    fetchSeasonDetails.mockResolvedValue(null);
    renderSeasons();

    await clickHeader();

    expect(screen.getByText("Failed to load episodes.")).toBeDefined();
  });

  /**
   * The bug: the flag was set on failure and never cleared. Re-opening the
   * season does retry – `details` is still null – so a load that went through on
   * the second attempt rendered its episodes *underneath* a "Failed to load
   * episodes." that had no way of ever leaving the page.
   */
  it("clears the failure once a retry succeeds", async () => {
    fetchSeasonDetails.mockResolvedValueOnce(null);
    renderSeasons();

    await clickHeader();
    expect(screen.getByText("Failed to load episodes.")).toBeDefined();

    // Collapse, then open again – which is what triggers the second attempt.
    await clickHeader();
    fetchSeasonDetails.mockResolvedValueOnce(details());
    await clickHeader();

    expect(screen.getByText("Pilot")).toBeDefined();
    expect(screen.queryByText("Failed to load episodes.")).toBeNull();
  });
});
