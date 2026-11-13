/**
 * A year in review, as a picture.
 *
 * The year could already be shared – as four lines of text and a link. Text is
 * what a chat wants; a feed wants an image, and the link a text share carries
 * previews as the site's one generic card, because a static site cannot draw a
 * card per visitor. So the browser draws it: the same numbers, laid out to be
 * posted.
 *
 * Two halves. This one decides what the card says – a plain description of
 * every line, built from the stats and nothing else, so it can be tested
 * without a canvas. `year-card-image.ts` paints it.
 *
 * Nothing on the card is fetched: no posters, no logos. A poster would have to
 * come from another origin, and a canvas that has drawn a cross-origin image
 * without permission can no longer be exported at all.
 */

import { formatWatchTime, type WatchStats } from "./stats";

export interface YearCardTile {
  /** The number, as shown: "84", "6 days", "7.4". */
  value: string;
  label: string;
}

export interface YearCardBar {
  name: string;
  count: number;
  /** Width against the longest bar, 0–1. */
  share: number;
}

export interface YearCard {
  /** "2026 in review" */
  heading: string;
  /** The big number and its line: "84" / "titles finished". */
  total: YearCardTile;
  /** "61 films · 23 series" – or whichever half there is. */
  breakdown: string;
  tiles: YearCardTile[];
  /** The year's genres, most-watched first. */
  genres: YearCardBar[];
  /** "watch-list.me" */
  site: string;
  tagline: string;
}

const GENRES_SHOWN = 4;

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** "6 days" from "6 days of screen time": the tile's label says the rest. */
function shortWatchTime(minutes: number): string {
  return formatWatchTime(minutes).replace(/ of screen time$/, "");
}

export function buildYearCard(stats: WatchStats, year: string, site: string): YearCard {
  const breakdown = [
    stats.films > 0 ? plural(stats.films, "film", "films") : null,
    stats.series > 0 ? plural(stats.series, "series", "series") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tiles: YearCardTile[] = [];
  // Only what there is: a tile reading "no time yet" is a tile about nothing.
  if (stats.minutes > 0) {
    tiles.push({ value: shortWatchTime(stats.minutes), label: "of screen time" });
  }
  if (stats.episodes > 0) {
    tiles.push({
      value: stats.episodes.toLocaleString("en-US"),
      label: stats.episodes === 1 ? "episode" : "episodes",
    });
  }
  if (stats.averageRating !== null) {
    tiles.push({ value: stats.averageRating.toFixed(1), label: "average score" });
  }
  // The decade most of the year's titles came from, where one stands out.
  const decade = [...stats.decades].sort((a, b) => b.count - a.count)[0];
  if (decade && tiles.length < 3) {
    tiles.push({ value: decade.name, label: "favourite decade" });
  }

  const top = stats.topGenres.slice(0, GENRES_SHOWN);
  const most = Math.max(1, ...top.map((genre) => genre.count));

  return {
    heading: `${year} in review`,
    total: {
      value: stats.totalTitles.toLocaleString("en-US"),
      label: stats.totalTitles === 1 ? "title finished" : "titles finished",
    },
    breakdown,
    tiles: tiles.slice(0, 3),
    genres: top.map((genre) => ({
      name: genre.name,
      count: genre.count,
      share: genre.count / most,
    })),
    site,
    tagline: "My year, tracked on WatchList",
  };
}

/** The file a saved card is called. */
export function yearCardFilename(year: string): string {
  return `watchlist-${year}-in-review.png`;
}
