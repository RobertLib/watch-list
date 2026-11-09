import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  archiveBoardFor,
  archiveSolvedCount,
  buildShareText,
  effectiveStreak,
  outcomeForDay,
  playedOnTheDay,
  recordArchiveGuess,
  recordGuess,
  recordResult,
  sanitizeGameState,
  stateForDay,
  type DailyGameState,
} from "./daily-game";
import { MAX_GUESSES } from "./daily-puzzle";
import { shiftDate } from "./dates";

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

  it("discards nonexistent calendar dates when restoring boards and results", () => {
    const repaired = sanitizeGameState({
      lastResultDay: "2026-09-31",
      today: { day: "2026-09-31", guesses: [right(1)], status: "won" },
      history: { [DAY]: "won", "2026-09-31": "won", "2027-02-29": "lost" },
      archive: {
        [NEXT_DAY]: { day: NEXT_DAY, guesses: [right(1)], status: "won" },
        "2026-09-31": { day: "2026-09-31", guesses: [right(1)], status: "won" },
      },
    });

    expect(repaired.lastResultDay).toBe("");
    expect(repaired.today).toBeNull();
    expect(repaired.history).toEqual({ [DAY]: "won" });
    expect(Object.keys(repaired.archive)).toEqual([NEXT_DAY]);
    expect(repaired.archiveWonDays).toEqual([NEXT_DAY]);
  });

  /**
   * The archive used to reopen a day already played live as a fresh board, so a
   * store can hold "catch-up wins" for days that were never missed. They must
   * not keep counting towards the archive badge once the replay is closed off.
   */
  it("drops archive wins recorded for days that were played on the day", () => {
    const repaired = sanitizeGameState({
      history: { [DAY]: "won", [NEXT_DAY]: "lost" },
      archive: {
        [DAY]: { day: DAY, guesses: [right(1)], status: "won" },
        [NEXT_DAY]: { day: NEXT_DAY, guesses: [right(1)], status: "won" },
      },
      archiveWonDays: [DAY, NEXT_DAY, "2026-07-20"],
    });

    expect(repaired.archiveWonDays).toEqual(["2026-07-20"]);
    expect(archiveSolvedCount(repaired)).toBe(1);
  });

  it("migrates legacy archive wins before pruning boards and deduplicates valid win dates", () => {
    const archive = Object.fromEntries(Array.from({ length: 95 }, (_, index) => {
      const day = shiftDate(DAY, index);
      return [day, { day, guesses: [right(1)], status: "won" }];
    }));

    const repaired = sanitizeGameState({
      archive,
      archiveWonDays: [DAY, DAY, "2026-09-31", "2026-13-01", "not-a-day", null],
    });

    expect(Object.keys(repaired.archive)).toHaveLength(90);
    expect(repaired.archive[DAY]).toBeUndefined();
    expect(repaired.archiveWonDays).toHaveLength(95);
    expect(repaired.archiveWonDays[0]).toBe(DAY);
    expect(archiveSolvedCount(repaired)).toBe(95);
    expect(sanitizeGameState(JSON.parse(JSON.stringify(repaired)))).toEqual(repaired);
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

describe("invalid game dates", () => {
  it.each(["2026-09-31", "2026-08-99", "2027-02-29"])(
    "does not create boards or record results for %s",
    (day) => {
      const state = recordGuess(EMPTY_STATE, DAY, wrong(1));

      expect(stateForDay(state, day)).toBe(state);
      expect(recordGuess(state, day, right(2))).toBe(state);
      expect(recordResult(state, day, true, 1)).toBe(state);
      expect(recordArchiveGuess(state, day, right(2))).toBe(state);
    },
  );
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

  it("discards yesterday's finished board but keeps the totals", () => {
    const yesterday = playing({
      currentStreak: 3,
      played: 5,
      today: { day: DAY, guesses: [right(1)], status: "won" },
    });

    const today = stateForDay(yesterday, NEXT_DAY);

    expect(today.today?.guesses).toEqual([]);
    expect(today.currentStreak).toBe(3);
    expect(today.played).toBe(5);
    // Its result lives in `history`; a finished board has nothing to continue.
    expect(today.archive).toEqual({});
  });

  /**
   * A board left halfway at UTC midnight used to be thrown away by the next
   * day's first guess, and the archive then offered that day as never played:
   * six fresh guesses and the clues earned so far handed out again.
   */
  it("carries an unfinished board into the archive, guesses and all", () => {
    const yesterday = playing({
      currentStreak: 2,
      today: { day: DAY, guesses: [wrong(1), wrong(2)], status: "playing" },
    });

    const today = stateForDay(yesterday, NEXT_DAY);

    expect(today.today).toEqual({ day: NEXT_DAY, guesses: [], status: "playing" });
    expect(today.archive[DAY]).toEqual({
      day: DAY,
      guesses: [wrong(1), wrong(2)],
      status: "playing",
    });
    // Carried over, not finished: no result, no streak, no totals.
    expect(today.history).toEqual({});
    expect(today.currentStreak).toBe(2);
    expect(today.played).toBe(0);
  });

  it("does not carry a board nobody guessed on", () => {
    const yesterday = playing({
      today: { day: DAY, guesses: [], status: "playing" },
    });

    expect(stateForDay(yesterday, NEXT_DAY).archive).toEqual({});
  });

  it("keeps an archive board already continued past the live one", () => {
    const continued = {
      day: DAY,
      guesses: [wrong(1), wrong(2), wrong(3)],
      status: "playing" as const,
    };
    const yesterday = playing({
      today: { day: DAY, guesses: [wrong(1)], status: "playing" },
      archive: { [DAY]: continued },
    });

    expect(stateForDay(yesterday, NEXT_DAY).archive[DAY]).toEqual(continued);
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
    // Yesterday's unfinished board is not lost with it.
    expect(today.archive[DAY]?.guesses).toEqual([wrong(1)]);
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

describe("history", () => {
  it("records how each finished day went", () => {
    const state = recordResult(playing(), DAY, true, 3);

    expect(state.history).toEqual({ [DAY]: "won" });
  });

  it("records a loss as a loss, not as an absence", () => {
    expect(recordResult(playing(), DAY, false, 6).history[DAY]).toBe("lost");
  });

  it("keeps earlier days as the run goes on", () => {
    const first = recordResult(playing(), DAY, true, 2);
    const second = recordResult(first, NEXT_DAY, false, 6);

    expect(second.history).toEqual({ [DAY]: "won", [NEXT_DAY]: "lost" });
  });

  it("survives a stored state written before history existed", () => {
    const legacy = sanitizeGameState({ played: 4, won: 2 });

    expect(legacy.history).toEqual({});
    expect(legacy.archive).toEqual({});
    expect(legacy.played).toBe(4);
  });

  it("drops entries that are not a finished result", () => {
    const state = sanitizeGameState({
      history: { [DAY]: "playing", "not-a-day": "won", [NEXT_DAY]: "won" },
    });

    expect(state.history).toEqual({ [NEXT_DAY]: "won" });
  });
});

describe("the archive", () => {
  const OLD_DAY = "2026-07-20";

  it("hands back a fresh board for a day never opened", () => {
    expect(archiveBoardFor(playing(), OLD_DAY)).toEqual({
      day: OLD_DAY,
      guesses: [],
      status: "playing",
    });
  });

  it("records a guess against the day it was made", () => {
    const state = recordArchiveGuess(playing(), OLD_DAY, wrong(1));

    expect(state.archive[OLD_DAY].guesses).toHaveLength(1);
    expect(state.archive[OLD_DAY].status).toBe("playing");
  });

  it("finishes the board on a correct guess", () => {
    const state = recordArchiveGuess(playing(), OLD_DAY, right(1));

    expect(state.archive[OLD_DAY].status).toBe("won");
  });

  it("loses the board once the guesses run out", () => {
    let state = playing();
    for (let id = 1; id <= MAX_GUESSES; id++) {
      state = recordArchiveGuess(state, OLD_DAY, wrong(id));
    }

    expect(state.archive[OLD_DAY].status).toBe("lost");
  });

  it("never touches the streak or the totals", () => {
    const before = playing({ currentStreak: 4, played: 9, won: 7 });
    const after = recordArchiveGuess(before, OLD_DAY, right(1));

    expect(after.currentStreak).toBe(4);
    expect(after.played).toBe(9);
    expect(after.won).toBe(7);
    expect(after.distribution).toEqual(before.distribution);
    expect(after.history).toEqual({});
  });

  it("leaves a board in progress for today alone", () => {
    const before = playing({
      today: { day: DAY, guesses: [wrong(1)], status: "playing" },
    });

    expect(recordArchiveGuess(before, OLD_DAY, wrong(2)).today).toEqual(
      before.today,
    );
  });

  it("takes no further guesses once the board is finished", () => {
    const won = recordArchiveGuess(playing(), OLD_DAY, right(1));
    const after = recordArchiveGuess(won, OLD_DAY, wrong(2));

    expect(after.archive[OLD_DAY].guesses).toHaveLength(1);
  });

  it("does not let the same wrong guess cost two lives", () => {
    const once = recordArchiveGuess(playing(), OLD_DAY, wrong(1));
    const twice = recordArchiveGuess(once, OLD_DAY, wrong(1));

    expect(twice.archive[OLD_DAY].guesses).toHaveLength(1);
  });

  it("counts only the archived days that were solved", () => {
    let state = recordArchiveGuess(playing(), OLD_DAY, right(1));
    state = recordArchiveGuess(state, "2026-07-21", wrong(1));

    expect(archiveSolvedCount(state)).toBe(1);
  });

  it("preserves wins after pruning and does not count replaying the same day twice", () => {
    let state = recordArchiveGuess(playing(), DAY, right(1));
    for (let index = 1; index <= 90; index++) {
      state = recordArchiveGuess(state, shiftDate(DAY, index), wrong(1));
    }

    expect(state.archive[DAY]).toBeUndefined();
    expect(state.archiveWonDays).toEqual([DAY]);
    expect(archiveSolvedCount(state)).toBe(1);
    expect(outcomeForDay(state, DAY, shiftDate(DAY, 100))).toBe("archive-won");

    const replayed = recordArchiveGuess(state, DAY, right(1));
    expect(archiveSolvedCount(replayed)).toBe(1);
    expect(replayed.archiveWonDays).toEqual([DAY]);
  });
});

describe("outcomeForDay", () => {
  it("reports a day played on the day from the history", () => {
    const state = recordResult(playing(), DAY, true, 2);

    expect(outcomeForDay(state, DAY, NEXT_DAY)).toBe("won");
  });

  it("tells a day caught up later apart from one played on time", () => {
    const state = recordArchiveGuess(playing(), DAY, right(1));

    expect(outcomeForDay(state, DAY, NEXT_DAY)).toBe("archive-won");
  });

  /** A lost catch-up used to come back as "archived" – drawn with a tick. */
  it("tells a lost catch-up apart from a solved one", () => {
    let state = playing();
    for (let id = 1; id <= MAX_GUESSES; id++) {
      state = recordArchiveGuess(state, DAY, wrong(id));
    }

    expect(state.archive[DAY].status).toBe("lost");
    expect(outcomeForDay(state, DAY, NEXT_DAY)).toBe("archive-lost");
    expect(archiveSolvedCount(state)).toBe(0);
  });

  it("leaves an unfinished archive board as missed", () => {
    const state = recordArchiveGuess(playing(), DAY, wrong(1));

    expect(outcomeForDay(state, DAY, NEXT_DAY)).toBe("missed");
  });

  it("marks today as today rather than as missed", () => {
    expect(outcomeForDay(playing(), DAY, DAY)).toBe("today");
  });

  it("prefers the real result over an archive board for the same day", () => {
    // Written by a version that still let the archive replay a live day.
    const played = recordResult(playing(), DAY, false, 6);
    const alsoArchived = {
      ...played,
      archive: { [DAY]: { day: DAY, guesses: [right(1)], status: "won" as const } },
      archiveWonDays: [DAY],
    };

    expect(outcomeForDay(alsoArchived, DAY, NEXT_DAY)).toBe("lost");
  });
});

describe("buildShareText, from the archive", () => {
  it("says so, so it cannot be mistaken for today's result", () => {
    const text = buildShareText(3, [right(1)], "won", "https://x.test", true);

    expect(text).toContain("#3 (archive) 1/6");
  });
});

/**
 * A day that has a result from the day itself is finished business. The archive
 * links every past day to `?day=`, and it used to open a fresh board whenever
 * it had none of its own – so five days won live could be won again for the
 * Archivist badge, and a day lost live could be replayed for a second chance.
 */
describe("a day played on the day, seen from the archive", () => {
  it.each(["won", "lost"] as const)("comes back finished as %s rather than as a fresh board", (result) => {
    const state = recordResult(playing(), DAY, result === "won", 3);

    expect(archiveBoardFor(state, DAY)).toEqual({ day: DAY, guesses: [], status: result });
    expect(playedOnTheDay(state, DAY)).toBe(true);
  });

  it("keeps its guesses while the live board still holds them", () => {
    let state = recordGuess(EMPTY_STATE, DAY, wrong(1));
    state = recordGuess(state, DAY, right(2));

    expect(archiveBoardFor(state, DAY)).toEqual({
      day: DAY,
      guesses: [wrong(1), right(2)],
      status: "won",
    });
  });

  it.each(["won", "lost"] as const)("takes no guesses after being %s live", (result) => {
    const state = recordResult(playing(), DAY, result === "won", 6);

    expect(recordArchiveGuess(state, DAY, right(1))).toBe(state);
    expect(recordArchiveGuess(state, DAY, wrong(1))).toBe(state);
  });

  it("never counts towards the archive badge", () => {
    let state = playing();
    for (let index = 0; index < 5; index++) {
      const day = shiftDate(DAY, index);
      state = recordResult(state, day, true, 1);
      state = recordArchiveGuess(state, day, right(1));
    }

    expect(archiveSolvedCount(state)).toBe(0);
    expect(state.archive).toEqual({});
  });

  it("ignores inflated catch-up wins already in storage", () => {
    const state = playing({
      history: { [DAY]: "won", [NEXT_DAY]: "won" },
      archiveWonDays: [DAY, NEXT_DAY, "2026-07-20"],
    });

    expect(archiveSolvedCount(state)).toBe(1);
  });
});

/**
 * The cap on stored boards evicts the oldest – and it used to evict the board
 * being written whenever that day was older than all ninety kept. Every wrong
 * guess was saved and pruned in the same write, so the puzzle never ran out of
 * lives.
 */
describe("an old archive board behind ninety newer ones", () => {
  const OLD = "2026-07-01";

  function withNinetyNewerBoards(): DailyGameState {
    let state = playing();
    for (let index = 0; index < 90; index++) {
      state = recordArchiveGuess(state, shiftDate("2026-08-01", index), wrong(1));
    }
    return state;
  }

  it("keeps its guesses, and loses after six like any other board", () => {
    let state = withNinetyNewerBoards();

    for (let id = 1; id <= MAX_GUESSES; id++) {
      state = recordArchiveGuess(state, OLD, wrong(id));
      expect(state.archive[OLD]?.guesses).toHaveLength(id);
      // And it survives being read back from storage.
      state = sanitizeGameState(JSON.parse(JSON.stringify(state)));
      expect(state.archive[OLD]?.guesses).toHaveLength(id);
    }

    expect(state.archive[OLD].status).toBe("lost");
    expect(recordArchiveGuess(state, OLD, right(99))).toBe(state);
  });

  it("evicts the oldest other board instead and stays at the cap", () => {
    const before = withNinetyNewerBoards();
    const after = recordArchiveGuess(before, OLD, wrong(1));

    expect(Object.keys(after.archive)).toHaveLength(90);
    expect(after.archive[OLD]).toBeDefined();
    expect(after.archive["2026-08-01"]).toBeUndefined();
    expect(after.archive["2026-08-02"]).toBeDefined();
  });

  it("does not evict a board carried over from the live game either", () => {
    const state = {
      ...withNinetyNewerBoards(),
      today: { day: "2026-07-31", guesses: [wrong(5)], status: "playing" as const },
    };

    const rolled = stateForDay(state, "2026-11-09");

    expect(Object.keys(rolled.archive)).toHaveLength(90);
    expect(rolled.archive["2026-07-31"]?.guesses).toEqual([wrong(5)]);
  });
});

describe("a live board left unfinished when its day ended", () => {
  const started = () =>
    playing({
      currentStreak: 4,
      lastResultDay: "2026-07-31",
      today: { day: DAY, guesses: [wrong(1), wrong(2)], status: "playing" },
    });

  it("is what the archive opens for that day, before anything moves it", () => {
    expect(archiveBoardFor(started(), DAY)).toEqual({
      day: DAY,
      guesses: [wrong(1), wrong(2)],
      status: "playing",
    });
    expect(playedOnTheDay(started(), DAY)).toBe(false);
  });

  it("continues in the archive with the guesses it already spent", () => {
    const state = recordArchiveGuess(started(), DAY, wrong(3));

    expect(state.archive[DAY]).toEqual({
      day: DAY,
      guesses: [wrong(1), wrong(2), wrong(3)],
      status: "playing",
    });
    // Late is late: none of it reaches the run.
    expect(state.currentStreak).toBe(4);
    expect(state.played).toBe(0);
    expect(state.history).toEqual({});
  });

  it("does not hand back a guess already spent on it", () => {
    const state = started();

    expect(recordArchiveGuess(state, DAY, wrong(2))).toBe(state);
  });

  it("finishes as a catch-up, never as a result from the day", () => {
    const won = recordArchiveGuess(started(), DAY, right(9));

    expect(won.archive[DAY].status).toBe("won");
    expect(outcomeForDay(won, DAY, NEXT_DAY)).toBe("archive-won");
    expect(archiveSolvedCount(won)).toBe(1);
    expect(won.won).toBe(0);
  });

  it("goes on from the archive board once the next day's first guess moves it", () => {
    let state = recordGuess(started(), NEXT_DAY, wrong(7));
    state = recordArchiveGuess(state, DAY, wrong(3));

    expect(state.today?.guesses).toEqual([wrong(7)]);
    expect(state.archive[DAY].guesses).toEqual([wrong(1), wrong(2), wrong(3)]);
  });
});

/**
 * A finished day has to stay finished however much the store is trimmed. The
 * archive shows every puzzle that has run, so a result that fell out of the
 * record came back as "not played" – replayable, with six fresh guesses.
 */
describe("results that outlive their boards", () => {
  function loseAllSix(state: DailyGameState, day: string): DailyGameState {
    for (let id = 1; id <= MAX_GUESSES; id++) {
      state = recordArchiveGuess(state, day, wrong(id));
    }
    return state;
  }

  it("keeps a lost catch-up lost after ninety newer boards push its board out", () => {
    let state = loseAllSix(playing(), DAY);
    for (let index = 1; index <= 90; index++) {
      state = recordArchiveGuess(state, shiftDate(DAY, index), wrong(1));
    }

    expect(state.archiveLostDays).toEqual([DAY]);
    expect(outcomeForDay(state, DAY, shiftDate(DAY, 200))).toBe("archive-lost");
    expect(archiveBoardFor(state, DAY).status).toBe("lost");
    // No second chance: the board is finished, so the guess changes nothing.
    expect(recordArchiveGuess(state, DAY, right(99))).toBe(state);
    expect(archiveSolvedCount(state)).toBe(0);
  });

  it("keeps a won catch-up finished, rather than reopening it, once its board is gone", () => {
    let state = recordArchiveGuess(playing(), DAY, right(1));
    for (let index = 1; index <= 90; index++) {
      state = recordArchiveGuess(state, shiftDate(DAY, index), right(index + 1));
    }

    expect(state.archive[DAY]).toBeUndefined();
    expect(archiveBoardFor(state, DAY)).toEqual({ day: DAY, guesses: [], status: "won" });
    expect(recordArchiveGuess(state, DAY, wrong(5))).toBe(state);
  });

  it("evicts finished boards before a board still being played", () => {
    const OLD = "2026-07-01";
    let state = recordArchiveGuess(playing(), OLD, wrong(1));
    state = recordArchiveGuess(state, OLD, wrong(2));
    for (let index = 0; index < 89; index++) {
      state = recordArchiveGuess(state, shiftDate(DAY, index), right(index + 1));
    }
    expect(Object.keys(state.archive)).toHaveLength(90);

    state = recordArchiveGuess(state, shiftDate(DAY, 89), right(500));

    expect(Object.keys(state.archive)).toHaveLength(90);
    // The oldest board is the one in progress, and it keeps its guesses…
    expect(state.archive[OLD]?.guesses).toEqual([wrong(1), wrong(2)]);
    // …while the oldest finished one gives way, its result kept.
    expect(state.archive[DAY]).toBeUndefined();
    expect(outcomeForDay(state, DAY, shiftDate(DAY, 200))).toBe("archive-won");
  });

  it("trims a stored archive the same way, finished boards first", () => {
    const OLD = "2026-07-01";
    const archive: Record<string, unknown> = {
      [OLD]: { day: OLD, guesses: [wrong(1)], status: "playing" },
    };
    for (let index = 0; index < 95; index++) {
      const day = shiftDate(DAY, index);
      archive[day] = { day, guesses: [...[1, 2, 3, 4, 5, 6].map(wrong)], status: "lost" };
    }

    const repaired = sanitizeGameState({ archive });

    expect(Object.keys(repaired.archive)).toHaveLength(90);
    expect(repaired.archive[OLD]?.status).toBe("playing");
    expect(repaired.archiveLostDays).toHaveLength(95);
    expect(sanitizeGameState(JSON.parse(JSON.stringify(repaired)))).toEqual(repaired);
  });

  it("never lists a lost catch-up that was won or played on the day", () => {
    const repaired = sanitizeGameState({
      history: { [DAY]: "won" },
      archiveWonDays: [NEXT_DAY],
      archiveLostDays: [DAY, NEXT_DAY, "2026-08-03", "2026-08-03", "nope", 7],
    });

    expect(repaired.archiveLostDays).toEqual(["2026-08-03"]);
  });

  it("reads a store written before the list existed", () => {
    const legacy = sanitizeGameState({
      archive: { [DAY]: { day: DAY, guesses: [1, 2, 3, 4, 5, 6].map(wrong), status: "lost" } },
    });

    expect(legacy.archiveLostDays).toEqual([DAY]);
  });

  it("keeps a day played on the day, however long ago, out of the catch-ups", () => {
    let state = playing();
    for (let index = 0; index < 450; index++) {
      state = recordResult(state, shiftDate(DAY, index), index % 2 === 0, 3);
    }
    state = sanitizeGameState(JSON.parse(JSON.stringify(state)));

    expect(Object.keys(state.history)).toHaveLength(450);
    expect(outcomeForDay(state, DAY, shiftDate(DAY, 450))).toBe("won");
    expect(archiveBoardFor(state, DAY).status).toBe("won");
    expect(recordArchiveGuess(state, DAY, right(1))).toBe(state);
  });
});
