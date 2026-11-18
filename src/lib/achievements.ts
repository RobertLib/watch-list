import type { WatchStats } from "./stats";
import type { Locale, Localized } from "@/i18n/locale";

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
  label: Localized;
  description: Localized;
  emoji: string;
  measure: (stats: WatchStats) => number;
  target: number;
}

const SPECS: AchievementSpec[] = [
  {
    id: "first-ten",
    label: { en: "Getting started", cs: "První krůčky" },
    description: { en: "Ten titles watched.", cs: "Deset zhlédnutých titulů." },
    emoji: "🌱",
    measure: (stats) => stats.totalTitles,
    target: 10,
  },
  {
    id: "century",
    label: { en: "Century", cs: "Stovka" },
    description: { en: "A hundred titles watched.", cs: "Sto zhlédnutých titulů." },
    emoji: "💯",
    measure: (stats) => stats.totalTitles,
    target: 100,
  },
  {
    id: "binger",
    label: { en: "Binger", cs: "Epizoda za epizodou" },
    description: { en: "A hundred episodes ticked off.", cs: "Sto odškrtnutých epizod." },
    emoji: "📺",
    measure: (stats) => stats.episodes,
    target: 100,
  },
  {
    id: "marathon",
    label: { en: "Marathon", cs: "Maraton" },
    description: { en: "A hundred hours of screen time.", cs: "Sto hodin před obrazovkou." },
    emoji: "🏃",
    measure: (stats) => Math.floor(stats.minutes / 60),
    target: 100,
  },
  {
    id: "omnivore",
    label: { en: "Omnivore", cs: "Od všeho trochu" },
    description: {
      en: "Watched something from six different genres.",
      cs: "Zhlédli jste něco ze šesti různých žánrů.",
    },
    emoji: "🍽️",
    measure: (stats) => stats.topGenres.length,
    target: 6,
  },
  {
    id: "time-traveller",
    label: { en: "Time traveller", cs: "Cesta časem" },
    description: {
      en: "Watched something from four different decades.",
      cs: "Zhlédli jste něco ze čtyř různých desetiletí.",
    },
    emoji: "🕰️",
    measure: (stats) => stats.decades.length,
    target: 4,
  },
  {
    id: "critic",
    label: { en: "Critic", cs: "Kritické oko" },
    description: {
      en: "Scored twenty-five titles of your own.",
      cs: "Ohodnotili jste dvacet pět titulů.",
    },
    emoji: "⭐",
    measure: (stats) => stats.ratedCount,
    target: 25,
  },
  {
    id: "completionist",
    label: { en: "Series watcher", cs: "Seriálová vášeň" },
    description: { en: "Finished twenty-five series.", cs: "Dokončili jste dvacet pět seriálů." },
    emoji: "📚",
    measure: (stats) => stats.series,
    target: 25,
  },
];

export function achievementsFor(
  stats: WatchStats,
  locale: Locale = "en",
): Achievement[] {
  return SPECS.map((spec) => {
    const current = spec.measure(stats);

    return {
      id: spec.id,
      label: spec.label[locale],
      description: spec.description[locale],
      emoji: spec.emoji,
      earned: current >= spec.target,
      progress: { current: Math.min(current, spec.target), target: spec.target },
    };
  });
}

export const TOTAL_ACHIEVEMENTS = SPECS.length;
