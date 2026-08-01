import { MAX_GUESSES } from "./daily-puzzle";
import { archiveSolvedCount, type DailyGameState } from "./daily-game";

/**
 * Badges for the daily puzzle.
 *
 * Derived from the state that already exists rather than stored: a badge is a
 * reading of the record, and computing it means there is nothing to migrate, keep
 * in sync, or repair when storage comes back malformed.
 *
 * They are all about *turning up* rather than about being clever – a run of days,
 * a puzzle caught up on, a first-guess win. That is the behaviour worth
 * rewarding, and the one a badge can honestly encourage.
 */

export interface Badge {
  id: string;
  label: string;
  description: string;
  /** Rendered as a plain glyph; no icon set covers this kind of thing well. */
  emoji: string;
  earned: boolean;
  /** How far along, for the ones that are a count. Absent when it is pass/fail. */
  progress?: { current: number; target: number };
}

interface BadgeSpec {
  id: string;
  label: string;
  description: string;
  emoji: string;
  /** The number reached so far, and the number that earns the badge. */
  measure: (state: DailyGameState) => number;
  target: number;
}

const SPECS: BadgeSpec[] = [
  {
    id: "first-win",
    label: "First blood",
    description: "Solve your first puzzle.",
    emoji: "🎬",
    measure: (state) => state.won,
    target: 1,
  },
  {
    id: "streak-3",
    label: "Three in a row",
    description: "Win three days running.",
    emoji: "🔥",
    measure: (state) => state.bestStreak,
    target: 3,
  },
  {
    id: "streak-7",
    label: "A full week",
    description: "Win seven days running.",
    emoji: "🗓️",
    measure: (state) => state.bestStreak,
    target: 7,
  },
  {
    id: "streak-30",
    label: "A month of mornings",
    description: "Win thirty days running.",
    emoji: "🏆",
    measure: (state) => state.bestStreak,
    target: 30,
  },
  {
    id: "sniper",
    label: "Sniper",
    description: "Get one on the very first guess.",
    emoji: "🎯",
    // Index 0 of the distribution is exactly the first-guess wins.
    measure: (state) => state.distribution[0] ?? 0,
    target: 1,
  },
  {
    id: "clutch",
    label: "Down to the wire",
    description: `Win on your last guess.`,
    emoji: "😅",
    measure: (state) => state.distribution[MAX_GUESSES - 1] ?? 0,
    target: 1,
  },
  {
    id: "played-10",
    label: "Regular",
    description: "Play ten puzzles.",
    emoji: "🍿",
    measure: (state) => state.played,
    target: 10,
  },
  {
    id: "played-50",
    label: "Devoted",
    description: "Play fifty puzzles.",
    emoji: "🎞️",
    measure: (state) => state.played,
    target: 50,
  },
  {
    id: "archivist",
    label: "Archivist",
    description: "Catch up on five puzzles you missed.",
    emoji: "📼",
    measure: archiveSolvedCount,
    target: 5,
  },
];

export function badgesFor(state: DailyGameState): Badge[] {
  return SPECS.map((spec) => {
    const current = spec.measure(state);

    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      emoji: spec.emoji,
      earned: current >= spec.target,
      progress:
        spec.target > 1
          ? { current: Math.min(current, spec.target), target: spec.target }
          : undefined,
    };
  });
}

export function earnedBadgeCount(state: DailyGameState): number {
  return badgesFor(state).filter((badge) => badge.earned).length;
}

export const TOTAL_BADGES = SPECS.length;
