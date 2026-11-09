"use client";

import { useEffect } from "react";
import {
  collectionHref,
  genreHref,
  movieHref,
  personHref,
  tvHref,
} from "@/lib/routes";
import { extractIdFromSlug } from "@/lib/utils";

/**
 * The paths the server-rendered site used, and what each one is now.
 *
 * Before the static export, titles had real paths – `/movie/550-fight-club`,
 * later `/movie/send-help-1198994` – and the sitemap submitted hundreds of them,
 * with `/person/…`, `/collection/…`, `/genres/movie/action-28` and a handful of
 * listing pages beside them. Every one of those is still out there, in search
 * results, bookmarks and other people's posts, and GitHub Pages answers each
 * with `404.html`, because no file of that name exists. That page is the one
 * place left that can still read such a URL, so it reads it and moves the
 * visitor to the page that took its place.
 *
 * This helps people, not search engines: the 404 status is already sent, and
 * search engines generally do not render a page that answered 404. The old URLs
 * leave the index on their own; the visitor following one no longer has to.
 *
 * It cannot be an open redirect. The destination is always built by one of the
 * `routes.ts` helpers, on this origin; the only part copied from the URL is the
 * slug, which has to be letters, digits and hyphens, travels as a query value,
 * and has to carry a numeric id – the half of it every page actually reads.
 * Anything else falls through to the ordinary 404.
 */
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const MAX_SLUG_LENGTH = 200;

const ENTITY_PATH = new RegExp(`^/(movie|tv|person|collection)/(${SLUG})/?$`, "i");
const GENRE_PATH = new RegExp(`^/genres/(movie|tv)/(${SLUG})/?$`, "i");

const ENTITY_HREF: Record<string, (slug: string) => string> = {
  movie: movieHref,
  tv: tvHref,
  person: personHref,
  collection: collectionHref,
};

/**
 * Listing pages that were sections of their own and are now sections of one
 * page. There is no anchor to land on, so the parent page is the answer.
 */
const LISTING_PATHS = new Map([
  ["/movies/top-rated", "/movies"],
  ["/movies/now-playing", "/movies"],
  ["/movies/upcoming", "/movies"],
  ["/tv-shows/top-rated", "/tv-shows"],
  ["/tv-shows/on-the-air", "/tv-shows"],
  ["/trending", "/"],
]);

/**
 * Where a URL from the server-rendered site lives now, or `null` when the path
 * is not one of those shapes – in which case the 404 is the right answer.
 *
 * A slug is read the way the old pages read it, through `extractIdFromSlug`,
 * and handed on whole so the page reads it the same way again.
 */
export function legacyPathTarget(pathname: string): string | null {
  const listing = LISTING_PATHS.get(pathname.replace(/(.)\/$/, "$1").toLowerCase());
  if (listing) return listing;

  const entity = ENTITY_PATH.exec(pathname);
  if (entity && isTitleSlug(entity[2])) {
    return ENTITY_HREF[entity[1].toLowerCase()](entity[2]);
  }

  const genre = GENRE_PATH.exec(pathname);
  if (genre && isTitleSlug(genre[2])) {
    return genreHref(genre[1].toLowerCase() === "movie" ? "movie" : "tv", genre[2]);
  }

  return null;
}

function isTitleSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && extractIdFromSlug(slug) !== null;
}

export type LegacyEntity = "movie" | "tv" | "person" | "collection";

/**
 * The names TMDB currently gives the entity with this id – the title and, where
 * there is one, the original title – or rejects when it cannot say.
 */
export type LegacyTitleLookup = (kind: LegacyEntity, id: number) => Promise<string[]>;

/**
 * The leading number of a slug that also ends in one, or `null` for any other
 * shape.
 *
 * The two slug orders meet here, and the text alone cannot tell them apart:
 * `1263256-happy-gilmore-2` is id-first (the 2025 sitemap), while
 * `1917-530915` and `2001-a-space-odyssey-62` are title-first. Every page reads
 * the trailing number, which is right for the second kind and lands the first
 * on an unrelated title – here, film 2.
 */
export function ambiguousLeadingId(slug: string): number | null {
  const leading = /^(\d+)-./.exec(slug);
  if (!leading || !/-\d+$/.test(slug)) return null;

  const id = Number(leading[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Letters and digits only, for comparing a slug with a title. The old site's
 * slugs differ in the details – one version dropped "é" and turned "2.0" into
 * "20", another kept "2-0" – so punctuation and spacing are not evidence either
 * way. Accents are compared both dropped and transliterated for the same reason.
 */
function slugLetters(text: string): string[] {
  const lower = text.toLowerCase();
  const dropped = lower.replace(/[^a-z0-9]/g, "");
  const transliterated = lower
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
  return dropped === transliterated ? [dropped] : [dropped, transliterated];
}

/**
 * Whether the rest of an id-first slug is one of these names, as the old site
 * would have slugged it.
 */
export function slugNamesTitle(rest: string, names: string[]): boolean {
  const [wanted] = slugLetters(rest);
  if (!wanted) return false;
  return names.some((name) => slugLetters(name).includes(wanted));
}

/**
 * `legacyPathTarget`, settling the one shape it cannot read alone.
 *
 * For a slug that starts and ends with a number, TMDB is asked what the leading
 * number names. When the rest of the slug is that title, the id-first reading
 * wins and the visitor goes to the bare id, which every page reads one way.
 * Otherwise – a different title, no such id, or no answer at all – the trailing
 * reading stands, exactly as `legacyPathTarget` would have sent it. It costs
 * one request, and only on a 404 for an old URL of that shape.
 */
export async function resolveLegacyTarget(
  pathname: string,
  lookupTitle: LegacyTitleLookup,
): Promise<string | null> {
  const fallback = legacyPathTarget(pathname);
  const entity = ENTITY_PATH.exec(pathname);
  if (!fallback || !entity) return fallback;

  const slug = entity[2];
  const leadingId = ambiguousLeadingId(slug);
  if (leadingId === null) return fallback;

  const kind = entity[1].toLowerCase() as LegacyEntity;
  try {
    const names = await lookupTitle(kind, leadingId);
    const rest = slug.slice(`${leadingId}-`.length);
    if (slugNamesTitle(rest, names)) return ENTITY_HREF[kind](String(leadingId));
  } catch {
    // No answer is no evidence; the trailing reading stands.
  }
  return fallback;
}

/**
 * Loaded only for the ambiguous shape, so the 404 page does not carry the TMDB
 * client for every visitor who mistypes a URL.
 */
async function lookupLegacyTitle(kind: LegacyEntity, id: number): Promise<string[]> {
  const { tmdbApi } = await import("@/lib/tmdb");
  switch (kind) {
    case "movie": {
      const movie = await tmdbApi.getMovieDetails(id);
      return [movie.title, movie.original_title];
    }
    case "tv": {
      const show = await tmdbApi.getTVShowDetails(id);
      return [show.name, show.original_name];
    }
    case "person":
      return [(await tmdbApi.getPersonDetails(id)).name];
    case "collection":
      return [(await tmdbApi.getCollectionDetails(id)).name];
  }
}

/**
 * Rendered by `app/not-found.tsx`. Renders nothing; when the URL is one of the
 * old paths, it replaces the history entry, so Back skips the dead address.
 */
export function LegacyPathRedirect() {
  useEffect(() => {
    let cancelled = false;
    void resolveLegacyTarget(window.location.pathname, lookupLegacyTitle).then((target) => {
      if (!cancelled && target) window.location.replace(target);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
