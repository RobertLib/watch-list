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
 * a search engine, which is why these are ordinary pages rather
 * than another filter in the bar.
 *
 * And why there are sixty of them rather than nine. A genre page is "the most
 * popular action films right now", which a hundred sites have; a list of heist
 * films, of films under ninety minutes, of the best of the 1990s, is a thing
 * people ask for by name ("best heist movies") and a thing a genre cannot say.
 * So the table grew sideways – themes, decades, languages, the time of year –
 * and each entry still has to earn its place the way the first nine did: a
 * query that returns a real shelf (checked against TMDB when it was written –
 * the ones that came back with a dozen titles, or with the wrong ones, are not
 * here), and a description written for it rather than generated from its name.
 *
 * Keyword IDs are TMDB's own. They are stable; the names beside them are for
 * whoever reads this next.
 */

/** The sections of `/moods`, in the order the page shows them. */
export const MOOD_GROUPS = [
  { id: "feeling", heading: "How you want to feel" },
  { id: "time", heading: "How long you have" },
  { id: "story", heading: "What it is about" },
  { id: "season", heading: "The time of year" },
  { id: "world", heading: "Where it is from" },
  { id: "era", heading: "When it was made" },
] as const;

export type MoodGroup = (typeof MOOD_GROUPS)[number]["id"];

export interface Mood {
  slug: string;
  /** The name in the app's own voice – the card, the chip, the eyebrow. */
  label: string;
  /**
   * What the page is called where a name has to say what is on it: the `<h1>`
   * and the `<title>`. "Something easy" is a good card and a bad heading – it
   * does not say films, and nobody searches for it – so the page is headed
   * "Feel-Good Movies & TV Shows" and keeps the label as the line above.
   */
  title: string;
  /** One line, shown under the heading and used as the meta description. */
  description: string;
  emoji: string;
  /** Tailwind classes for the card, so the grid does not read as one grey block. */
  accent: string;
  group: MoodGroup;
  /** Absent where the mood only makes sense as a series. At least one of the two. */
  movie?: FilterOptions;
  /** Absent where the mood only makes sense as a film. */
  tv?: FilterOptions;
  /**
   * Whether the mood also has a page per streaming platform –
   * `/mood/christmas/netflix`. For the few that people ask for that way
   * ("feel-good movies on Netflix"), not for all sixty: seven platforms each
   * would be four hundred pages, most of them a shelf of three. See
   * `streaming-landing.ts` for the same restraint on the genres.
   */
  platforms?: boolean;
}

/**
 * The card colours. Written out as whole class names because Tailwind finds
 * classes by reading the source for them: a name assembled from parts is a
 * class that was never generated.
 */
const ACCENT = {
  amber: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
  purple: "from-purple-500/20 to-indigo-500/10 border-purple-500/30",
  sky: "from-sky-500/20 to-blue-500/10 border-sky-500/30",
  red: "from-red-500/20 to-rose-500/10 border-red-500/30",
  blue: "from-blue-500/20 to-cyan-500/10 border-blue-500/30",
  yellow: "from-yellow-500/20 to-amber-500/10 border-yellow-500/30",
  slate: "from-slate-500/20 to-gray-500/10 border-slate-500/30",
  emerald: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
  orange: "from-orange-500/20 to-red-500/10 border-orange-500/30",
  pink: "from-pink-500/20 to-rose-500/10 border-pink-500/30",
  green: "from-green-500/20 to-emerald-500/10 border-green-500/30",
  indigo: "from-indigo-500/20 to-violet-500/10 border-indigo-500/30",
  teal: "from-teal-500/20 to-cyan-500/10 border-teal-500/30",
} as const;

// Enough voters that the results are films people have actually seen. Discover
// without a floor is dominated by titles rated 10/10 by four people.
const VOTE_FLOOR = 400;
const TV_VOTE_FLOOR = 150;

