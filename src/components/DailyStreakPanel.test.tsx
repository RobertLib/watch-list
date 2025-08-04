// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DAILY_GAME_STORAGE_KEY, EMPTY_STATE, saveGameState } from "@/lib/daily-game";
import { DailyStreakPanel } from "./DailyStreakPanel";

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  saveGameState({
    ...EMPTY_STATE,
    played: 1,
    won: 1,
    currentStreak: 1,
    bestStreak: 1,
    lastResultDay: "2026-10-04",
    history: { "2026-10-04": "won" },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("daily record dates", () => {
  it("advances the history window and expires a skipped streak at UTC midnight", async () => {
    vi.setSystemTime(new Date("2026-10-05T23:59:59.000Z"));
    render(<DailyStreakPanel />);
    expect(screen.getByTitle("2026-10-05 – today, not played yet")).toBeTruthy();
    expect(screen.getByText("1", { selector: "span" })).toBeTruthy();
    const rawState = window.localStorage.getItem(DAILY_GAME_STORAGE_KEY);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByTitle("2026-10-06 – today, not played yet")).toBeTruthy();
    expect(screen.getByTitle("2026-10-05 – not played")).toBeTruthy();
    expect(screen.queryByTitle("2026-10-05 – today, not played yet")).toBeNull();
    expect(screen.queryByText("1", { selector: "span" })).toBeNull();
    expect(screen.getByText("best 1")).toBeTruthy();
    expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBe(rawState);
  });

  it("updates when a suspended tab returns on a later day", () => {
    vi.setSystemTime(new Date("2026-10-05T10:00:00.000Z"));
    render(<DailyStreakPanel />);
    expect(screen.getByTitle("2026-10-05 – today, not played yet")).toBeTruthy();

    vi.setSystemTime(new Date("2026-10-07T10:00:00.000Z"));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTitle("2026-10-07 – today, not played yet")).toBeTruthy();
    expect(screen.getByTitle("2026-10-05 – not played")).toBeTruthy();
    expect(screen.queryByText("1", { selector: "span" })).toBeNull();
  });
});
