import { shiftDate, shiftYears } from "./dates";
import type { FilterOptions } from "@/types/filters";
import { t, type Locale } from "@/i18n/locale";

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: FilterOptions;
}

/**
 * Resolve relative dates against the subscribed local day, rather than the day
 * this module loaded. An empty day is the static-export hydration snapshot;
 * dated bounds wait for the browser, and callers wait before requesting data.
 *
 * The id is the URL's `?preset=` and stays the same in every language; only
 * the name and the description on the button are translated.
 */
export function getMoviePresets(
  today: string,
  locale: Locale = "en",
): FilterPreset[] {
  return [
    {
      id: "latest-blockbusters",
      name: t(locale, "Latest Blockbusters", "Nejnovější trháky"),
      description: t(
        locale,
        "Popular movies from the last 2 years",
        "Populární filmy z posledních 2 let",
      ),
      filters: {
        sortBy: "popularity.desc",
        ...(today ? {
          primaryReleaseDateGte: shiftYears(today, -2),
          primaryReleaseDateLte: today,
        } : {}),
        voteCountGte: 100,
      },
    },
    {
      id: "hidden-gems",
      name: t(locale, "Hidden Gems", "Skryté klenoty"),
      description: t(
        locale,
        "Highly rated movies you might have missed",
        "Vysoce hodnocené filmy, které vám možná unikly",
      ),
      filters: {
        sortBy: "popularity.asc",
        minRating: 7.5,
        voteCountGte: 300,
        ...(today ? {
          primaryReleaseDateGte: shiftYears(today, -10),
          primaryReleaseDateLte: shiftDate(today, -180),
        } : {}),
      },
    },
    {
      id: "recent-releases",
      name: t(locale, "Recent Releases", "Čerstvé novinky"),
      description: t(
        locale,
        "Movies released in the last 6 months",
        "Filmy z posledních 6 měsíců",
      ),
      filters: {
        sortBy: "primary_release_date.desc",
        ...(today ? {
          primaryReleaseDateGte: shiftDate(today, -180),
          primaryReleaseDateLte: today,
        } : {}),
        voteCountGte: 20,
      },
    },
    {
      id: "top-rated-classics",
      name: t(locale, "Top Rated Classics", "Nejlépe hodnocená klasika"),
      description: t(
        locale,
        "Highest rated movies released before 2015",
        "Nejlépe hodnocené filmy, které vyšly před rokem 2015",
      ),
      filters: {
        sortBy: "vote_average.desc",
        minRating: 8,
        voteCountGte: 2000,
        primaryReleaseDateLte: "2014-12-31",
      },
    },
  ];
}

export function getTVPresets(
  today: string,
  locale: Locale = "en",
): FilterPreset[] {
  return [
    {
      id: "trending-series",
      name: t(locale, "Trending Series", "Trendy"),
      description: t(
        locale,
        "Popular TV shows still running",
        "Oblíbené seriály, které se stále vysílají",
      ),
      filters: {
        sortBy: "popularity.desc",
        ...(today ? { firstAirDateLte: today } : {}),
        withStatus: 0,
        voteCountGte: 50,
      },
    },
    {
      id: "binge-worthy",
      name: t(locale, "Binge-Worthy", "Na jeden zátah"),
      description: t(
        locale,
        "Highly rated series worth watching through",
        "Vysoce hodnocené seriály, které stojí za to vidět celé",
      ),
      filters: {
        sortBy: "vote_average.desc",
        minRating: 8,
        voteCountGte: 1000,
      },
    },
    {
      id: "new-series",
      name: t(locale, "New Series", "Nové seriály"),
      description: t(
        locale,
        "TV shows that started this year",
        "Seriály, které začaly letos",
      ),
      filters: {
        sortBy: "first_air_date.desc",
        ...(today ? {
          firstAirDateGte: `${today.slice(0, 4)}-01-01`,
          firstAirDateLte: today,
        } : {}),
        voteCountGte: 10,
      },
    },
    {
      id: "award-winners",
      name: t(locale, "Award Winners", "Oceňované"),
      description: t(
        locale,
        "Critically acclaimed TV series",
        "Seriály oceňované kritikou",
      ),
      filters: {
        sortBy: "vote_average.desc",
        minRating: 8.5,
        voteCountGte: 5000,
      },
    },
  ];
}
