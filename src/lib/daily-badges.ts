import { MAX_GUESSES } from "./daily-puzzle";
import { archiveSolvedCount, type DailyGameState } from "./daily-game";
import { pick, type Locale, type Localized } from "@/i18n/locale";

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
  label: Localized;
  description: Localized;
  emoji: string;
  /** The number reached so far, and the number that earns the badge. */
  measure: (state: DailyGameState) => number;
  target: number;
}

const SPECS: BadgeSpec[] = [
  {
    id: "first-win",
    label: { en: "First blood", cs: "Prvotina" },
    description: { en: "Solve your first puzzle.", cs: "Vyřešte svou první hádanku." },
    emoji: "🎬",
    measure: (state) => state.won,
    target: 1,
  },
  {
    id: "streak-3",
    label: { en: "Three in a row", cs: "Tři v řadě" },
    description: { en: "Win three days running.", cs: "Vyhrajte tři dny po sobě." },
    emoji: "🔥",
    measure: (state) => state.bestStreak,
    target: 3,
  },
  {
    id: "streak-7",
    label: { en: "A full week", cs: "Celý týden" },
    description: { en: "Win seven days running.", cs: "Vyhrajte sedm dní po sobě." },
    emoji: "🗓️",
    measure: (state) => state.bestStreak,
    target: 7,
  },
  {
    id: "streak-30",
    label: { en: "A month of mornings", cs: "Měsíc ranních hádanek" },
    description: { en: "Win thirty days running.", cs: "Vyhrajte třicet dní po sobě." },
    emoji: "🏆",
    measure: (state) => state.bestStreak,
    target: 30,
  },
  {
    id: "sniper",
    label: { en: "Sniper", cs: "Odstřelovač" },
    description: {
      en: "Get one on the very first guess.",
      cs: "Uhodněte film hned na první tip.",
    },
    emoji: "🎯",
    // Index 0 of the distribution is exactly the first-guess wins.
    measure: (state) => state.distribution[0] ?? 0,
    target: 1,
  },
  {
    id: "clutch",
    label: { en: "Down to the wire", cs: "Za pět dvanáct" },
    description: { en: `Win on your last guess.`, cs: "Vyhrajte až posledním tipem." },
    emoji: "😅",
    measure: (state) => state.distribution[MAX_GUESSES - 1] ?? 0,
    target: 1,
  },
  {
    id: "played-10",
    label: { en: "Regular", cs: "Štamgast" },
    description: { en: "Play ten puzzles.", cs: "Zahrajte si deset hádanek." },
    emoji: "🍿",
    measure: (state) => state.played,
    target: 10,
  },
  {
    id: "played-50",
    label: { en: "Devoted", cs: "Srdcař" },
    description: { en: "Play fifty puzzles.", cs: "Zahrajte si padesát hádanek." },
    emoji: "🎞️",
    measure: (state) => state.played,
    target: 50,
  },
  {
    id: "archivist",
    label: { en: "Archivist", cs: "Archivář" },
    description: {
      en: "Catch up on five puzzles you missed.",
      cs: "Dožeňte pět hádanek, které jste vynechali.",
    },
    emoji: "📼",
    // Catch-ups only: a day with a result from the day is never counted, even
    // where an older version let the archive replay it.
    measure: archiveSolvedCount,
    target: 5,
  },
];

export function badgesFor(
  state: DailyGameState,
  locale: Locale = "en",
): Badge[] {
  return SPECS.map((spec) => {
    const current = spec.measure(state);

    return {
      id: spec.id,
      label: pick(locale, spec.label),
      description: pick(locale, spec.description),
      emoji: spec.emoji,
      earned: current >= spec.target,
      progress:
        spec.target > 1
          ? { current: Math.min(current, spec.target), target: spec.target }
          : undefined,
    };
  });
}

export const TOTAL_BADGES = SPECS.length;
