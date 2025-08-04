// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DAILY_GAME_STORAGE_KEY } from "@/lib/daily-game";
import { todayUtc } from "@/lib/daily-puzzle";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey } from "@/lib/profile-storage";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { createProfileLockManager } from "@/test/profile-locks";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";
import { DailyGame } from "./DailyGame";
import type { MediaItem } from "@/types/tmdb";

/**
 * The daily puzzle board.
 *
 * The thing worth protecting here is the streak, and the rule that protects it
 * is not in any type: an archived day records into `archive` and touches nothing
 * else, because a streak has to keep meaning "turned up on the day" rather than
 * "worked through the back catalogue". A regression there inflates a number the
 * player cannot rebuild.
 *
 * Under that sits the board's own arithmetic – six guesses, an image that
 * sharpens as they are spent, a repeat that must not cost a life – and the
 * picker, which filters to films because the answer is always one and every
 * show or person in the list is a guess thrown away.
 */

const getDailyPuzzle = vi.fn();
const checkDailyGuess = vi.fn();
const searchMulti = vi.fn();

vi.mock("@/lib/api", () => ({
  getDailyPuzzle: (...args: unknown[]) => getDailyPuzzle(...args),
  checkDailyGuess: (...args: unknown[]) => checkDailyGuess(...args),
  searchMulti: (...args: unknown[]) => searchMulti(...args),
}));

vi.mock("@/components/Toast", () => ({
  toast: { showToast: vi.fn() },
}));

vi.mock("@/components/NextPuzzleCountdown", () => ({
  NextPuzzleCountdown: () => null,
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

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

const { toast } = await import("@/components/Toast");

const TODAY = todayUtc();

function film(title: string, id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "1999-10-15",
    vote_average: 8,
    vote_count: 10,
    genre_ids: [],
    media_type: "movie",
    ...overrides,
  } as MediaItem;
}

function puzzleView(overrides = {}) {
  return {
    number: 42,
    imageUrl: "https://image.tmdb.org/t/p/w780/still.jpg",
    hints: [],
    answer: null,
    ...overrides,
  };
}

function storedState(overrides = {}) {
  return {
    lastResultDay: "",
    currentStreak: 0,
    bestStreak: 0,
    played: 0,
    won: 0,
    distribution: [0, 0, 0, 0, 0, 0],
    today: null,
    archive: {},
    ...overrides,
  };
}

function seedState(overrides = {}) {
  window.localStorage.setItem(
    DAILY_GAME_STORAGE_KEY,
    JSON.stringify(storedState(overrides)),
  );
}

function readState() {
  return JSON.parse(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY) ?? "{}");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function holdRosterLock() {
  const entered = deferred<void>();
  const released = deferred<void>();
  const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
    entered.resolve();
    return released.promise;
  });
  await entered.promise;
  return { holding, release: () => released.resolve() };
}

async function renderGame(props: { day?: string } = {}) {
  const result = render(<DailyGame {...props} />);
  // The puzzle view is fetched in a mount effect; the board is a spinner until
  // it lands.
  await act(async () => {});
  return result;
}

/** Type a title, let the 250ms debounce elapse, and pick the first suggestion. */
async function guess(title: string) {
  fireEvent.change(screen.getByLabelText("Guess the film"), {
    target: { value: title },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: new RegExp(title, "i") }));
  });
}

const blurOf = (node: HTMLElement) => node.style.filter;

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  vi.useFakeTimers();
  getDailyPuzzle.mockResolvedValue(puzzleView());
  checkDailyGuess.mockResolvedValue(false);
  searchMulti.mockResolvedValue({ results: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the board before anything is guessed", () => {
  it("waits for the puzzle rather than showing an empty board", () => {
    render(<DailyGame />);

    expect(screen.queryByLabelText("Guess the film")).toBeNull();
  });

  it("names the puzzle and the day", async () => {
    await renderGame();

    expect(screen.getByText(`Puzzle #42 · ${TODAY}`)).toBeTruthy();
  });

  it("offers all six guesses", async () => {
    await renderGame();

    expect(screen.getByText(/6 guesses left/i)).toBeTruthy();
  });

  /**
   * Opening the page is not playing. If it were, a visitor who looked and left
   * would have spent the day – and the streak is the thing that costs.
   */
  it("does not write a board just for being opened", async () => {
    await renderGame();

    expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBeNull();
  });
});

