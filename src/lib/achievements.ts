import type { WatchStats } from "./stats";

/**
 * Achievements for the watching record, as opposed to the puzzle's badges.
 *
 * Same reasoning as `daily-badges.ts`: derived from state that already exists, so
 * there is nothing to store, migrate or repair. What differs is what they
 * reward – these are about breadth and persistence, the two things a tracker can
 * see and a streak cannot.
 */

export interface Achievement {
  id: string;
  label: string;
  description: string;
  emoji: string;
  earned: boolean;
  progress: { current: number; target: number };
}

interface AchievementSpec {
  id: string;
  label: string;
  description: string;
  emoji: string;
  measure: (stats: WatchStats) => number;
  target: number;
}

const SPECS: AchievementSpec[] = [
  {
    id: "first-ten",
    label: "Getting started",
    description: "Ten titles watched.",
    emoji: "🌱",
    measure: (stats) => stats.totalTitles,
    target: 10,
  },
  {
    id: "century",
    label: "Century",
    description: "A hundred titles watched.",
    emoji: "💯",
    measure: (stats) => stats.totalTitles,
    target: 100,
  },
  {
    id: "binger",
    label: "Binger",
    description: "A hundred episodes ticked off.",
    emoji: "📺",
    measure: (stats) => stats.episodes,
    target: 100,
  },
  {
    id: "marathon",
    label: "Marathon",
    description: "A hundred hours of screen time.",
    emoji: "🏃",
    measure: (stats) => Math.floor(stats.minutes / 60),
    target: 100,
  },
  {
    id: "omnivore",
    label: "Omnivore",
    description: "Watched something from six different genres.",
    emoji: "🍽️",
    measure: (stats) => stats.topGenres.length,
    target: 6,
  },
  {
    id: "time-traveller",
    label: "Time traveller",
    description: "Watched something from four different decades.",
    emoji: "🕰️",
    measure: (stats) => stats.decades.length,
    target: 4,
  },
  {
    id: "critic",
    label: "Critic",
    description: "Scored twenty-five titles of your own.",
    emoji: "⭐",
    measure: (stats) => stats.ratedCount,
    target: 25,
  },
  {
    id: "completionist",
    label: "Series watcher",
    description: "Finished twenty-five series.",
    emoji: "📚",
    measure: (stats) => stats.series,
    target: 25,
  },
];

export function achievementsFor(stats: WatchStats): Achievement[] {
  return SPECS.map((spec) => {
    const current = spec.measure(stats);

    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      emoji: spec.emoji,
      earned: current >= spec.target,
      progress: { current: Math.min(current, spec.target), target: spec.target },
    };
  });
}

export const TOTAL_ACHIEVEMENTS = SPECS.length;
