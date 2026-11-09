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

const NOT_PRERENDERED = {
  description:
    "Cast, crew, trailers, reviews and where to stream it, with one click to add it to your watchlist.",
  noindex: true,
} as const;

export function movieMetadata(path: string, movie: MovieDetails | null): Metadata {
  if (!movie) return pageMetadata({ title: "Movie Details", path, ...NOT_PRERENDERED });

  return pageMetadata({
    title: moviePageTitle(movie),
    description: describe(movie.overview, "Where to stream it, cast and trailer."),
    path,
    type: "video.movie",
    image: cardImage(movie.backdrop_path, movie.poster_path, movie.title),
  });
}

export function tvMetadata(path: string, show: TVShowDetails | null): Metadata {
  if (!show) return pageMetadata({ title: "TV Show Details", path, ...NOT_PRERENDERED });

  return pageMetadata({
    title: tvPageTitle(show),
    description: describe(show.overview, "Where to stream it, seasons, cast and trailer."),
    path,
    type: "video.tv_show",
    image: cardImage(show.backdrop_path, show.poster_path, show.name),
  });
}

export function personMetadata(path: string, person: PersonPageData | null): Metadata {
  if (!person) return pageMetadata({ title: "Person", path, ...NOT_PRERENDERED });

  const { details } = person;
  return pageMetadata({
    title: personPageTitle(details),
    description: describe(
      details.biography,
      `${details.name}'s films and series, and where to stream them.`,
    ),
    path,
    type: "profile",
    image: (() => {
      const portrait = getImageUrlOrNull(details.profile_path, "h632");
      return portrait
        ? { url: portrait, width: 421, height: 632, alt: details.name }
        : undefined;
    })(),
  });
}