describe("when the puzzle cannot be fetched", () => {
  /**
   * The failure used to be logged and nothing else, which left the spinner up
   * for as long as the tab stayed open – and the visitor with no idea whether
   * to wait or give up.
   */
  it("says so and offers to try again, instead of spinning forever", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDailyPuzzle.mockRejectedValue(new Error("TMDB is down"));

    await renderGame();

    expect(screen.getByText(/could not load today's puzzle/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("loads the board when the retry goes through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDailyPuzzle.mockRejectedValueOnce(new Error("TMDB is down"));

    await renderGame();
    getDailyPuzzle.mockResolvedValue(puzzleView());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    expect(screen.getByText(`Puzzle #42 · ${TODAY}`)).toBeTruthy();
    expect(getDailyPuzzle).toHaveBeenCalledTimes(2);
  });

  it("offers a retry when the catalogue returns no puzzle", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDailyPuzzle.mockResolvedValue(null);

    await renderGame();

    expect(screen.getByText(/could not load today's puzzle/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  /**
   * The re-ask after a guess can fail too. That one must not blank a board the
   * player is halfway through – the hints already earned stay on screen.
   */
  it("keeps the board up when a re-ask after a guess fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();
    getDailyPuzzle.mockRejectedValue(new Error("TMDB is down"));

    await guess("Heat");

    expect(screen.getByText(`Puzzle #42 · ${TODAY}`)).toBeTruthy();
    expect(screen.getByText(/could not refresh this puzzle/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(screen.getByLabelText("Guess the film")).toBeTruthy();
  });

  it.each(["won", "lost"] as const)(
    "reveals a %s result after retrying a failed final refresh",
    async (status) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      if (status === "lost") {
        seedState({
          today: {
            day: TODAY,
            status: "playing",
            guesses: Array.from({ length: 5 }, (_, index) => ({
              id: index + 1,
              title: `Wrong film ${index + 1}`,
              correct: false,
            })),
          },
        });
      }
      searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
      checkDailyGuess.mockResolvedValue(status === "won");
      await renderGame();
      getDailyPuzzle.mockResolvedValueOnce(null);

      await guess("Fight Club");

      const saved = readState();
      expect(saved.today.status).toBe(status);
      expect(screen.queryByLabelText("Guess the film")).toBeNull();
      expect(screen.getByText(/your result is saved/i)).toBeTruthy();
      getDailyPuzzle.mockResolvedValue(puzzleView({
        answer: {
          id: 550,
          title: "Fight Club",
          slug: "550-fight-club",
          year: "1999",
          posterPath: null,
          overview: null,
        },
      }));

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      });

      expect(screen.getByText(status === "won" ? "Got it in 1!" : "Out of guesses")).toBeTruthy();
      expect(screen.getByRole("button", { name: /share result/i })).toBeTruthy();
      expect(screen.queryByText(/could not refresh/i)).toBeNull();
      expect(readState()).toEqual(saved);
      expect(checkDailyGuess).toHaveBeenCalledTimes(1);
    },
  );

  it("refreshes saved guesses when the connection returns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();
    getDailyPuzzle.mockRejectedValueOnce(new Error("Offline"));
    await guess("Heat");
    const saved = readState();
    getDailyPuzzle.mockResolvedValue(puzzleView({ hints: { decade: "1980s" } }));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.getByText("The 1980s")).toBeTruthy();
    expect(screen.queryByText(/could not refresh/i)).toBeNull();
    expect(readState()).toEqual(saved);
  });
});

