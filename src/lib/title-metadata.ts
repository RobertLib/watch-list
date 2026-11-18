/**
 * The `<head>` of a prerendered title page – a film, a series or a person.
 *
 * Built at build time from the same snapshot the page renders, so a search
 * result and a link shared to a chat show the title's own name, summary and
 * picture rather than the site's. A page with no snapshot – a build without
 * TMDB access – is `noindex`: it is an empty shell until the browser fills it
 * in, which is exactly what the query-string pages are kept out of the index
 * for.
 */

import type { Metadata } from "next";
import { pageMetadata } from "./page-metadata";
import { t, type Locale } from "@/i18n/locale";
import { prerenderedSlug } from "./prerendered-titles-server";
import type { PrerenderedKind } from "./prerendered-titles";
import { getImageUrlOrNull } from "./tmdb-image";
import {
  moviePageTitle,
  personPageTitle,
  tvPageTitle,
  type PersonPageData,
} from "./title-details";
import type { MovieDetails, TVShowDetails } from "@/types/tmdb";

/** Search results cut a description at about this many characters. */
const DESCRIPTION_LENGTH = 155;

/**
 * `text`, cut at a word boundary to fit `room`, with `suffix` after it. The
 * suffix says what the page offers beyond the summary, which is what a result
 * should promise.
 */
export function describe(text: string | null | undefined, suffix: string): string {
  const room = DESCRIPTION_LENGTH - suffix.length - 1;
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return suffix;
  if (clean.length <= room) return `${clean} ${suffix}`;

  const cut = clean.slice(0, room - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), room / 2));
  return `${atWord.replace(/[\s,;:.–-]+$/, "")}… ${suffix}`;
}

/** A backdrop where there is one (the card is landscape), else the poster. */
function cardImage(
  backdrop: string | null | undefined,
  poster: string | null | undefined,
  alt: string,
) {
  const wide = getImageUrlOrNull(backdrop, "w1280");
  if (wide) return { url: wide, width: 1280, height: 720, alt };
  const tall = getImageUrlOrNull(poster, "w780");
  if (tall) return { url: tall, width: 780, height: 1170, alt };
  return undefined;
}

function notPrerendered(locale: Locale) {
  return {
    description: t(
      locale,
      "Cast, crew, trailers, reviews and where to stream it, with one click to add it to your watchlist.",
      "Obsazení, tvůrci, trailery, recenze a kde to streamovat – a jedním kliknutím na váš seznam.",
    ),
    noindex: true,
  } as const;
}

/**
 * A title's page in each tree, for `hreflang`. The two trees prerender
 * different sets under different slugs – `fight-club-550` and
 * `klub-rvacu-550` – so the counterpart is looked up by id, and a tree with no
 * page for the title is left out.
 */
function titleLanguages(kind: PrerenderedKind, id: number) {
  const en = prerenderedSlug(kind, id, "en");
  const cs = prerenderedSlug(kind, id, "cs");
  return {
    en: en ? `/${kind}/${en}` : null,
    cs: cs ? `/cs/${kind}/${cs}` : null,
  };
}

export function movieMetadata(
  path: string,
  movie: MovieDetails | null,
  locale: Locale = "en",
): Metadata {
  if (!movie) {
    return pageMetadata({
      title: t(locale, "Movie Details", "Detail filmu"),
      path,
      locale,
      ...notPrerendered(locale),
    });
  }

  return pageMetadata({
    title: moviePageTitle(movie, locale),
    description: describe(
      movie.overview,
      t(locale, "Where to stream it, cast and trailer.", "Kde ho streamovat, obsazení a trailer."),
    ),
    path,
    locale,
    languages: titleLanguages("movie", movie.id),
    type: "video.movie",
    image: cardImage(movie.backdrop_path, movie.poster_path, movie.title),
  });
}

export function tvMetadata(
  path: string,
  show: TVShowDetails | null,
  locale: Locale = "en",
): Metadata {
  if (!show) {
    return pageMetadata({
      title: t(locale, "TV Show Details", "Detail seriálu"),
      path,
      locale,
      ...notPrerendered(locale),
    });
  }

  return pageMetadata({
    title: tvPageTitle(show, locale),
    description: describe(
      show.overview,
      t(
        locale,
        "Where to stream it, seasons, cast and trailer.",
        "Kde ho streamovat, řady, obsazení a trailer.",
      ),
    ),
    path,
    locale,
    languages: titleLanguages("tv", show.id),
    type: "video.tv_show",
    image: cardImage(show.backdrop_path, show.poster_path, show.name),
  });
}

export function personMetadata(
  path: string,
  person: PersonPageData | null,
  locale: Locale = "en",
): Metadata {
  if (!person) {
    return pageMetadata({
      title: t(locale, "Person", "Osobnost"),
      path,
      locale,
      ...notPrerendered(locale),
    });
  }

  const { details } = person;
  return pageMetadata({
    title: personPageTitle(details, locale),
    description: describe(
      details.biography,
      t(
        locale,
        `${details.name}'s films and series, and where to stream them.`,
        `Filmy a seriály, ve kterých hraje či které tvoří ${details.name}, a kde je streamovat.`,
      ),
    ),
    path,
    locale,
    languages: titleLanguages("person", details.id),
    type: "profile",
    image: (() => {
      const portrait = getImageUrlOrNull(details.profile_path, "h632");
      return portrait
        ? { url: portrait, width: 421, height: 632, alt: details.name }
        : undefined;
    })(),
  });
}
