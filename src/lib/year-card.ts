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

import {
  formatDecade,
  formatScore,
  formatWatchTime,
  SCREEN_TIME_SUFFIX,
  type WatchStats,
} from "./stats";
import type { Locale } from "@/i18n/locale";
import { formatNumber, pluralForm, type PluralForms } from "@/i18n/format";

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
  /** "Mostly" – the line above the genre bars. */
  genresHeading: string;
  /** "watch-list.me" */
  site: string;
  tagline: string;
}

const GENRES_SHOWN = 4;

function plural(count: number, locale: Locale, forms: PluralForms): string {
  return `${formatNumber(count, locale)} ${pluralForm(count, locale, forms)}`;
}

/** "6 days" from "6 days of screen time": the tile's label says the rest. */
function shortWatchTime(minutes: number, locale: Locale): string {
  const time = formatWatchTime(minutes, locale);
  const suffix = SCREEN_TIME_SUFFIX[locale];
  return time.endsWith(suffix) ? time.slice(0, -suffix.length) : time;
}

export function buildYearCard(
  stats: WatchStats,
  year: string,
  site: string,
  locale: Locale = "en",
): YearCard {
  const cs = locale === "cs";
  const breakdown = [
    stats.films > 0
      ? plural(stats.films, locale, { en: ["film", "films"], cs: ["film", "filmy", "filmů"] })
      : null,
    stats.series > 0
      ? plural(stats.series, locale, { en: ["series", "series"], cs: ["seriál", "seriály", "seriálů"] })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tiles: YearCardTile[] = [];
  // Only what there is: a tile reading "no time yet" is a tile about nothing.
  if (stats.minutes > 0) {
    tiles.push({
      value: shortWatchTime(stats.minutes, locale),
      label: SCREEN_TIME_SUFFIX[locale].trim(),
    });
  }
  if (stats.episodes > 0) {
    tiles.push({
      value: formatNumber(stats.episodes, locale),
      label: pluralForm(stats.episodes, locale, {
        en: ["episode", "episodes"],
        cs: ["epizoda", "epizody", "epizod"],
      }),
    });
  }
  if (stats.averageRating !== null) {
    tiles.push({
      value: formatScore(stats.averageRating, locale),
      label: cs ? "průměrné hodnocení" : "average score",
    });
  }
  // The decade most of the year's titles came from, where one stands out.
  const decade = [...stats.decades].sort((a, b) => b.count - a.count)[0];
  if (decade && tiles.length < 3) {
    tiles.push({
      value: formatDecade(decade.name, locale),
      label: cs ? "oblíbené desetiletí" : "favourite decade",
    });
  }

  const top = stats.topGenres.slice(0, GENRES_SHOWN);
  const most = Math.max(1, ...top.map((genre) => genre.count));

  return {
    heading: cs ? `Rok ${year} v kostce` : `${year} in review`,
    total: {
      value: formatNumber(stats.totalTitles, locale),
      label: pluralForm(stats.totalTitles, locale, {
        en: ["title finished", "titles finished"],
        cs: ["dokončený titul", "dokončené tituly", "dokončených titulů"],
      }),
    },
    breakdown,
    tiles: tiles.slice(0, 3),
    genres: top.map((genre) => ({
      name: genre.name,
      count: genre.count,
      share: genre.count / most,
    })),
    genresHeading: cs ? "Nejčastěji" : "Mostly",
    site,
    tagline: cs ? "Můj filmový rok na WatchListu" : "My year, tracked on WatchList",
  };
}

/** The file a saved card is called. */
export function yearCardFilename(year: string, locale: Locale = "en"): string {
  return locale === "cs"
    ? `watchlist-${year}-v-kostce.png`
    : `watchlist-${year}-in-review.png`;
}
