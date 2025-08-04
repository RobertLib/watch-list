// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DailyContent } from "./DailyContent";

const navigation = vi.hoisted(() => ({ query: "" }));
const board = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("@/components/DailyGame", () => ({ DailyGame: board }));
vi.mock("@/components/DailyStreakPanel", () => ({ DailyStreakPanel: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  board.mockReturnValue(<p>Puzzle board</p>);
  document.title = "Daily Film Puzzle | WatchList";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("daily puzzle URL dates", () => {
  it.each([
    ["2026-09-31", "2026-10-05"],
    ["2026-08-99", "2026-10-05"],
    ["2027-02-29", "2027-03-01"],
    ["2027-02-31", "2027-03-01"],
  ])("shows a missing puzzle for %s", (day, today) => {
    navigation.query = `day=${day}`;
    vi.setSystemTime(new Date(`${today}T10:00:00.000Z`));

    render(<DailyContent />);

    expect(screen.getByRole("heading", { name: "Puzzle not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse the archive" }).getAttribute("href"))
      .toBe("/daily/archive");
    expect(board).not.toHaveBeenCalled();
    expect(document.title).toBe("Puzzle not found | WatchList");
  });

  it("opens the board for a real leap day", () => {
    navigation.query = "day=2028-02-29";
    vi.setSystemTime(new Date("2028-03-01T10:00:00.000Z"));

    render(<DailyContent />);

    expect(screen.getByText("Puzzle board")).toBeTruthy();
    expect(board.mock.calls[0][0]).toEqual({ day: "2028-02-29" });
  });
});
