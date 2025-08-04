/**
 * Every internal link this app builds.
 *
 * The app is a static export, which can only serve paths that existed at build
 * time – and there is no build-time list of every film on TMDB. So anything the
 * catalogue names travels in the query string instead of the path: `/movie` is a
 * real page, `?id=550-fight-club` is what it renders.
 *
 * Centralised because the choice is arbitrary. Changing how a title is addressed
 * should be one edit here rather than forty template literals, and building the
 * links through named functions is what makes the query strings composable –
 * a genre page carries its filters in the same place as its genre.
 */

import type { MediaType } from "@/types/tmdb";

function withParams(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** A film. `slug` is `createSlug(title, id)` – the id is the half that matters. */
export function movieHref(slug: string): string {
  return withParams("/movie", { id: slug });
}

export function tvHref(slug: string): string {
  return withParams("/tv", { id: slug });
}

export function mediaHref(mediaType: MediaType, slug: string): string {
  return mediaType === "movie" ? movieHref(slug) : tvHref(slug);
}

export function personHref(slug: string): string {
  return withParams("/person", { id: slug });
}

export function collectionHref(slug: string): string {
  return withParams("/collection", { id: slug });
}

/** One day of the daily puzzle. No day means today, which is what `/daily` is. */
export function dailyHref(day?: string): string {
  return withParams("/daily", { day });
}

export function moodHref(slug: string, page?: number): string {
  return withParams("/mood", {
    id: slug,
    page: page && page > 1 ? String(page) : undefined,
  });
}

/**
 * A genre listing, optionally narrowed to one platform, optionally filtered.
 *
 * `filterQuery` is what `buildDiscoverFilterQuery` returns – a leading "?" and
 * the filter params – so it is merged in rather than appended, or the second
 * question mark would swallow everything after it.
 */
export function genreHref(
  mediaType: MediaType,
  genreSlug: string,
  options: { provider?: string; filterQuery?: string } = {},
): string {
  const params = new URLSearchParams(options.filterQuery ?? "");
  params.set("genre", genreSlug);
  if (options.provider) params.set("provider", options.provider);

  return `/genres/${mediaType}?${params.toString()}`;
}

/** A shared list, with the optional name its sender gave it. */
export function sharedListHref(encoded: string, title?: string): string {
  return withParams("/list", { items: encoded, t: title });
}

/** Two shared lists, compared. */
export function matchHref(mine: string, theirs: string): string {
  return withParams("/match", { mine, theirs });
}

/**
 * The site's own origin, for the places a link has to be absolute: structured
 * data, the sitemap, the calendar export and shared text.
 *
 * Read from the environment so a preview deployment does not advertise the
 * production domain, with the production origin as the fallback an ordinary
 * build gets. Inlined at build time like every `NEXT_PUBLIC_` value, which is
 * what lets a Client Component read it.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.watch-list.me"
).replace(/\/+$/, "");

/**
 * One of the paths above, made absolute.
 *
 * Exists so absolute links are built from the same functions as internal ones.
 * Hand-written absolute URLs are how `/movie/fight-club-550` ended up in the
 * structured data and the `.ics` export: a path form that no route serves,
 * because every title here is addressed `/movie?id=…`.
 */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** The canonical, absolute address of a title's page. */
export function absoluteMediaUrl(mediaType: MediaType, slug: string): string {
  return absoluteUrl(mediaHref(mediaType, slug));
}