describe("the day", () => {
  /**
   * A tab left open across UTC midnight. The board used to read `todayUtc()`
   * once per render and had no reason to render again, so it kept offering
   * yesterday's puzzle – and a guess made then recorded against the wrong day.
   */
  it("rolls onto the new puzzle when UTC midnight passes", async () => {
    vi.setSystemTime(new Date("2026-09-14T23:59:00.000Z"));
    await renderGame();
    expect(screen.getByText("Puzzle #42 · 2026-09-14")).toBeTruthy();
    expect(getDailyPuzzle).toHaveBeenLastCalledWith("2026-09-14", 0, false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(screen.getByText("Puzzle #42 · 2026-09-15")).toBeTruthy();
    expect(getDailyPuzzle).toHaveBeenLastCalledWith("2026-09-15", 0, false);
  });

  it("hides old clues and guesses until a different archived day loads", async () => {
    getDailyPuzzle.mockResolvedValue(puzzleView({ hints: { decade: "1980s" } }));
    const game = await renderGame({ day: "2026-09-14" });
    expect(screen.getByText("The 1980s")).toBeTruthy();

    const nextPuzzle = deferred<ReturnType<typeof puzzleView>>();
    getDailyPuzzle.mockReturnValue(nextPuzzle.promise);
    game.rerender(<DailyGame day="2026-09-15" />);

    expect(screen.queryByText("The 1980s")).toBeNull();
    expect(screen.queryByLabelText("Guess the film")).toBeNull();

    await act(async () => {
      nextPuzzle.resolve(puzzleView({ number: 43, hints: { decade: "1990s" } }));
    });

    expect(screen.getByText("Puzzle #43 · 2026-09-15")).toBeTruthy();
    expect(screen.getByText("The 1990s")).toBeTruthy();
    expect(screen.getByLabelText("Guess the film")).toBeTruthy();
  });

  it("shows a retry for a failed new day instead of preserving another day's clues", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDailyPuzzle.mockResolvedValue(puzzleView({ hints: { decade: "1980s" } }));
    const game = await renderGame({ day: "2026-09-14" });

    getDailyPuzzle.mockRejectedValue(new Error("offline"));
    game.rerender(<DailyGame day="2026-09-15" />);
    await act(async () => {});

    expect(screen.queryByText("The 1980s")).toBeNull();
    expect(screen.queryByLabelText("Guess the film")).toBeNull();
    expect(screen.getByText(/could not load that puzzle/i)).toBeTruthy();

    getDailyPuzzle.mockResolvedValue(puzzleView({ number: 43 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });

    expect(screen.getByText("Puzzle #43 · 2026-09-15")).toBeTruthy();
  });

  it("discards a pending guess from yesterday without overwriting today's board", async () => {
    vi.setSystemTime(new Date("2026-09-14T23:59:00.000Z"));
    const previousCheck = deferred<boolean>();
    checkDailyGuess.mockReturnValueOnce(previousCheck.promise);
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();
    await guess("Heat");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    searchMulti.mockResolvedValue({ results: [film("Arrival", 329865)] });
    await guess("Arrival");

    await act(async () => {
      previousCheck.resolve(true);
    });

    expect(readState().today).toEqual({
      day: "2026-09-15",
      guesses: [{ id: 329865, title: "Arrival", correct: false }],
      status: "playing",
    });
    expect(readState().played).toBe(0);
    expect(screen.getByText(/5 guesses left/i)).toBeTruthy();
  });
});

describe("the image sharpening", () => {
  it("starts blurred", async () => {
    await renderGame();

    expect(blurOf(screen.getByRole("img", { name: /blurred still/i }))).toBe(
      "blur(12px)",
    );
  });

  it("sharpens by one step per wrong guess", async () => {
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();

    await guess("Heat");

    expect(blurOf(screen.getByRole("img", { name: /blurred still/i }))).toBe(
      "blur(10px)",
    );
  });

  it("clears completely once the day is over", async () => {
    seedState({
      today: {
        day: TODAY,
        guesses: [{ id: 1, title: "Heat", correct: true }],
        status: "won",
      },
    });
    getDailyPuzzle.mockResolvedValue(
      puzzleView({ answer: { id: 550, title: "Fight Club", posterPath: null } }),
    );

    await renderGame();

    expect(blurOf(screen.getByRole("img", { name: /today's film/i }))).toBe("");
  });
});

describe("making a guess", () => {
  it("checks a double-clicked suggestion once before the pending state renders", async () => {
    const result = deferred<boolean>();
    checkDailyGuess.mockReturnValueOnce(result.promise);
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();
    fireEvent.change(screen.getByLabelText("Guess the film"), { target: { value: "Heat" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const suggestion = screen.getByRole("button", { name: /Heat/i });

    await act(async () => { fireEvent.click(suggestion); fireEvent.click(suggestion); });

    expect(checkDailyGuess).toHaveBeenCalledTimes(1);
    await act(async () => { result.resolve(false); });
    expect(readState().today.guesses).toEqual([{ id: 949, title: "Heat", correct: false }]);
  });

  it("records a wrong guess and counts it against the six", async () => {
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();

    await guess("Heat");

    expect(readState().today.guesses).toEqual([
      { id: 949, title: "Heat", correct: false },
    ]);
    expect(screen.getByText(/5 guesses left/i)).toBeTruthy();
  });

  it("ends the day on a correct guess", async () => {
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    checkDailyGuess.mockResolvedValue(true);
    getDailyPuzzle.mockResolvedValue(
      puzzleView({ answer: { id: 550, title: "Fight Club", posterPath: null } }),
    );

    await renderGame();
    await guess("Fight Club");

    expect(readState().today.status).toBe("won");
    expect(screen.queryByLabelText("Guess the film")).toBeNull();
  });

  it("says 'guess' rather than 'guesses' when one is left", async () => {
    seedState({
      today: {
        day: TODAY,
        guesses: [1, 2, 3, 4, 5].map((id) => ({
          id,
          title: `Wrong ${id}`,
          correct: false,
        })),
        status: "playing",
      },
    });

    await renderGame();

    expect(screen.getByText(/1 guess left/i)).toBeTruthy();
  });

  it("tells the player when the check itself failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    checkDailyGuess.mockRejectedValue(new Error("offline"));

    await renderGame();
    await guess("Heat");

    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not check that guess – try again",
      "error",
    );
  });

  it.each([TODAY, "2026-01-02"])(
    "preserves the board and allows the same guess to be retried after a refused save on %s",
    async (day) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      seedState({ currentStreak: 3, bestStreak: 5, played: 10, won: 7 });
      const before = window.localStorage.getItem(DAILY_GAME_STORAGE_KEY);
      searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
      checkDailyGuess.mockResolvedValue(true);
      getDailyPuzzle.mockResolvedValue(
        puzzleView({ answer: { id: 550, title: "Fight Club", posterPath: null } }),
      );
      const setItem = Storage.prototype.setItem;
      const refused = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key === DAILY_GAME_STORAGE_KEY) {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        setItem.call(this, key, value);
      });
      await renderGame({ day });

      await guess("Fight Club");

      expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBe(before);
      expect(screen.getByText(/6 guesses left/i)).toBeTruthy();
      expect(screen.getByLabelText("Guess the film").hasAttribute("disabled")).toBe(false);
      expect(toast.showToast).toHaveBeenCalledWith(
        "Could not save that guess. Check your browser's storage settings and try again.",
        "error",
      );

      refused.mockRestore();
      await guess("Fight Club");

      const saved = readState();
      const board = day === TODAY ? saved.today : saved.archive[day];
      expect(board.status).toBe("won");
      expect(board.guesses).toEqual([{ id: 550, title: "Fight Club", correct: true }]);
      expect(saved.played).toBe(day === TODAY ? 11 : 10);
      expect(checkDailyGuess).toHaveBeenCalledTimes(2);
      expect(screen.queryByLabelText("Guess the film")).toBeNull();
    },
  );

  /**
   * The board is re-asked after every guess because the hints are earned rather
   * than shipped – the answer is never sitting in the page waiting to be found.
   */
  it("re-asks for the puzzle with the new guess count", async () => {
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();
    expect(getDailyPuzzle).toHaveBeenLastCalledWith(TODAY, 0, false);

    await guess("Heat");

    expect(getDailyPuzzle).toHaveBeenLastCalledWith(TODAY, 1, false);
  });
});

describe("a guess checked while another tab updates storage", () => {
  const PAST = "2026-01-02";

  it.each([TODAY, PAST])("preserves existing guesses and history when reading the %s board fails, then retries", async (day) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const earlierGuess = { id: 13, title: "Forrest Gump", correct: false };
    const board = { day, guesses: [earlierGuess], status: "playing" };
    seedState({
      currentStreak: 3, bestStreak: 5, played: 10, won: 7,
      history: { "2026-01-01": "won" },
      ...(day === TODAY ? { today: board } : { archive: { [day]: board } }),
    });
    const before = readState();
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame({ day });
    const lock = await holdRosterLock();
    await guess("Heat");
    refuseNextLocalStorageRead(DAILY_GAME_STORAGE_KEY);

    await act(async () => { lock.release(); await lock.holding; });

    expect(readState()).toEqual(before);
    expect(screen.getByText(/5 guesses left/i)).toBeTruthy();
    expect(screen.getByLabelText("Guess the film").hasAttribute("disabled")).toBe(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Could not safely save that guess. Reload the page and try again.", "error",
    );
    await guess("Heat");
    const saved = readState();
    expect((day === TODAY ? saved.today : saved.archive[day]).guesses).toEqual([
      earlierGuess, { id: 949, title: "Heat", correct: false },
    ]);
    expect(saved.history).toEqual(before.history);
    expect(saved.played).toBe(10);
    expect(saved.won).toBe(7);
    expect(saved.bestStreak).toBe(5);
  });

  it.each([TODAY, PAST])("waits for the shared lock and applies the %s guess to data saved while queued", async (day) => {
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    checkDailyGuess.mockResolvedValue(true);
    await renderGame({ day });
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");

    await guess("Fight Club");

    expect(requests).toHaveBeenCalledWith(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, expect.any(Function));
    expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText("Guess the film").hasAttribute("disabled")).toBe(true);
    const otherGuess = { id: 949, title: "Heat", correct: false };
    const board = { day, guesses: [otherGuess], status: "playing" };
    const history = { "2026-01-01": "won" };
    seedState({
      played: 2,
      won: 1,
      history,
      ...(day === TODAY ? { today: board } : { archive: { [day]: board } }),
    });

    await act(async () => { lock.release(); await lock.holding; });

    const saved = readState();
    expect((day === TODAY ? saved.today : saved.archive[day]).guesses)
      .toEqual([otherGuess, { id: 550, title: "Fight Club", correct: true }]);
    expect(saved.history["2026-01-01"]).toBe("won");
    expect(saved.played).toBe(day === TODAY ? 3 : 2);
    expect(screen.queryByLabelText("Guess the film")).toBeNull();
  });

  it.each(["unmount", "profile change", "UTC midnight"])("discards a queued guess after %s", async (change) => {
    vi.setSystemTime(new Date("2026-09-14T23:59:00.000Z"));
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    const view = await renderGame();
    const lock = await holdRosterLock();
    await guess("Heat");

    if (change === "unmount") view.unmount();
    if (change === "profile change") window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other");
    // No timer has fired to remount the board yet: saving must check the day
    // after acquiring the lock as well as checking whether it is still mounted.
    if (change === "UTC midnight") vi.setSystemTime(new Date("2026-09-15T00:00:01.000Z"));
    await act(async () => { lock.release(); await lock.holding; });

    expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBeNull();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it.each(["missing", "rejected"])("reports an unavailable lock (%s) and leaves the guess retryable", async (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame();
    vi.stubGlobal("navigator", failure === "missing" ? {} : {
      locks: { request: vi.fn().mockRejectedValue(new Error("Lock refused")) },
    });

    await guess("Heat");

    expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText("Guess the film").hasAttribute("disabled")).toBe(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Could not safely save that guess. Reload the page and try again.", "error",
    );
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    await guess("Heat");
    expect(readState().today.guesses).toEqual([{ id: 949, title: "Heat", correct: false }]);
  });

  it.each([TODAY, PAST])("clears earned clues and revealed artwork when the profile changes on %s", async (day) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const completed = {
      day,
      guesses: [1, 2, 3, 4, 5, 6].map((id) => ({
        id,
        title: `Wrong ${id}`,
        correct: false,
      })),
      status: "lost",
    };
    seedState(day === TODAY ? { today: completed } : { archive: { [day]: completed } });
    const revealedArtwork = "https://image.tmdb.org/t/p/w780/revealed.jpg";
    getDailyPuzzle.mockResolvedValueOnce(puzzleView({
      imageUrl: revealedArtwork,
      hints: { director: "David Fincher", cast: ["Brad Pitt"] },
      answer: { id: 550, title: "Fight Club", posterPath: null },
    }));
    await renderGame({ day });
    expect(screen.getByText("David Fincher")).toBeTruthy();
    expect(screen.getByText("Brad Pitt")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe(revealedArtwork);

    const pending = deferred<ReturnType<typeof puzzleView> | null>();
    getDailyPuzzle.mockReturnValueOnce(pending.promise);
    await act(async () => {
      seedState();
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "someone-else");
      for (const key of [DAILY_GAME_STORAGE_KEY, ACTIVE_PROFILE_STORAGE_KEY]) {
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    });
    expect(getDailyPuzzle).toHaveBeenLastCalledWith(day, 0, false);
    expect(screen.queryByText("David Fincher")).toBeNull();
    expect(screen.queryByText("Brad Pitt")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Fight Club")).toBeNull();

    await act(async () => pending.resolve(null));
    expect(screen.getByText(/could not load (today's|that) puzzle/i)).toBeTruthy();
    expect(screen.queryByText("David Fincher")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();

    getDailyPuzzle.mockResolvedValueOnce(puzzleView({
      imageUrl: "https://image.tmdb.org/t/p/w92/fresh.jpg",
      hints: {},
    }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });
    expect(screen.getByText(/6 guesses left/i)).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toContain("/w92/fresh.jpg");
    expect(screen.queryByText("David Fincher")).toBeNull();
  });

  it.each([TODAY, PAST])("hides clues that a restore of the same profile removes on %s even when refresh fails", async (day) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const completed = {
      day,
      guesses: [1, 2, 3, 4, 5, 6].map((id) => ({ id, title: `Wrong ${id}`, correct: false })),
      status: "lost",
    };
    seedState(day === TODAY ? { today: completed } : { archive: { [day]: completed } });
    getDailyPuzzle.mockResolvedValueOnce(puzzleView({
      hints: { director: "David Fincher", cast: ["Brad Pitt"] },
      answer: { id: 550, title: "Fight Club", posterPath: null },
    }));
    await renderGame({ day });
    expect(screen.getByText("David Fincher")).toBeTruthy();

    const pending = deferred<ReturnType<typeof puzzleView> | null>();
    getDailyPuzzle.mockReturnValueOnce(pending.promise);
    await act(async () => {
      seedState();
      window.dispatchEvent(new StorageEvent("storage", { key: DAILY_GAME_STORAGE_KEY }));
    });
    expect(screen.queryByText("David Fincher")).toBeNull();
    expect(screen.queryByText("Brad Pitt")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Fight Club")).toBeNull();

    await act(async () => pending.resolve(null));
    expect(screen.getByText(/could not load (today's|that) puzzle/i)).toBeTruthy();
    expect(screen.queryByText("David Fincher")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([
    [TODAY, "won"],
    [TODAY, "lost"],
    [PAST, "won"],
    [PAST, "lost"],
  ])("preserves the finished %s board and its %s result", async (day, status) => {
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame({ day });
    await guess("Heat");

    const completedBoard = {
      day,
      guesses: status === "won"
        ? [{ id: 550, title: "Fight Club", correct: true }]
        : [1, 2, 3, 4, 5, 6].map((id) => ({ id, title: `Wrong ${id}`, correct: false })),
      status,
    };
    const concurrent = storedState({
      played: 5,
      won: 3,
      currentStreak: 2,
      bestStreak: 4,
      lastResultDay: TODAY,
      distribution: [1, 2, 0, 0, 0, 0],
      history: { [TODAY]: "won" },
      ...(day === TODAY
        ? { today: completedBoard }
        : { archive: { [day]: completedBoard } }),
    });
    await act(async () => {
      window.localStorage.setItem(DAILY_GAME_STORAGE_KEY, JSON.stringify(concurrent));
      window.dispatchEvent(new StorageEvent("storage", { key: DAILY_GAME_STORAGE_KEY }));
    });

    // Even a correct response cannot reopen a loss or count a completed win twice.
    await act(async () => pending.resolve(status === "lost"));

    expect(readState()).toEqual(concurrent);
    expect(screen.queryByLabelText("Guess the film")).toBeNull();
  });

  it.each([TODAY, PAST])("keeps concurrent guesses and unrelated progress on %s", async (day) => {
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    await renderGame({ day });
    await guess("Fight Club");

    const otherGuess = { id: 949, title: "Heat", correct: false };
    const concurrentBoard = { day, guesses: [otherGuess], status: "playing" };
    const otherArchive = {
      day: "2026-01-01",
      guesses: [{ id: 680, title: "Pulp Fiction", correct: true }],
      status: "won",
    };
    const concurrent = storedState({
      played: 5,
      won: 3,
      currentStreak: 2,
      bestStreak: 4,
      lastResultDay: "2026-01-03",
      history: { "2026-01-03": "won" },
      distribution: [1, 2, 0, 0, 0, 0],
      today: day === TODAY ? concurrentBoard : { day: TODAY, guesses: [otherGuess], status: "playing" },
      archive: { "2026-01-01": otherArchive, ...(day === PAST ? { [PAST]: concurrentBoard } : {}) },
    });
    // Reading storage after the check must also work before its event arrives.
    window.localStorage.setItem(DAILY_GAME_STORAGE_KEY, JSON.stringify(concurrent));
    await act(async () => pending.resolve(true));

    const saved = readState();
    const board = day === TODAY ? saved.today : saved.archive[day];
    expect(board.guesses).toEqual([otherGuess, { id: 550, title: "Fight Club", correct: true }]);
    expect(board.status).toBe("won");
    expect(saved.archive["2026-01-01"]).toEqual(otherArchive);
    expect(saved.played).toBe(day === TODAY ? 6 : concurrent.played);
    expect(saved.won).toBe(day === TODAY ? 4 : concurrent.won);
    expect(saved.distribution).toEqual(day === TODAY ? [1, 3, 0, 0, 0, 0] : concurrent.distribution);
    expect(saved.history["2026-01-03"]).toBe("won");
    if (day === PAST) expect(saved.today).toEqual(concurrent.today);
  });

  it.each([TODAY, PAST])("does not spend a second guess for a concurrent repeat on %s", async (day) => {
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });
    await renderGame({ day });
    await guess("Heat");

    const board = { day, guesses: [{ id: 949, title: "Heat", correct: false }], status: "playing" };
    const concurrent = storedState(day === TODAY ? { today: board } : { archive: { [day]: board } });
    window.localStorage.setItem(DAILY_GAME_STORAGE_KEY, JSON.stringify(concurrent));
    await act(async () => pending.resolve(false));

    expect(readState()).toEqual(concurrent);
    expect(screen.getByText(/5 guesses left/i)).toBeTruthy();
  });

  it.each([TODAY, PAST])("discards the pending %s guess when another profile becomes active", async (day) => {
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    await renderGame({ day });
    await guess("Fight Club");

    const incoming = storedState({ played: 7, won: 4, bestStreak: 3 });
    window.localStorage.setItem(DAILY_GAME_STORAGE_KEY, JSON.stringify(incoming));
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "someone-else");
    await act(async () => pending.resolve(true));

    expect(readState()).toEqual(incoming);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it.each([TODAY, PAST])("keeps the %s guess with its owner if the active pointer changes after its guard", async (day) => {
    initializeProfileStorage();
    const incoming = storedState({ played: 7, won: 4, bestStreak: 3 });
    const incomingKey = profileStoreKey(DAILY_GAME_STORAGE_KEY, "bob");
    window.localStorage.setItem(incomingKey, JSON.stringify(incoming));
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    await renderGame({ day });
    await guess("Fight Club");
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = getItem.call(this, key);
      if (key === DAILY_GAME_STORAGE_KEY) {
        setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => pending.resolve(true));

    const saved = readState();
    const board = day === TODAY ? saved.today : saved.archive[day];
    expect(board.guesses).toEqual([{ id: 550, title: "Fight Club", correct: true }]);
    expect(JSON.parse(window.localStorage.getItem(incomingKey)!)).toEqual(incoming);
  });

  it.each([TODAY, PAST])("blocks a stale %s board before the profile's storage event arrives", async (day) => {
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    await renderGame({ day });
    fireEvent.change(screen.getByLabelText("Guess the film"), {
      target: { value: "Fight Club" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const incoming = storedState({ played: 7, won: 4, bestStreak: 3 });
    window.localStorage.setItem(DAILY_GAME_STORAGE_KEY, JSON.stringify(incoming));
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "someone-else");
    // The offered guess still belongs to the old board; no storage event has
    // refreshed this tab's rendered owner yet.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fight Club/i }));
    });

    expect(checkDailyGuess).not.toHaveBeenCalled();
    expect(readState()).toEqual(incoming);
    expect(toast.showToast).toHaveBeenCalledWith(
      "Your active profile changed. Review the current puzzle and try again.",
      "info",
    );
  });

  it.each([
    [TODAY, "before"],
    [TODAY, "after"],
    [PAST, "before"],
    [PAST, "after"],
  ])("preserves the %s board when checking its owner fails %s the guess request", async (day, stage) => {
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    seedState({ currentStreak: 3, bestStreak: 5, played: 10, won: 7 });
    const before = window.localStorage.getItem(DAILY_GAME_STORAGE_KEY);
    await renderGame({ day });
    fireEvent.change(screen.getByLabelText("Guess the film"), {
      target: { value: "Fight Club" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const suggestion = screen.getByRole("button", { name: /Fight Club/i });
    if (stage === "after") {
      await act(async () => { fireEvent.click(suggestion); });
    }

    const getItem = Storage.prototype.getItem;
    const refused = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === ACTIVE_PROFILE_STORAGE_KEY) {
        throw new DOMException("Storage is blocked", "SecurityError");
      }
      return getItem.call(this, key);
    });

    await act(async () => {
      if (stage === "before") fireEvent.click(suggestion);
      pending.resolve(true);
    });

    expect(checkDailyGuess).toHaveBeenCalledTimes(stage === "before" ? 0 : 1);
    expect(window.localStorage.getItem(DAILY_GAME_STORAGE_KEY)).toBe(before);
    expect(screen.getByText(/6 guesses left/i)).toBeTruthy();
    expect(screen.getByLabelText("Guess the film").hasAttribute("disabled")).toBe(false);
    expect(toast.showToast).toHaveBeenCalledTimes(1);
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not check your active profile. Reload the page and try again.",
      "error",
    );

    refused.mockRestore();
    await guess("Fight Club");

    const saved = readState();
    const board = day === TODAY ? saved.today : saved.archive[day];
    expect(board.guesses).toEqual([{ id: 550, title: "Fight Club", correct: true }]);
    expect(board.status).toBe("won");
  });

  it("cannot roll a newer stored live board back to the checked day", async () => {
    vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
    const pending = deferred<boolean>();
    checkDailyGuess.mockReturnValue(pending.promise);
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    await renderGame();
    await guess("Fight Club");

    const newer = storedState({
      today: {
        day: "2026-09-15",
        guesses: [{ id: 949, title: "Heat", correct: false }],
        status: "playing",
      },
    });
    window.localStorage.setItem(DAILY_GAME_STORAGE_KEY, JSON.stringify(newer));
    await act(async () => pending.resolve(true));

    expect(readState()).toEqual(newer);
  });
});

describe("the suggestion list", () => {
  it.each(["", "a", "   "])("stops searching when a queued next query is shortened to %j", async (shortQuery) => {
    const slow = deferred<{ results: MediaItem[] }>();
    searchMulti.mockReturnValueOnce(slow.promise);
    await renderGame();
    const input = screen.getByLabelText("Guess the film");
    fireEvent.change(input, { target: { value: "bat" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText("Searching…")).toBeTruthy();

    fireEvent.change(input, { target: { value: "batman" } });
    fireEvent.change(input, { target: { value: shortQuery } });
    expect(screen.queryByText("Searching…")).toBeNull();

    await act(async () => {
      slow.resolve({ results: [film("Batman", 2)] });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(searchMulti).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Searching…")).toBeNull();
    expect(screen.queryByRole("button", { name: /Batman/ })).toBeNull();
  });

  it.each(["clear", "pick"])("keeps cleared and late suggestions out of the next search after %s", async (action) => {
    const slow = deferred<{ results: MediaItem[] }>();
    searchMulti
      .mockResolvedValueOnce({ results: [film("Heat", 949)] })
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ results: [film("Dune", 438631)] });
    await renderGame();
    const input = screen.getByLabelText("Guess the film");
    fireEvent.change(input, { target: { value: "heat" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.change(input, { target: { value: "bat" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    if (action === "pick") {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Heat/ }));
      });
    } else {
      fireEvent.change(input, { target: { value: "" } });
    }

    fireEvent.change(input, { target: { value: "dune" } });
    expect(screen.queryByRole("button", { name: /Heat/ })).toBeNull();
    await act(async () => slow.resolve({ results: [film("Batman", 2)] }));
    expect(screen.queryByRole("button", { name: /Batman/ })).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchMulti).toHaveBeenLastCalledWith("dune", 1);
    expect(screen.getByRole("button", { name: /Dune/ })).toBeTruthy();
    expect(screen.queryByText("Searching…")).toBeNull();
  });

  it("stays closed for a query too short to be worth a round trip", async () => {
    await renderGame();

    fireEvent.change(screen.getByLabelText("Guess the film"), {
      target: { value: "a" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(searchMulti).not.toHaveBeenCalled();
  });

  it("asks once for a burst of keystrokes", async () => {
    await renderGame();
    const input = screen.getByLabelText("Guess the film");

    for (const value of ["fi", "fig", "figh", "fight"]) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(searchMulti).toHaveBeenCalledTimes(1);
  });

  /**
   * The answer is always a film, so a show or a person in the list is a guess
   * the player throws away on something that could never have been right.
   */
  it("offers films only", async () => {
    searchMulti.mockResolvedValue({
      results: [
        film("Fight Club", 550),
        film("The Wire", 1438, { media_type: "tv" }),
        film("Edward Norton", 819, { media_type: "person" }),
      ],
    });

    await renderGame();
    fireEvent.change(screen.getByLabelText("Guess the film"), {
      target: { value: "fight" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("Fight Club")).toBeTruthy();
    expect(screen.queryByText("The Wire")).toBeNull();
    expect(screen.queryByText("Edward Norton")).toBeNull();
  });

  it("caps the list at six", async () => {
    searchMulti.mockResolvedValue({
      results: Array.from({ length: 20 }, (_, i) => film(`Film ${i}`, i + 1)),
    });

    await renderGame();
    fireEvent.change(screen.getByLabelText("Guess the film"), {
      target: { value: "film" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getAllByText(/^Film \d+$/)).toHaveLength(6);
  });

  /**
   * Guessing the same wrong film twice must not cost a life, and the clearest
   * place to say so is the list itself.
   */
  it("marks and disables a film that was already guessed", async () => {
    seedState({
      today: {
        day: TODAY,
        guesses: [{ id: 949, title: "Heat", correct: false }],
        status: "playing",
      },
    });
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });

    await renderGame();
    fireEvent.change(screen.getByLabelText("Guess the film"), {
      target: { value: "heat" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText(/already guessed/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /heat/i }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("an archived day", () => {
  const PAST = "2026-01-02";

  it("says which day it is replaying", async () => {
    await renderGame({ day: PAST });

    expect(screen.getByText(/from the archive/i)).toBeTruthy();
    expect(screen.getByText(new RegExp(`originally ran on ${PAST}`))).toBeTruthy();
  });

  /**
   * The rule the whole archive feature rests on. A past day records into
   * `archive` and touches neither the streak nor the totals – otherwise a
   * player could manufacture any streak they liked from the back catalogue.
   */
  it("records into the archive without touching the streak or the totals", async () => {
    seedState({ currentStreak: 3, bestStreak: 5, played: 10, won: 7 });
    searchMulti.mockResolvedValue({ results: [film("Fight Club", 550)] });
    checkDailyGuess.mockResolvedValue(true);
    getDailyPuzzle.mockResolvedValue(
      puzzleView({ answer: { id: 550, title: "Fight Club", posterPath: null } }),
    );

    await renderGame({ day: PAST });
    await guess("Fight Club");

    const state = readState();
    expect(state.archive[PAST].status).toBe("won");
    expect(state.currentStreak).toBe(3);
    expect(state.bestStreak).toBe(5);
    expect(state.played).toBe(10);
    expect(state.won).toBe(7);
  });

  it("leaves a board still in progress for today alone", async () => {
    seedState({
      today: {
        day: TODAY,
        guesses: [{ id: 1, title: "Wrong", correct: false }],
        status: "playing",
      },
    });
    searchMulti.mockResolvedValue({ results: [film("Heat", 949)] });

    await renderGame({ day: PAST });
    await guess("Heat");

    expect(readState().today).toEqual({
      day: TODAY,
      guesses: [{ id: 1, title: "Wrong", correct: false }],
      status: "playing",
    });
  });

  it("shows no streak badge, because the archive does not earn one", async () => {
    seedState({ currentStreak: 4, bestStreak: 9 });

    await renderGame({ day: PAST });

    expect(screen.queryByText(/day streak/i)).toBeNull();
    expect(screen.queryByText(/best 9/i)).toBeNull();
  });
});

describe("the streak on a live day", () => {
  it("shows the run and the best when there is one", async () => {
    seedState({
      currentStreak: 4,
      bestStreak: 9,
      lastResultDay: TODAY,
      today: {
        day: TODAY,
        guesses: [{ id: 550, title: "Fight Club", correct: true }],
        status: "won",
      },
    });
    getDailyPuzzle.mockResolvedValue(
      puzzleView({ answer: { id: 550, title: "Fight Club", posterPath: null } }),
    );

    await renderGame();

    expect(screen.getByText(/4 day streak/i)).toBeTruthy();
    expect(screen.getByText(/best 9/i)).toBeTruthy();
  });
});
