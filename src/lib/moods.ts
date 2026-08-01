import type { FilterOptions } from "@/types/filters";

/**
 * Moods: the way people actually describe what they want to watch.
 *
 * Nobody opens a site wanting "Drama, 2019, sorted by popularity". They want
 * something funny, or something that will not ask much of them at eleven at
 * night. Genre pages cannot express that – "cosy" is not a genre and never will
 * be – so each mood here is a hand-built TMDB query: genres, keywords, a runtime
 * bound, a vote floor.
 *
 * They are also the only part of the discovery side that is worth landing on from
 * a search engine, which is why these are ordinary server-rendered pages rather
 * than another filter in the bar.
 *
 * Keyword IDs are TMDB's own. They are stable; the names beside them are for
 * whoever reads this next.
 */

export interface Mood {
  slug: string;
  label: string;
  /** One line, shown under the heading and used as the meta description. */
  description: string;
  emoji: string;
  /** Tailwind classes for the card, so the grid does not read as one grey block. */
  accent: string;
  movie: FilterOptions;
  /** Absent where the mood only makes sense as a film. */
  tv?: FilterOptions;
}

// Enough voters that the results are films people have actually seen. Discover
// without a floor is dominated by titles rated 10/10 by four people.
const VOTE_FLOOR = 400;
const TV_VOTE_FLOOR = 150;

export const MOODS: Mood[] = [
  {
    slug: "easy-watch",
    label: "Something easy",
    description:
      "Comfortable, warm and not too demanding. For an evening that has already asked enough of you.",
    emoji: "🛋️",
    accent: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
    movie: {
      // Comedy, family, romance.
      genre: "35",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.5,
      withRuntimeLte: 110,
    },
    tv: {
      genre: "35",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "mind-bending",
    label: "Mind-bending",
    description:
      "Films that fold back on themselves. Bring your full attention – you will need it.",
    emoji: "🌀",
    accent: "from-purple-500/20 to-indigo-500/10 border-purple-500/30",
    movie: {
      // time travel | nonlinear timeline | psychological thriller. OR rather
      // than AND: each one describes the shape on its own, and requiring all
      // three would return a handful of films.
      withKeywords: "4379|157171|12565",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.5,
    },
  },
  {
    slug: "under-90-minutes",
    label: "Under 90 minutes",
    description:
      "Good films that respect your evening. Everything here is done inside an hour and a half.",
    emoji: "⏱️",
    accent: "from-sky-500/20 to-blue-500/10 border-sky-500/30",
    movie: {
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
      withRuntimeLte: 90,
      // Ten minutes rules out the shorts TMDB is full of, which are technically
      // films under ninety minutes and not what anyone means by the phrase.
      withRuntimeGte: 40,
    },
  },
  {
    slug: "edge-of-your-seat",
    label: "Edge of your seat",
    description:
      "Thrillers that keep tightening. For when you want to be gripped rather than moved.",
    emoji: "😰",
    accent: "from-red-500/20 to-rose-500/10 border-red-500/30",
    movie: {
      // Thriller + mystery.
      genre: "53,9648",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
    tv: {
      genre: "9648",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "have-a-cry",
    label: "Have a good cry",
    description:
      "Drama that earns it. Films people remember for how they felt at the end.",
    emoji: "😢",
    accent: "from-blue-500/20 to-cyan-500/10 border-blue-500/30",
    movie: {
      genre: "18",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7.5,
    },
  },
  {
    slug: "laugh-out-loud",
    label: "Actually funny",
    description:
      "Comedies that hold up. Rated by enough people that the laughs are not a fluke.",
    emoji: "😂",
    accent: "from-yellow-500/20 to-amber-500/10 border-yellow-500/30",
    movie: {
      genre: "35",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7,
    },
    tv: {
      genre: "35",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR * 2,
      minRating: 7.5,
    },
  },
  {
    slug: "lights-off",
    label: "Lights off",
    description:
      "Horror worth the dark. Nothing here is scraping the bottom of the genre.",
    emoji: "🕯️",
    accent: "from-slate-500/20 to-gray-500/10 border-slate-500/30",
    movie: {
      genre: "27",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.5,
    },
  },
  {
    slug: "true-story",
    label: "Based on a true story",
    description:
      "It happened. Biography, history and the films built out of real events.",
    emoji: "📰",
    accent: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
    movie: {
      // "based on true story". Deliberately not "based on a novel", which is a
      // different promise entirely.
      withKeywords: "9672",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "big-and-loud",
    label: "Big and loud",
    description:
      "Spectacle. The kind of thing that is worth the good speakers and a full screen.",
    emoji: "💥",
    accent: "from-orange-500/20 to-red-500/10 border-orange-500/30",
    movie: {
      // Action + adventure + science fiction.
      genre: "28,12",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 3,
      minRating: 7,
    },
  },
];

export function findMood(slug: string): Mood | undefined {
  return MOODS.find((mood) => mood.slug === slug);
}
