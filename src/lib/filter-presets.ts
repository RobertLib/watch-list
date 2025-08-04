import { shiftDate, shiftYears } from "./dates";
import type { FilterOptions } from "@/types/filters";

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
 */
export function getMoviePresets(today: string): FilterPreset[] {
  return [
    {
      id: "latest-blockbusters",
      name: "Latest Blockbusters",
      description: "Popular movies from the last 2 years",
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
      name: "Hidden Gems",
      description: "Highly rated movies you might have missed",
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
      name: "Recent Releases",
      description: "Movies released in the last 6 months",
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
      name: "Top Rated Classics",
      description: "Highest rated movies released before 2015",
      filters: {
        sortBy: "vote_average.desc",
        minRating: 8,
        voteCountGte: 2000,
        primaryReleaseDateLte: "2014-12-31",
      },
    },
  ];
}

export function getTVPresets(today: string): FilterPreset[] {
  return [
    {
      id: "trending-series",
      name: "Trending Series",
      description: "Popular TV shows still running",
      filters: {
        sortBy: "popularity.desc",
        ...(today ? { firstAirDateLte: today } : {}),
        withStatus: 0,
        voteCountGte: 50,
      },
    },
    {
      id: "binge-worthy",
      name: "Binge-Worthy",
      description: "Highly rated series worth watching through",
      filters: {
        sortBy: "vote_average.desc",
        minRating: 8,
        voteCountGte: 1000,
      },
    },
    {
      id: "new-series",
      name: "New Series",
      description: "TV shows that started this year",
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
      name: "Award Winners",
      description: "Critically acclaimed TV series",
      filters: {
        sortBy: "vote_average.desc",
        minRating: 8.5,
        voteCountGte: 5000,
      },
    },
  ];
}
