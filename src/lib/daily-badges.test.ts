import { describe, expect, it } from "vitest";
import { TOTAL_BADGES, badgesFor } from "./daily-badges";
import { EMPTY_STATE, type DailyGameState } from "./daily-game";
import { MAX_GUESSES } from "./daily-puzzle";

function stateWith(overrides: Partial<DailyGameState>): DailyGameState {
  return { ...EMPTY_STATE, ...overrides };
}

function byId(state: DailyGameState, id: string) {
  const found = badgesFor(state).find((badge) => badge.id === id);
  if (!found) throw new Error(`No badge called ${id}`);
  return found;
}

/** A distribution with one win recorded at `index` guesses. */
function winAt(index: number): number[] {
  const distribution = Array.from({ length: MAX_GUESSES }, () => 0);
  distribution[index] = 1;
  return distribution;
}

describe("badgesFor", () => {
  it("returns every badge unearned for a player who has never played", () => {
    const badges = badgesFor(EMPTY_STATE);

    expect(badges).toHaveLength(TOTAL_BADGES);
    expect(badges.filter((badge) => badge.earned)).toHaveLength(0);
  });

  it("omits progress for the pass/fail badges and gives it to the counts", () => {
    // A one-target badge has nothing to show a bar for – "0 of 1" is noise.
    expect(byId(EMPTY_STATE, "first-win").progress).toBeUndefined();
    expect(byId(EMPTY_STATE, "streak-3").progress).toEqual({
      current: 0,
      target: 3,
    });
  });

  it("reads the streak badges off the best streak, not the current one", () => {
    // A broken streak still earned the badge – that is the point of recording a
    // best at all.
    const state = stateWith({ currentStreak: 0, bestStreak: 7 });

    expect(byId(state, "streak-3").earned).toBe(true);
    expect(byId(state, "streak-7").earned).toBe(true);
    expect(byId(state, "streak-30").earned).toBe(false);
  });

  it("earns the sniper on a first-guess win only", () => {
    expect(byId(stateWith({ distribution: winAt(0) }), "sniper").earned).toBe(
      true,
    );
    expect(byId(stateWith({ distribution: winAt(1) }), "sniper").earned).toBe(
      false,
    );
  });

  it("earns the clutch badge on a win with the last guess", () => {
    const lastGuess = stateWith({ distribution: winAt(MAX_GUESSES - 1) });

    expect(byId(lastGuess, "clutch").earned).toBe(true);
    expect(byId(stateWith({ distribution: winAt(0) }), "clutch").earned).toBe(
      false,
    );
  });

  it("survives a distribution shorter than the guess limit", () => {
    // Storage is hand-editable and outlives the shape that wrote it, so the
    // measures index into it defensively.
    const state = stateWith({ distribution: [] });

    expect(byId(state, "sniper").earned).toBe(false);
    expect(byId(state, "clutch").earned).toBe(false);
  });

  it("counts only solved archive boards towards the archivist", () => {
    const board = (status: "won" | "lost") => ({
      day: "2026-01-01",
      guesses: [],
      status,
      movieId: 1,
    });

    const state = stateWith({
      archive: {
        a: board("won"),
        b: board("won"),
        c: board("lost"),
      } as DailyGameState["archive"],
    });

    expect(byId(state, "archivist").progress).toEqual({
      current: 2,
      target: 5,
    });
  });

  it("counts the badges a player has actually earned", () => {
    const state = stateWith({ won: 1, played: 10, bestStreak: 3 });

    const earned = badgesFor(state)
      .filter((badge) => badge.earned)
      .map((badge) => badge.id);

    expect(earned).toEqual(["first-win", "streak-3", "played-10"]);
  });

  it("gives every badge a distinct id", () => {
    const ids = badgesFor(EMPTY_STATE).map((badge) => badge.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
