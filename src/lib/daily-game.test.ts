import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  buildShareText,
  effectiveStreak,
  recordGuess,
  recordResult,
  sanitizeGameState,
  stateForDay,
  type DailyGameState,
} from "./daily-game";
import { MAX_GUESSES } from "./daily-puzzle";

const DAY = "2026-08-01";
const NEXT_DAY = "2026-08-02";

const wrong = (id: number) => ({ id, title: `Film ${id}`, correct: false });
const right = (id: number) => ({ id, title: `Film ${id}`, correct: true });

function playing(overrides: Partial<DailyGameState> = {}): DailyGameState {
  return { ...EMPTY_STATE, ...overrides };
}

describe("sanitizeGameState", () => {
  it("round-trips a real state", () => {
    const state = playing({
      lastResultDay: DAY,
      currentStreak: 3,
      bestStreak: 5,
      played: 10,
      won: 8,
      today: { day: DAY, guesses: [wrong(1), right(2)], status: "won" },
    });

    expect(sanitizeGameState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("falls back to an empty state for anything unreadable", () => {
    expect(sanitizeGameState(undefined)).toEqual(EMPTY_STATE);
    expect(sanitizeGameState("{}")).toEqual(EMPTY_STATE);
    expect(sanitizeGameState([])).toEqual(EMPTY_STATE);
  });

  it("repairs the parts it can rather than discarding a streak", () => {
    const repaired = sanitizeGameState({
      lastResultDay: "yesterday",
      currentStreak: 4,
      bestStreak: -2,
      played: "ten",
      distribution: "nope",
      today: { day: "whenever", guesses: [wrong(1)] },
    });

    // The streak survives; only the values that made no sense are reset.
    expect(repaired.currentStreak).toBe(4);
    expect(repaired.lastResultDay).toBe("");
    expect(repaired.bestStreak).toBe(0);
    expect(repaired.played).toBe(0);
    expect(repaired.distribution).toHaveLength(MAX_GUESSES);
    expect(repaired.today).toBeNull();
  });

  it("drops guesses without a usable id and bounds their number", () => {
    const repaired = sanitizeGameState({
      today: {
        day: DAY,
        guesses: [
          { id: 1, title: "Kept", correct: true },
          { id: 0, title: "Dropped" },
          { id: "2", title: "Dropped" },
          ...Array.from({ length: 50 }, (_, i) => ({ id: i + 10, title: "x" })),
        ],
        status: "playing",
      },
    });

    expect(repaired.today?.guesses).toHaveLength(MAX_GUESSES);
    expect(repaired.today?.guesses[0]).toEqual({
      id: 1,
      title: "Kept",
      correct: true,
    });
  });
});

describe("stateForDay", () => {
  it("opens a fresh board for a new day", () => {
    const state = stateForDay(EMPTY_STATE, DAY);

    expect(state.today).toEqual({ day: DAY, guesses: [], status: "playing" });
  });

  it("leaves today's board alone", () => {
    const started = stateForDay(EMPTY_STATE, DAY);
    const again = stateForDay(started, DAY);

    expect(again).toBe(started);
  });

  it("discards yesterday's board but keeps the totals", () => {
    const yesterday = playing({
      currentStreak: 3,
      played: 5,
      today: { day: DAY, guesses: [right(1)], status: "won" },
    });

    const today = stateForDay(yesterday, NEXT_DAY);

    expect(today.today?.guesses).toEqual([]);
    expect(today.currentStreak).toBe(3);
    expect(today.played).toBe(5);
  });
});

describe("recordGuess", () => {
  it("records a wrong guess and keeps the board open", () => {
    const state = recordGuess(EMPTY_STATE, DAY, wrong(1));

    expect(state.today?.guesses).toEqual([wrong(1)]);
    expect(state.today?.status).toBe("playing");
    expect(state.played).toBe(0);
  });

  it("wins the day on a correct guess and counts it", () => {
    let state = recordGuess(EMPTY_STATE, DAY, wrong(1));
    state = recordGuess(state, DAY, right(2));

    expect(state.today?.status).toBe("won");
    expect(state.played).toBe(1);
    expect(state.won).toBe(1);
    expect(state.currentStreak).toBe(1);
    // Won on the second guess.
    expect(state.distribution[1]).toBe(1);
  });

  it("loses the day once the guesses run out", () => {
    let state: DailyGameState = EMPTY_STATE;
    for (let i = 1; i <= MAX_GUESSES; i++) state = recordGuess(state, DAY, wrong(i));

    expect(state.today?.status).toBe("lost");
    expect(state.played).toBe(1);
    expect(state.won).toBe(0);
    expect(state.currentStreak).toBe(0);
    expect(state.distribution.every((count) => count === 0)).toBe(true);
  });

  it("ignores a guess once the day is decided", () => {
    let state = recordGuess(EMPTY_STATE, DAY, right(1));
    state = recordGuess(state, DAY, wrong(2));

    expect(state.today?.guesses).toHaveLength(1);
    expect(state.won).toBe(1);
  });

  it("does not charge a life for repeating a guess", () => {
    let state = recordGuess(EMPTY_STATE, DAY, wrong(1));
    state = recordGuess(state, DAY, wrong(1));

    expect(state.today?.guesses).toHaveLength(1);
  });

  it("starts a new board when the day rolls over mid-session", () => {
    const yesterday = recordGuess(EMPTY_STATE, DAY, wrong(1));
    const today = recordGuess(yesterday, NEXT_DAY, wrong(1));

    expect(today.today?.day).toBe(NEXT_DAY);
    expect(today.today?.guesses).toEqual([wrong(1)]);
  });
});

describe("recordResult", () => {
  it("extends a streak across consecutive days", () => {
    const state = recordResult(
      playing({ lastResultDay: DAY, currentStreak: 3, bestStreak: 3 }),
      NEXT_DAY,
      true,
      2,
    );

    expect(state.currentStreak).toBe(4);
    expect(state.bestStreak).toBe(4);
  });

  it("restarts the streak at one after a skipped day", () => {
    const state = recordResult(
      playing({ lastResultDay: DAY, currentStreak: 9, bestStreak: 9 }),
      "2026-08-05",
      true,
      1,
    );

    expect(state.currentStreak).toBe(1);
    // The best is a record, so it survives the run being broken.
    expect(state.bestStreak).toBe(9);
  });

  it("ends the streak on a loss even when the day was played", () => {
    const state = recordResult(
      playing({ lastResultDay: DAY, currentStreak: 4, bestStreak: 6 }),
      NEXT_DAY,
      false,
      MAX_GUESSES,
    );

    expect(state.currentStreak).toBe(0);
    expect(state.bestStreak).toBe(6);
    expect(state.played).toBe(1);
  });

  it("counts the very first day as a streak of one", () => {
    expect(recordResult(EMPTY_STATE, DAY, true, 1).currentStreak).toBe(1);
  });

  it("refuses to record the same day twice", () => {
    const once = recordResult(EMPTY_STATE, DAY, true, 1);
    const twice = recordResult(once, DAY, true, 1);

    // A reload must not inflate the totals.
    expect(twice).toBe(once);
    expect(twice.played).toBe(1);
  });

  it("ignores a guess count outside the board", () => {
    const state = recordResult(EMPTY_STATE, DAY, true, 99);

    expect(state.won).toBe(1);
    expect(state.distribution.every((count) => count === 0)).toBe(true);
  });
});

describe("effectiveStreak", () => {
  it("keeps a run alive on the day it was last played", () => {
    expect(
      effectiveStreak(playing({ lastResultDay: DAY, currentStreak: 5 }), DAY),
    ).toBe(5);
  });

  it("keeps a run alive the day after, which is still playable", () => {
    expect(
      effectiveStreak(
        playing({ lastResultDay: DAY, currentStreak: 5 }),
        NEXT_DAY,
      ),
    ).toBe(5);
  });

  it("reports a run as over once a day was missed", () => {
    // Nothing runs overnight to notice this, so the stored streak goes stale and
    // must not be shown as though it were still going.
    expect(
      effectiveStreak(
        playing({ lastResultDay: DAY, currentStreak: 5 }),
        "2026-08-04",
      ),
    ).toBe(0);
  });

  it("reports zero when there is no run to speak of", () => {
    expect(effectiveStreak(EMPTY_STATE, DAY)).toBe(0);
    expect(
      effectiveStreak(playing({ lastResultDay: "", currentStreak: 3 }), DAY),
    ).toBe(0);
  });
});

describe("buildShareText", () => {
  it("shows the score as a grid and gives nothing away", () => {
    const text = buildShareText(
      12,
      [wrong(1), wrong(2), right(3)],
      "won",
      "https://www.watch-list.me/daily",
    );

    expect(text).toBe(
      "🎬 WatchList Daily #12 3/6\n🟥🟥🟩\nhttps://www.watch-list.me/daily",
    );
    expect(text).not.toContain("Film 3");
  });

  it("marks a lost day with an X", () => {
    const text = buildShareText(12, [wrong(1)], "lost", "https://x.test");

    expect(text).toContain("#12 X/6");
  });
});