export const MOODS: Mood[] = [
  {
    slug: "easy-watch",
    label: "Something easy",
    title: "Feel-Good Movies & TV Shows",
    description:
      "Comfortable, warm and not too demanding. For an evening that has already asked enough of you.",
    emoji: "🛋️",
    accent: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
    group: "feeling",
    platforms: true,
    movie: {
      // Comedy | family | romance – any one of them. TMDB reads a comma in
      // `with_genres` as AND and a pipe as OR, and a film that is all three at
      // once is a narrow slice of what "something easy" means.
      genre: "35|10751|10749",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.5,
      withRuntimeLte: 110,
    },
    tv: {
      // Comedy | family. TMDB has no romance genre for series.
      genre: "35|10751",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "mind-bending",
    label: "Mind-bending",
    title: "Mind-Bending Movies",
    description:
      "Films that fold back on themselves. Bring your full attention – you will need it.",
    emoji: "🌀",
    accent: "from-purple-500/20 to-indigo-500/10 border-purple-500/30",
    group: "feeling",
    platforms: true,
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
    title: "Great Movies Under 90 Minutes",
    description:
      "Good films that respect your evening. Everything here is done inside an hour and a half.",
    emoji: "⏱️",
    accent: "from-sky-500/20 to-blue-500/10 border-sky-500/30",
    group: "time",
    platforms: true,
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
    title: "Best Thriller & Mystery Movies and Shows",
    description:
      "Thrillers that keep tightening. For when you want to be gripped rather than moved.",
    emoji: "😰",
    accent: "from-red-500/20 to-rose-500/10 border-red-500/30",
    group: "feeling",
    platforms: true,
    movie: {
      // Thriller | mystery. A pipe, not a comma: requiring both left out most
      // of the thrillers the description promises.
      genre: "53|9648",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
    tv: {
      // Mystery: TMDB has no thriller genre for series.
      genre: "9648",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "have-a-cry",
    label: "Have a good cry",
    title: "Sad Movies That Will Make You Cry",
    description:
      "Drama that earns it. Films people remember for how they felt at the end.",
    emoji: "😢",
    accent: "from-blue-500/20 to-cyan-500/10 border-blue-500/30",
    group: "feeling",
    platforms: true,
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
    title: "Funniest Comedy Movies & Shows",
    description:
      "Comedies that hold up. Rated by enough people that the laughs are not a fluke.",
    emoji: "😂",
    accent: "from-yellow-500/20 to-amber-500/10 border-yellow-500/30",
    group: "feeling",
    platforms: true,
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
    title: "Best Horror Movies",
    description:
      "Horror worth the dark. Nothing here is scraping the bottom of the genre.",
    emoji: "🕯️",
    accent: "from-slate-500/20 to-gray-500/10 border-slate-500/30",
    group: "feeling",
    platforms: true,
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
    title: "Best Movies Based on True Stories",
    description:
      "It happened. Biography, history and the films built out of real events.",
    emoji: "📰",
    accent: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
    group: "story",
    platforms: true,
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
    title: "Best Action-Adventure Movies",
    description:
      "Spectacle. The kind of thing that is worth the good speakers and a full screen.",
    emoji: "💥",
    accent: "from-orange-500/20 to-red-500/10 border-orange-500/30",
    group: "feeling",
    platforms: true,
    movie: {
      // Action AND adventure – the one mood where the intersection is the
      // point. Either genre alone is too wide for "spectacle": adventure on its
      // own is led by family animation, action on its own by small crime
      // films. Science fiction is not part of the query; a pipe would bring in
      // the quiet end of that genre too, and TMDB defines no precedence for
      // mixing commas and pipes.
      genre: "28,12",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 3,
      minRating: 7,
    },
  },
  // ---------------------------------------------------------------------
  // Everything below was added together, and checked against TMDB as it was
  // written: the count each query returned and the titles that led it. Where
  // a floor is higher than `VOTE_FLOOR`, it is because the lower one let a
  // month-old release with four hundred enthusiastic votes lead a list called
  // "best".
  // ---------------------------------------------------------------------

  {
    slug: "date-night",
    label: "Date night",
    title: "Best Romantic Comedies",
    description:
      "Romantic comedies that manage to be both – rarer than it sounds. Safe to put on with someone you like.",
    emoji: "💘",
    accent: ACCENT.pink,
    group: "feeling",
    movie: {
      // Comedy AND romance: the intersection is the genre. Either alone is not
      // what anyone means by a romcom.
      genre: "35,10749",
      sortBy: "vote_average.desc",
      voteCountGte: 1500,
      minRating: 7,
    },
  },
  {
    slug: "family-movie-night",
    label: "Family movie night",
    title: "Best Family Movies & Shows",
    description:
      "Films the children will sit through and the adults will not resent. Rated by enough people to trust.",
    emoji: "🍿",
    accent: ACCENT.green,
    group: "feeling",
    platforms: true,
    movie: {
      genre: "10751",
      sortBy: "vote_average.desc",
      voteCountGte: 2000,
      minRating: 7.3,
    },
    tv: {
      genre: "10751",
      sortBy: "vote_average.desc",
      voteCountGte: 400,
      minRating: 7.8,
    },
  },
  {
    slug: "dark-comedy",
    label: "Laughing at the wrong things",
    title: "Best Dark Comedies",
    description:
      "Comedy with a body count, or at least a conscience problem. For when cheerful will not do.",
    emoji: "🖤",
    accent: ACCENT.slate,
    group: "feeling",
    movie: {
      // "dark comedy".
      withKeywords: "10123",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
    tv: {
      withKeywords: "10123",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "hidden-gems",
    label: "Something you have not seen",
    title: "Hidden Gems: Underrated Movies & Shows",
    description:
      "Highly rated and barely watched. Good films and series that never had the marketing, all at least a few years old.",
    emoji: "💎",
    accent: ACCENT.teal,
    group: "feeling",
    movie: {
      // A ceiling on votes is what "barely watched" means here. The date is what
      // keeps it honest: without one the list was led by this month's releases,
      // which have few votes because they are new, not because they were missed.
      // A fixed date on purpose – it only gets truer.
      primaryReleaseDateLte: "2021-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      voteCountLte: 2000,
      minRating: 7.6,
    },
    tv: {
      firstAirDateLte: "2021-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      voteCountLte: 600,
      minRating: 8.2,
    },
  },
  {
    slug: "long-epics",
    label: "All evening",
    title: "Epic Movies Over 3 Hours",
    description:
      "Three hours and up, and worth every one. Clear the evening and warn the household.",
    emoji: "🏛️",
    accent: ACCENT.indigo,
    group: "time",
    movie: {
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7.3,
      withRuntimeGte: 180,
    },
  },
  {
    slug: "limited-series",
    label: "Over in a weekend",
    title: "Best Limited Series & Miniseries",
    description:
      "Series with the ending already written. One season, no cliffhanger, no eight-year commitment.",
    emoji: "📺",
    accent: ACCENT.sky,
    group: "time",
    tv: {
      // "miniseries". The first mood with no film half: the form is the point.
      withKeywords: "11162",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.8,
    },
  },
  {
    slug: "heist",
    label: "One last job",
    title: "Best Heist Movies",
    description:
      "The plan, the crew, the thing that goes wrong. Heists and bank jobs that earn the double-cross.",
    emoji: "💰",
    accent: ACCENT.emerald,
    group: "story",
    movie: {
      // heist | bank robbery.
      withKeywords: "10051|15363",
      sortBy: "vote_average.desc",
      voteCountGte: 600,
      minRating: 6.8,
    },
  },
  {
    slug: "time-travel",
    label: "Back and forth in time",
    title: "Best Time Travel Movies & Shows",
    description:
      "Time machines, time loops and the paradoxes that come with them. Some even make sense afterwards.",
    emoji: "⏳",
    accent: ACCENT.purple,
    group: "story",
    movie: {
      // time travel | time loop.
      withKeywords: "4379|10854",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
    tv: {
      withKeywords: "4379|10854",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "space",
    label: "Out there",
    title: "Best Space Movies & Shows",
    description:
      "Astronauts, missions and the long dark between stars. Space as a place people actually go.",
    emoji: "🚀",
    accent: ACCENT.indigo,
    group: "story",
    movie: {
      // space travel | astronaut | space mission | outer space. "space travel"
      // alone returned twenty-seven films.
      withKeywords: "3801|14626|4040|252634",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 6.8,
    },
    tv: {
      // The same, and space opera – on television that is most of it.
      withKeywords: "3801|14626|4040|252634|161176",
      sortBy: "vote_average.desc",
      voteCountGte: 300,
      minRating: 7.5,
    },
  },
  {
    slug: "dystopia",
    label: "The future went wrong",
    title: "Best Dystopian Movies & Shows",
    description:
      "Collapsed societies and what is left after. Bleak futures, well made, for when the present feels too comfortable.",
    emoji: "🏚️",
    accent: ACCENT.slate,
    group: "story",
    movie: {
      // dystopia | post-apocalyptic future.
      withKeywords: "4565|4458",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
    tv: {
      withKeywords: "4565|4458",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "zombies",
    label: "The dead walk",
    title: "Best Zombie Movies & Shows",
    description:
      "Outbreaks, barricades and the slow realisation about the neighbours. The undead at their best.",
    emoji: "🧟",
    accent: ACCENT.green,
    group: "story",
    movie: {
      withKeywords: "12377",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 6.5,
    },
    tv: {
      withKeywords: "12377",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "vampires",
    label: "After dark, with teeth",
    title: "Best Vampire Movies & Shows",
    description:
      "Counts, covens and the occasional flatshare. Vampires played for dread, for romance and for laughs.",
    emoji: "🧛",
    accent: ACCENT.red,
    group: "story",
    movie: {
      withKeywords: "3133",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.5,
    },
    tv: {
      withKeywords: "3133",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.3,
    },
  },
  {
    slug: "superheroes",
    label: "Capes on",
    title: "Best Superhero Movies & Shows",
    description:
      "Capes, masks and origin stories – the ones that hold up after the effects have dated.",
    emoji: "🦸",
    accent: ACCENT.blue,
    group: "story",
    movie: {
      withKeywords: "9715",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7,
    },
    tv: {
      withKeywords: "9715",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "spies",
    label: "Trust no one",
    title: "Best Spy Movies",
    description:
      "Double agents, dead drops and people who are not who they said. Espionage from the cold war to the gadget era.",
    emoji: "🕵️",
    accent: ACCENT.slate,
    group: "story",
    movie: {
      withKeywords: "470",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
  },
  {
    slug: "serial-killers",
    label: "Catch a killer",
    title: "Best Serial Killer Movies & Shows",
    description:
      "The hunt, the profile, the wrong suspect. Dark crime stories about the people who do it again.",
    emoji: "🔪",
    accent: ACCENT.red,
    group: "story",
    movie: {
      withKeywords: "10714",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
    tv: {
      withKeywords: "10714",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "whodunit",
    label: "Whodunit",
    title: "Best Murder Mystery Movies",
    description:
      "A body, a houseful of suspects and one person who has worked it out. Mysteries you can try to solve first.",
    emoji: "🔍",
    accent: ACCENT.amber,
    group: "story",
    movie: {
      withKeywords: "12570",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
  },
  {
    slug: "coming-of-age",
    label: "Growing up",
    title: "Best Coming-of-Age Movies & Shows",
    description:
      "First jobs, first loves, last summers. Stories about the year everything changed.",
    emoji: "🌱",
    accent: ACCENT.green,
    group: "story",
    movie: {
      withKeywords: "10683",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7.3,
    },
    tv: {
      withKeywords: "10683",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.8,
    },
  },
  {
    slug: "road-trip",
    label: "On the road",
    title: "Best Road Trip Movies",
    description:
      "Two people, one car and a destination that turns out not to be the point.",
    emoji: "🛣️",
    accent: ACCENT.orange,
    group: "story",
    movie: {
      withKeywords: "7312",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
  },
  {
    slug: "revenge",
    label: "Payback",
    title: "Best Revenge Movies",
    description:
      "Someone was wronged and has had time to think about it. Vengeance, served at every temperature.",
    emoji: "⚔️",
    accent: ACCENT.red,
    group: "story",
    movie: {
      withKeywords: "9748",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7.2,
    },
  },
  {
    slug: "survival",
    label: "Against the odds",
    title: "Best Survival Movies",
    description:
      "Stranded, hunted or simply very cold. People with one job left: getting through it.",
    emoji: "🏔️",
    accent: ACCENT.sky,
    group: "story",
    movie: {
      withKeywords: "10349",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
  },
  {
    slug: "sports",
    label: "Underdogs",
    title: "Best Sports Movies",
    description:
      "Training montages, final rounds and the team nobody rated. You do not have to like the sport.",
    emoji: "🥊",
    accent: ACCENT.orange,
    group: "story",
    movie: {
      // sports | boxing, which TMDB files separately.
      withKeywords: "6075|209476",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 7,
    },
  },
  {
    slug: "musicals",
    label: "Break into song",
    title: "Best Movie Musicals",
    description:
      "Films where the feelings get too big for dialogue. Stage classics, animated standards and a few surprises.",
    emoji: "🎶",
    accent: ACCENT.pink,
    group: "story",
    movie: {
      withKeywords: "4344",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "anime",
    label: "Anime night",
    title: "Best Anime Movies & Series",
    description:
      "Features and series from Japan's animation studios: the ones people recommend first, and the ones they recommend next.",
    emoji: "🎌",
    accent: ACCENT.pink,
    group: "story",
    platforms: true,
    movie: {
      withKeywords: "210024",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7.5,
    },
    tv: {
      withKeywords: "210024",
      sortBy: "vote_average.desc",
      voteCountGte: 300,
      minRating: 8.2,
    },
  },
  {
    slug: "mafia",
    label: "Family business",
    title: "Best Mafia & Gangster Movies and Shows",
    description:
      "Made men, crime families and the price of loyalty. The mob, from the street corner to the commission.",
    emoji: "🎩",
    accent: ACCENT.slate,
    group: "story",
    movie: {
      // mafia | gangster.
      withKeywords: "10391|3149",
      sortBy: "vote_average.desc",
      voteCountGte: 600,
      minRating: 7.2,
    },
    tv: {
      withKeywords: "10391|3149",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.8,
    },
  },
  {
    slug: "true-crime",
    label: "True crime",
    title: "Best True Crime Series",
    description:
      "Real cases, real investigations, and dramas built closely on them. Hard to stop and harder to shake.",
    emoji: "🚨",
    accent: ACCENT.red,
    group: "story",
    tv: {
      // "true crime". Series only: as films the keyword returned six.
      withKeywords: "33722",
      sortBy: "vote_average.desc",
      voteCountGte: 100,
      minRating: 7.3,
    },
  },
  {
    slug: "documentaries",
    label: "Learn something",
    title: "Best Documentaries",
    description:
      "Real people, real places, no script. Documentaries that send you looking things up afterwards.",
    emoji: "🎥",
    accent: ACCENT.teal,
    group: "story",
    movie: {
      // A higher floor than most: at four hundred votes the list was led by
      // concert films rated by their fandoms.
      genre: "99",
      sortBy: "vote_average.desc",
      voteCountGte: 500,
      minRating: 7.5,
    },
    tv: {
      genre: "99",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 8,
    },
  },
  {
    slug: "war",
    label: "In the trenches",
    title: "Best War Movies & Shows",
    description:
      "Combat, occupation and the people caught in between. War films that are about more than the fighting.",
    emoji: "🪖",
    accent: ACCENT.emerald,
    group: "story",
    movie: {
      genre: "10752",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7.4,
    },
    tv: {
      // War & Politics: TMDB has no plain war genre for series.
      genre: "10768",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 8,
    },
  },
  {
    slug: "world-war-2",
    label: "1939 to 1945",
    title: "Best World War II Movies",
    description:
      "The Second World War on screen: the fronts, the camps, the resistance and the home front.",
    emoji: "🎖️",
    accent: ACCENT.amber,
    group: "story",
    movie: {
      withKeywords: "1956",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 7.3,
    },
  },
  {
    slug: "westerns",
    label: "High noon",
    title: "Best Westerns",
    description:
      "Dust, debts and a stranger riding in. Classic westerns, spaghetti westerns and the modern kind.",
    emoji: "🤠",
    accent: ACCENT.amber,
    group: "story",
    movie: {
      genre: "37",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7.2,
    },
    tv: {
      genre: "37",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "artificial-intelligence",
    label: "The machines are thinking",
    title: "Best Movies About Artificial Intelligence",
    description:
      "Robots, androids and programs with ideas of their own. Fiction about AI, from long before it was news.",
    emoji: "🤖",
    accent: ACCENT.blue,
    group: "story",
    movie: {
      // artificial intelligence (a.i.) | robot.
      withKeywords: "310|14544",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
  },
  {
    slug: "aliens",
    label: "We are not alone",
    title: "Best Alien Movies & Shows",
    description:
      "First contact, invasions and things found in the ice. Visitors, friendly and very much otherwise.",
    emoji: "👽",
    accent: ACCENT.green,
    group: "story",
    movie: {
      withKeywords: "9951",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.8,
    },
    tv: {
      withKeywords: "9951",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "supernatural-horror",
    label: "Something in the house",
    title: "Best Supernatural Horror Movies",
    description:
      "Hauntings, possessions and doors that should have stayed shut. Horror you cannot reason with.",
    emoji: "👻",
    accent: ACCENT.purple,
    group: "story",
    movie: {
      // supernatural horror | haunted house.
      withKeywords: "256183|3358",
      sortBy: "vote_average.desc",
      voteCountGte: 600,
      minRating: 6.5,
    },
  },
  {
    slug: "slashers",
    label: "Do not go upstairs",
    title: "Best Slasher Movies",
    description:
      "A mask, a blade and a cast that keeps splitting up. The classics and the ones that learned from them.",
    emoji: "🩸",
    accent: ACCENT.red,
    group: "story",
    movie: {
      withKeywords: "12339",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.2,
    },
  },
  {
    slug: "psychological-thrillers",
    label: "In your head",
    title: "Best Psychological Thrillers",
    description:
      "Unreliable narrators, obsession and slow unravelling. Thrillers where the danger is what someone believes.",
    emoji: "🧠",
    accent: ACCENT.purple,
    group: "story",
    movie: {
      withKeywords: "12565",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "neo-noir",
    label: "Rain on neon",
    title: "Best Neo-Noir Movies",
    description:
      "Night streets, compromised detectives and deals that go bad. Noir, after the black-and-white era.",
    emoji: "🌃",
    accent: ACCENT.indigo,
    group: "story",
    movie: {
      withKeywords: "207268",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 7,
    },
  },
  {
    slug: "based-on-books",
    label: "Read it first",
    title: "Best Movies & Shows Based on Books",
    description:
      "Adaptations that did the book justice, or outdid it. Novels, memoirs and the odd doorstop fantasy.",
    emoji: "📚",
    accent: ACCENT.amber,
    group: "story",
    movie: {
      // "based on novel or book" – several thousand films, hence the floor.
      withKeywords: "818",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 5,
      minRating: 7.6,
    },
    tv: {
      withKeywords: "818",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 8,
    },
  },
  {
    slug: "stand-up",
    label: "One mic",
    title: "Best Stand-Up Comedy Specials",
    description:
      "One person, one microphone, an hour. The specials people still quote.",
    emoji: "🎤",
    accent: ACCENT.yellow,
    group: "story",
    movie: {
      // A low floor on purpose: a special is watched by far fewer people than a
      // film, and four hundred votes left a dozen.
      withKeywords: "9716",
      sortBy: "vote_average.desc",
      voteCountGte: 100,
      minRating: 7,
    },
  },
  {
    slug: "prison",
    label: "Doing time",
    title: "Best Prison Movies",
    description:
      "Life inside, and the plans to leave it. Escapes, wrongful convictions and the long wait.",
    emoji: "⛓️",
    accent: ACCENT.slate,
    group: "story",
    movie: {
      withKeywords: "378",
      sortBy: "vote_average.desc",
      voteCountGte: 600,
      minRating: 7,
    },
  },
  {
    slug: "lgbtq",
    label: "Queer stories",
    title: "Best LGBTQ+ Movies & Shows",
    description:
      "Love stories, coming-out stories and stories where it is simply who the characters are.",
    emoji: "🏳️‍🌈",
    accent: ACCENT.pink,
    group: "story",
    movie: {
      withKeywords: "158718",
      sortBy: "vote_average.desc",
      voteCountGte: 600,
      minRating: 7.3,
    },
    tv: {
      withKeywords: "158718",
      sortBy: "vote_average.desc",
      voteCountGte: 300,
      minRating: 7.8,
    },
  },
  {
    slug: "christmas",
    label: "Christmas",
    title: "Best Christmas Movies",
    description:
      "Snow, reconciliations and one or two films that only happen to be set in December. The ones worth an annual rewatch.",
    emoji: "🎄",
    accent: ACCENT.emerald,
    group: "season",
    platforms: true,
    movie: {
      withKeywords: "207317",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.5,
    },
  },
  {
    slug: "halloween",
    label: "Halloween night",
    title: "Best Halloween Movies",
    description:
      "Pumpkins, costumes and things that come out on the 31st. From family-friendly spooky to genuinely not.",
    emoji: "🎃",
    accent: ACCENT.orange,
    group: "season",
    movie: {
      withKeywords: "3335",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR,
      minRating: 6.2,
    },
  },
  {
    slug: "korean",
    label: "From Korea",
    title: "Best Korean Movies & K-Dramas",
    description:
      "Korean cinema and K-dramas at their most acclaimed: thrillers, revenge, romance and the series everyone binged.",
    emoji: "🇰🇷",
    accent: ACCENT.blue,
    group: "world",
    movie: {
      withOriginalLanguage: "ko",
      sortBy: "vote_average.desc",
      voteCountGte: 600,
      minRating: 7.3,
    },
    tv: {
      withOriginalLanguage: "ko",
      sortBy: "vote_average.desc",
      voteCountGte: 300,
      minRating: 8,
    },
  },
  {
    slug: "french",
    label: "En français",
    title: "Best French Movies",
    description:
      "French-language films that people outside France fell for too. Subtitles on; it is worth it.",
    emoji: "🇫🇷",
    accent: ACCENT.indigo,
    group: "world",
    movie: {
      withOriginalLanguage: "fr",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 7.5,
    },
  },
  {
    slug: "spanish-language",
    label: "En español",
    title: "Best Spanish-Language Movies & Series",
    description:
      "Films and series in Spanish, from Spain to Mexico to Argentina. Thrillers especially – they are very good at those.",
    emoji: "🌎",
    accent: ACCENT.yellow,
    group: "world",
    movie: {
      withOriginalLanguage: "es",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 7.4,
    },
    tv: {
      withOriginalLanguage: "es",
      sortBy: "vote_average.desc",
      voteCountGte: 400,
      minRating: 7.8,
    },
  },
  {
    slug: "classics",
    label: "Before 1970",
    title: "Best Classic Movies",
    description:
      "The films the others learned from. Everything here was made before 1970 and still plays.",
    emoji: "🎞️",
    accent: ACCENT.slate,
    group: "era",
    movie: {
      primaryReleaseDateLte: "1969-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7.8,
    },
  },
  {
    slug: "best-of-the-1970s",
    label: "The seventies",
    title: "Best Movies of the 1970s",
    description:
      "New Hollywood, paranoia thrillers and the first blockbusters. The decade the directors were left alone.",
    emoji: "🕺",
    accent: ACCENT.amber,
    group: "era",
    movie: {
      primaryReleaseDateGte: "1970-01-01",
      primaryReleaseDateLte: "1979-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7.4,
    },
  },
  {
    slug: "best-of-the-1980s",
    label: "The eighties",
    title: "Best Movies & Shows of the 1980s",
    description:
      "Synths, practical effects and the films a generation rewound. The eighties at their best.",
    emoji: "📼",
    accent: ACCENT.pink,
    group: "era",
    movie: {
      primaryReleaseDateGte: "1980-01-01",
      primaryReleaseDateLte: "1989-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 2,
      minRating: 7.3,
    },
    tv: {
      firstAirDateGte: "1980-01-01",
      firstAirDateLte: "1989-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR,
      minRating: 7.5,
    },
  },
  {
    slug: "best-of-the-1990s",
    label: "The nineties",
    title: "Best Movies & Shows of the 1990s",
    description:
      "Indie breakthroughs, peak thrillers and the last decade before everything was a franchise.",
    emoji: "💿",
    accent: ACCENT.teal,
    group: "era",
    movie: {
      primaryReleaseDateGte: "1990-01-01",
      primaryReleaseDateLte: "1999-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 3,
      minRating: 7.4,
    },
    tv: {
      firstAirDateGte: "1990-01-01",
      firstAirDateLte: "1999-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR * 2,
      minRating: 7.8,
    },
  },
  {
    slug: "best-of-the-2000s",
    label: "The two-thousands",
    title: "Best Movies & Shows of the 2000s",
    description:
      "Trilogies, prestige television finding its feet, and animation growing up. The best of 2000 to 2009.",
    emoji: "📀",
    accent: ACCENT.sky,
    group: "era",
    movie: {
      primaryReleaseDateGte: "2000-01-01",
      primaryReleaseDateLte: "2009-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 3,
      minRating: 7.4,
    },
    tv: {
      firstAirDateGte: "2000-01-01",
      firstAirDateLte: "2009-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR * 2,
      minRating: 7.9,
    },
  },
  {
    slug: "best-of-the-2010s",
    label: "The twenty-tens",
    title: "Best Movies & Shows of the 2010s",
    description:
      "Peak TV, shared universes and a few films nobody saw coming. The best of 2010 to 2019.",
    emoji: "📱",
    accent: ACCENT.blue,
    group: "era",
    movie: {
      primaryReleaseDateGte: "2010-01-01",
      primaryReleaseDateLte: "2019-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: VOTE_FLOOR * 4,
      minRating: 7.5,
    },
    tv: {
      firstAirDateGte: "2010-01-01",
      firstAirDateLte: "2019-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: TV_VOTE_FLOOR * 3,
      minRating: 8,
    },
  },
  {
    slug: "best-of-the-2020s",
    label: "This decade so far",
    title: "Best Movies & Shows of the 2020s",
    description:
      "The best of the decade in progress, updated as it goes. Rated by enough people to count.",
    emoji: "🆕",
    accent: ACCENT.purple,
    group: "era",
    movie: {
      primaryReleaseDateGte: "2020-01-01",
      primaryReleaseDateLte: "2029-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: 2500,
      minRating: 7.5,
    },
    tv: {
      firstAirDateGte: "2020-01-01",
      firstAirDateLte: "2029-12-31",
      sortBy: "vote_average.desc",
      voteCountGte: 800,
      minRating: 8,
    },
  },
];

export function findMood(slug: string): Mood | undefined {
  return MOODS.find((mood) => mood.slug === slug);
}

/** The moods that also have a page per streaming platform. */
export function moodsWithPlatforms(): Mood[] {
  return MOODS.filter((mood) => mood.platforms);
}

/** "Movies", "TV Shows" or both – what a mood's page lists, for its title. */
export function moodMediaNoun(mood: Mood): string {
  if (mood.movie && mood.tv) return "Movies & TV Shows";
  return mood.movie ? "Movies" : "TV Shows";
}
