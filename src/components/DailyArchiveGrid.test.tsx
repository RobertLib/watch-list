// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { EMPTY_STATE, saveGameState, type DailyGameState } from "@/lib/daily-game";
import { puzzleNumberForDay } from "@/lib/daily-puzzle";
import { DailyArchiveGrid } from "./DailyArchiveGrid";

/**
 * The archive grid is a reading of the stored record, one card per day. What is
 * worth pinning is that each card tells the truth about its day – a catch-up
 * that ran out of guesses used to wear the same tick as one that was solved, and
 * a live board left unfinished at midnight was shown as never played.
 */

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const TODAY = "2026-10-10";

const wrong = (id: number) => ({ id, title: `Film ${id}`, correct: false });

async function renderWith(state: Partial<DailyGameState>) {
  saveGameState({ ...EMPTY_STATE, ...state });
  render(<DailyArchiveGrid />);
  await act(async () => {});
}

/** The card for a day, found by its puzzle number. */
function card(day: string): HTMLElement {
  return screen.getByText(`#${puzzleNumberForDay(day)}`).closest("a")!;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00.000Z`));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("archive cards", () => {
  it("tells a lost catch-up apart from a solved one", async () => {
    await renderWith({
      archive: {
        "2026-10-01": { day: "2026-10-01", guesses: [{ ...wrong(1), correct: true }], status: "won" },
        "2026-10-02": {
          day: "2026-10-02",
          guesses: [1, 2, 3, 4, 5, 6].map(wrong),
          status: "lost",
        },
      },
      archiveWonDays: ["2026-10-01"],
    });

    expect(card("2026-10-01").textContent).toContain("2026-10-01 · Caught up");
    expect(card("2026-10-02").textContent).toContain("2026-10-02 · Caught up, not solved");
  });

  it("says a live board the day ended on is in progress, not unplayed", async () => {
    await renderWith({
      today: { day: "2026-10-09", guesses: [wrong(1), wrong(2)], status: "playing" },
    });

    expect(card("2026-10-09").textContent).toContain("2026-10-09 · In progress");
    expect(card("2026-10-09").getAttribute("href")).toContain("2026-10-09");
  });

  it("shows a day played on the day as its result", async () => {
    await renderWith({ history: { "2026-10-08": "won", "2026-10-07": "lost" } });

    expect(card("2026-10-08").textContent).toContain("Solved");
    expect(card("2026-10-07").textContent).toContain("Not solved");
  });
});

/**
 * "Every puzzle that has run" is what the page promises. The grid used to stop
 * four months back, so from puzzle #121 on the oldest days quietly fell off.
 */
describe("the whole archive", () => {
  it("lists every puzzle back to the first, grouped by month, newest first", async () => {
    vi.setSystemTime(new Date("2027-03-01T12:00:00.000Z"));
    await renderWith({});

    const total = puzzleNumberForDay("2027-03-01");
    expect(total).toBeGreaterThan(120);
    expect(screen.getByText(`${total} puzzles so far`, { exact: false })).toBeTruthy();
    // The very first puzzle is still there, and still playable.
    expect(card("2026-08-01").getAttribute("href")).toContain("2026-08-01");

    const months = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(months).toEqual([
      "March 2027",
      "February 2027",
      "January 2027",
      "December 2026",
      "November 2026",
      "October 2026",
      "September 2026",
      "August 2026",
    ]);
    // Every day of a month sits under that month's heading.
    const august = screen.getByRole("heading", { name: "August 2026" }).closest("section")!;
    expect(august.querySelectorAll("li")).toHaveLength(31);
  });

  it("still shows a lost catch-up as lost after its board was pruned", async () => {
    await renderWith({ archiveLostDays: ["2026-08-03"] });

    expect(card("2026-08-03").textContent).toContain("Caught up, not solved");
  });
});
