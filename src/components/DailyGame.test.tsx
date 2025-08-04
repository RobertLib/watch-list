// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DAILY_GAME_STORAGE_KEY } from "@/lib/daily-game";
import { todayUtc } from "@/lib/daily-puzzle";
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
    expect(screen.queryByText(/could not load/i)).toBeNull();
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

describe("the suggestion list", () => {
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
