import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_GAME_STORAGE_KEY,
  EMPTY_STATE,
  getGameStateSnapshot,
  recordGuess,
  sanitizeGameState,
  saveGameState,
} from "./daily-game";
import {
  HIGHER_LOWER_STORAGE_KEY,
  getRecord,
  recordRound,
  sanitizeRecord,
  saveRecord,
} from "./higher-lower";
import {
  RANKING_STORAGE_KEY,
  getRanking,
  recordChoice,
  sanitizeRanking,
  saveRanking,
} from "./ranking";
import { BACKUP_FORMAT, BACKUP_VERSION, EMPTY_STORES, parseBackup } from "./portable-data";

const DAY = "2026-08-01";
const INVALID_NUMBERS: unknown[] = [
  null,
  true,
  false,
  [],
  [9],
  {},
  { toString: null },
  { valueOf: null, toString: null },
];

let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    },
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("numeric personal data recovery", () => {
  it.each(INVALID_NUMBERS.map((value) => [value]))("repairs invalid numeric fields independently (%j)", (value) => {
    expect(sanitizeRanking({
      "movie-1": { rating: 1800, matches: 20 },
      "movie-2": { rating: value, matches: 10 },
      "movie-3": { rating: 1600, matches: value },
    })).toEqual({
      "movie-1": { rating: 1800, matches: 20 },
      "movie-3": { rating: 1600, matches: 0 },
    });
    expect(sanitizeRecord({ best: 12, totalRounds: value })).toEqual({ best: 12, totalRounds: 0 });
    expect(sanitizeGameState({ ...EMPTY_STATE, bestStreak: 12, played: value })).toMatchObject({
      bestStreak: 12,
      played: 0,
    });
  });

  it("retains legitimate numeric strings from older data", () => {
    expect(sanitizeRanking({ "movie-1": { rating: "1620.5", matches: "3" } })).toEqual({
      "movie-1": { rating: 1620.5, matches: 3 },
    });
    expect(sanitizeRecord({ best: "12", totalRounds: "340" })).toEqual({ best: 12, totalRounds: 340 });
    expect(sanitizeGameState({ bestStreak: "12", played: "340" })).toMatchObject({
      bestStreak: 12,
      played: 340,
    });
    const parsed = parseBackup({
      format: BACKUP_FORMAT,
      version: "3",
      ...EMPTY_STORES,
      goal: { year: "2026", target: "52" },
      watchlist: [{ id: 550, mediaType: "movie", voteAverage: "8.4" }],
    });
    expect(parsed?.version).toBe(3);
    expect(parsed?.goal).toEqual({ year: "2026", target: 52 });
    expect(parsed?.watchlist[0].voteAverage).toBe(8.4);
  });

  it("preserves prior comparisons through reading, voting and saving beside a malformed entry", () => {
    storage.set(RANKING_STORAGE_KEY, JSON.stringify({
      "movie-1": { rating: 1800, matches: 20 },
      "movie-2": { rating: 1600, matches: 10 },
      "movie-3": { rating: { toString: null }, matches: 3 },
      "movie-4": { rating: 1700, matches: 7 },
    }));

    const current = getRanking();
    expect(current["movie-1"]).toEqual({ rating: 1800, matches: 20 });
    expect(saveRanking(recordChoice(current, "movie-1", "movie-2"))).toBe(true);

    const saved = getRanking();
    expect(saved["movie-1"].matches).toBe(21);
    expect(saved["movie-2"].matches).toBe(11);
    expect(saved["movie-4"]).toEqual({ rating: 1700, matches: 7 });
    expect(saved).not.toHaveProperty("movie-3");
  });

  it("preserves the daily game's history and streak when saving after a malformed distribution count", () => {
    const initial = {
      ...EMPTY_STATE,
      lastResultDay: "2026-07-31",
      currentStreak: 4,
      bestStreak: 12,
      played: 30,
      won: 20,
      distribution: [{ toString: null }, 4, 3, 2, 1, 0],
      history: { "2026-07-31": "won" },
    };
    storage.set(DAILY_GAME_STORAGE_KEY, JSON.stringify(initial));

    const current = getGameStateSnapshot();
    expect(saveGameState(recordGuess(current, DAY, { id: 550, title: "Fight Club", correct: false }))).toBe(true);

    const saved = getGameStateSnapshot();
    expect(saved).toMatchObject({
      lastResultDay: initial.lastResultDay,
      currentStreak: 4,
      bestStreak: 12,
      played: 30,
      won: 20,
      history: initial.history,
      distribution: [0, 4, 3, 2, 1, 0],
    });
    expect(saved.today?.guesses).toEqual([{ id: 550, title: "Fight Club", correct: false }]);
  });

  it("preserves the standing best when another malformed field is repaired and a round is saved", () => {
    storage.set(HIGHER_LOWER_STORAGE_KEY, JSON.stringify({ best: 12, totalRounds: { toString: null } }));

    expect(saveRecord(recordRound(getRecord(), 3))).toBe(true);
    expect(getRecord()).toEqual({ best: 12, totalRounds: 1 });
  });

  it.each(INVALID_NUMBERS.map((value) => [value]))("imports the usable parts of a backup with malformed numeric fields (%j)", (value) => {
    const parsed = parseBackup(JSON.parse(JSON.stringify({
      format: BACKUP_FORMAT,
      version: value,
      exportedAt: "2026-08-01T12:00:00.000Z",
      ...EMPTY_STORES,
      activeProfile: { id: "default", name: "Me" },
      otherProfiles: [{
        ...EMPTY_STORES,
        id: "p2",
        name: "Second",
        ranking: { "movie-9": { rating: 1800, matches: value } },
      }],
      ranking: {
        "movie-1": { rating: 1800, matches: 20 },
        "movie-2": { rating: value, matches: 10 },
      },
      dailyGame: { ...EMPTY_STATE, bestStreak: 12, played: value },
      higherLower: { best: 12, totalRounds: value },
      goal: { year: "2026", target: value },
      watchlist: [{ id: 550, mediaType: "movie", title: "Fight Club", voteAverage: value }],
    })));

    expect(parsed?.version).toBe(BACKUP_VERSION);
    expect(parsed?.ranking).toEqual({ "movie-1": { rating: 1800, matches: 20 } });
    expect(parsed?.dailyGame).toMatchObject({ bestStreak: 12, played: 0 });
    expect(parsed?.higherLower).toEqual({ best: 12, totalRounds: 0 });
    expect(parsed?.goal).toBeNull();
    expect(parsed?.watchlist[0]).toMatchObject({ id: 550, title: "Fight Club", voteAverage: 0 });
    expect(parsed?.otherProfiles[0].ranking).toEqual({ "movie-9": { rating: 1800, matches: 0 } });
  });
});
