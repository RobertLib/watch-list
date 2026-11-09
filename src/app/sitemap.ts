import { MetadataRoute } from "next";
import { SITE_URL, genreHref, moodHref } from "@/lib/routes";
import { genreSlug, genresFor } from "@/lib/genre-catalog";
import { MOODS } from "@/lib/moods";
import {
  STREAMING_LANDING_PLATFORMS,
  isIndexableLanding,
} from "@/lib/streaming-landing";
import {
  buildTimeTmdbAvailable,
  getGenreSnapshot,
} from "@/lib/build-time-tmdb";
import { prerenderedTitles } from "@/lib/prerendered-titles-server";
import { KINDS } from "@/lib/prerendered-titles";
import type { MediaType } from "@/types/tmdb";

// A static export has no runtime, so this file is written once at build time.
export const dynamic = "force-static";

const MEDIA_TYPES: MediaType[] = ["movie", "tv"];

/**
 * The sitemap: the pages that are actually pages.
 *
 * The fixed routes, and every route whose parameters the build enumerates –
 * one page per genre, per mood, per genre-on-a-platform landing that has
 * enough titles to be worth indexing, and per prerendered film, series and
 * person (`scripts/prebuild.mjs` chose them). Every other title is addressed
 * by query string (`/movie?id=…`), one shell for every film, and is not here.
 *
 * The one rule every entry here has to keep: a URL in a sitemap is a URL being
 * submitted for indexing, so nothing listed may serve `noindex`. The moods used
 * to be listed as `/mood?id=easy-watch` while that route was `noindex` – one
 * shell serving byte-identical markup at every mood's URL – and Search Console
 * reports that pairing as "Submitted URL marked 'noindex'", once per mood. They
 * are paths with their own prerendered content now, which is what made them
 * listable. The landings are the case where the rule needs data: one with fewer
 * than `MIN_INDEXABLE_LANDING_RESULTS` titles is `noindex`, so it is counted
 * here exactly as its page counts it, from the same build-time snapshot.
 *
 * So: if a route gains `noindex` in `pageMetadata`, it does not belong here –
 * which is why `/tonight`, `/calendar`, `/search` and the query-addressed title
 * pages are absent.
 *
 * No `lastModified`, deliberately. It used to be `new Date()`, which stamped
 * every URL with the moment of the build, on every build – a date that moved
 * whenever any file changed and said nothing about whether the page behind it
 * had. Google treats a `lastmod` that is not consistently truthful as noise
 * and stops reading it; better to state nothing than to state that.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed = [
    { path: "/", priority: 1 },
    { path: "/movies", priority: 0.9 },
    { path: "/tv-shows", priority: 0.9 },
    { path: "/genres", priority: 0.8 },
    { path: "/moods", priority: 0.8 },
    { path: "/people", priority: 0.7 },
    { path: "/daily", priority: 0.7 },
    { path: "/daily/archive", priority: 0.5 },
    { path: "/daily/higher-lower", priority: 0.5 },
    { path: "/about", priority: 0.4 },
  ];

  const genres = MEDIA_TYPES.flatMap((mediaType) =>
    genresFor(mediaType).map((genre) => ({
      path: genreHref(mediaType, genreSlug(genre)),
      priority: 0.7,
    })),
  );

  const moods = MOODS.map((mood) => ({ path: moodHref(mood.slug), priority: 0.7 }));

  const landings = (await indexableLandingPaths()).map((path) => ({
    path,
    priority: 0.6,
  }));

  // A title page with no snapshot is `noindex` (`title-metadata.ts`), and a
  // build without TMDB access has no list to read – so this is empty exactly
  // when those pages would be.
  const titles = KINDS.flatMap((kind) =>
    prerenderedTitles(kind).map(({ slug }) => ({
      path: `/${kind}/${slug}`,
      priority: 0.6,
    })),
  );

  return [...fixed, ...genres, ...moods, ...landings, ...titles].map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority,
  }));
}

/**
 * The genre-on-a-platform landings with enough titles to be indexed. None in a
 * build without TMDB access: nothing then shows any of them is not thin, and
 * their pages are `noindex` for the same reason.
 */
async function indexableLandingPaths(): Promise<string[]> {
  if (!buildTimeTmdbAvailable()) return [];

  const candidates = MEDIA_TYPES.flatMap((mediaType) =>
    genresFor(mediaType).flatMap((genre) =>
      STREAMING_LANDING_PLATFORMS.map((platform) => ({ mediaType, genre, platform })),
    ),
  );

  const paths = await Promise.all(
    candidates.map(async ({ mediaType, genre, platform }) => {
      const snapshot = await getGenreSnapshot(mediaType, genre.id, platform.slug);
      return isIndexableLanding(snapshot?.totalResults)
        ? genreHref(mediaType, genreSlug(genre), { provider: platform.slug })
        : null;
    }),
  );

  return paths.filter((path): path is string => path !== null);
}
