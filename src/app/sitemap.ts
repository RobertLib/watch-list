import { MetadataRoute } from "next";
import {
  SITE_URL,
  genreHref,
  likePath,
  moodHref,
  prefixLocale,
} from "@/lib/routes";
import { LOCALES, type Locale } from "@/i18n/locale";
import { genreSlug, genresFor } from "@/lib/genre-catalog";
import { MOODS, moodsWithPlatforms } from "@/lib/moods";
import {
  STREAMING_LANDING_PLATFORMS,
  isIndexableLanding,
} from "@/lib/streaming-landing";
import {
  buildTimeTmdbAvailable,
  getGenreSnapshot,
  getMoodSnapshot,
  getMovieLikeSnapshot,
  getTVLikeSnapshot,
} from "@/lib/build-time-tmdb";
import {
  likePageTitles,
  prerenderedTitles,
} from "@/lib/prerendered-titles-server";
import { KINDS, LIKE_PAGE_KINDS } from "@/lib/prerendered-titles";
import { isIndexableLikePage } from "@/lib/like-titles";
import type { MediaType } from "@/types/tmdb";

// A static export has no runtime, so this file is written once at build time.
export const dynamic = "force-static";

const MEDIA_TYPES: MediaType[] = ["movie", "tv"];

/**
 * The sitemap: the pages that are actually pages.
 *
 * The fixed routes, and every route whose parameters the build enumerates –
 * one page per genre, per mood, per genre-on-a-platform and mood-on-a-platform
 * landing that has enough titles to be worth indexing, and per prerendered
 * film, series and person (`scripts/prebuild.mjs` chose them). Every other title is addressed
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
 *
 * Both languages are here: every English page and its Czech twin under `/cs`,
 * each entry naming the other as an `hreflang` alternate (with English as the
 * `x-default`) when both exist. The pages' own `<head>` says the same
 * (`languageAlternates` in `page-metadata.ts`); Google reads either.
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
    { path: "/import", priority: 0.6 },
    { path: "/tv-time-alternative", priority: 0.5 },
    { path: "/about", priority: 0.4 },
  ];

  const genres = MEDIA_TYPES.flatMap((mediaType) =>
    genresFor(mediaType).map((genre) => ({
      path: genreHref(mediaType, genreSlug(genre)),
      priority: 0.7,
    })),
  );

  const moods = MOODS.map((mood) => ({ path: moodHref(mood.slug), priority: 0.7 }));

  // The same page in both trees: the English path, and the Czech one under
  // `/cs` (`hreflang` pairs them, below).
  const shared: SitemapPage[] = [...fixed, ...genres, ...moods].map(
    ({ path, priority }) => ({
      priority,
      paths: { en: path, cs: prefixLocale(path, "cs") },
    }),
  );

  // A landing is counted in each tree on its own: the Czech one lists the Czech
  // region's catalogue, so it can clear the bar where the English one does not,
  // or the other way round.
  const landings = await pagesByKey(
    (locale) =>
      Promise.all([
        indexableLandingPaths(locale),
        indexableMoodLandingPaths(locale),
      ]).then(([genre, mood]) =>
        [...genre, ...mood].map((path) => ({ key: path, path: prefixLocale(path, locale) })),
      ),
    0.6,
  );

  // A title page with no snapshot is `noindex` (`title-metadata.ts`), and a
  // build without TMDB access has no list to read – so this is empty exactly
  // when those pages would be. The one exception is deliberate: a title TMDB
  // started answering 404 for in the minutes between the prebuild and its page
  // (`buildTimeLoad`'s `missingIsNull`) is still listed until the next daily
  // build drops it. Checking every title's snapshot here would cost up to
  // another request per title per build, for a case that rare.
  //
  // Each tree prerenders its own titles under its own slugs, so the two pages
  // of one title are paired by id rather than by path.
  const titles = await pagesByKey(
    async (locale) =>
      KINDS.flatMap((kind) =>
        prerenderedTitles(kind, locale).map(({ id, slug }) => ({
          key: `${kind}:${id}`,
          path: prefixLocale(`/${kind}/${slug}`, locale),
        })),
      ),
    0.6,
  );

  const likePages = await pagesByKey(indexableLikePaths, 0.5);

  return [...shared, ...landings, ...titles, ...likePages].flatMap(
    ({ paths, priority }) => {
      const languages = alternatesOf(paths);
      return LOCALES.flatMap((locale) => {
        const path = paths[locale];
        if (!path) return [];
        return [
          {
            url: `${SITE_URL}${path}`,
            changeFrequency: "weekly" as const,
            priority,
            ...(languages ? { alternates: { languages } } : {}),
          },
        ];
      });
    },
  );
}

/** One page, at its path in each tree that has it. */
interface SitemapPage {
  priority: number;
  paths: Partial<Record<Locale, string>>;
}

/**
 * Pages each tree lists on its own, paired by `key` – a title's id, a
 * landing's English path – so a page and its translation share one entry.
 */
async function pagesByKey(
  list: (locale: Locale) => Promise<{ key: string; path: string }[]>,
  priority: number,
): Promise<SitemapPage[]> {
  const byKey = new Map<string, SitemapPage>();
  for (const locale of LOCALES) {
    for (const { key, path } of await list(locale)) {
      const page = byKey.get(key) ?? { priority, paths: {} };
      page.paths[locale] = path;
      byKey.set(key, page);
    }
  }
  return [...byKey.values()];
}

/**
 * The `hreflang` set for a page both trees have – every language and English
 * as the `x-default` – or nothing for a page only one tree has.
 */
function alternatesOf(
  paths: Partial<Record<Locale, string>>,
): Record<string, string> | undefined {
  if (!LOCALES.every((locale) => paths[locale])) return undefined;
  return {
    ...Object.fromEntries(
      LOCALES.map((locale) => [locale, `${SITE_URL}${paths[locale]}`]),
    ),
    "x-default": `${SITE_URL}${paths.en}`,
  };
}

/**
 * The genre-on-a-platform landings with enough titles to be indexed. None in a
 * build without TMDB access: nothing then shows any of them is not thin, and
 * their pages are `noindex` for the same reason.
 */
async function indexableLandingPaths(locale: Locale): Promise<string[]> {
  if (!buildTimeTmdbAvailable()) return [];

  const candidates = MEDIA_TYPES.flatMap((mediaType) =>
    genresFor(mediaType).flatMap((genre) =>
      STREAMING_LANDING_PLATFORMS.map((platform) => ({ mediaType, genre, platform })),
    ),
  );

  const paths = await Promise.all(
    candidates.map(async ({ mediaType, genre, platform }) => {
      const snapshot = await getGenreSnapshot(mediaType, genre.id, platform.slug, locale);
      return isIndexableLanding(snapshot?.totalResults)
        ? genreHref(mediaType, genreSlug(genre), { provider: platform.slug })
        : null;
    }),
  );

  return paths.filter((path): path is string => path !== null);
}

/**
 * The same for the moods that have a page per platform: only the landings with
 * enough titles, counted from the snapshot the page's own metadata reads.
 */
async function indexableMoodLandingPaths(locale: Locale): Promise<string[]> {
  if (!buildTimeTmdbAvailable()) return [];

  const candidates = moodsWithPlatforms().flatMap((mood) =>
    STREAMING_LANDING_PLATFORMS.map((platform) => ({ mood, platform })),
  );

  const paths = await Promise.all(
    candidates.map(async ({ mood, platform }) => {
      const snapshot = await getMoodSnapshot(mood.slug, platform.slug, locale);
      return isIndexableLanding(snapshot?.totalResults)
        ? moodHref(mood.slug, 1, platform.slug)
        : null;
    }),
  );

  return paths.filter((path): path is string => path !== null);
}

/**
 * The "movies like this" pages with enough on them to be indexed.
 *
 * Counted from each page's own snapshot, like the landings: one with a handful
 * of titles is `noindex` (`isIndexableLikePage`) and must not be listed. That
 * is a load per page, but not a request – it is the URL the title page's
 * snapshot already asked for, answered from the build's fetch cache.
 */
async function indexableLikePaths(
  locale: Locale,
): Promise<{ key: string; path: string }[]> {
  if (!buildTimeTmdbAvailable()) return [];

  const pages = await Promise.all(
    LIKE_PAGE_KINDS.flatMap((kind) =>
      likePageTitles(kind, locale).map(async ({ id, slug }) => {
        const page =
          kind === "movie"
            ? await getMovieLikeSnapshot(id, locale)
            : await getTVLikeSnapshot(id, locale);
        return isIndexableLikePage(page)
          ? { key: `${kind}:${id}`, path: likePath(kind, slug, locale) }
          : null;
      }),
    ),
  );

  return pages.filter((page) => page !== null);
}
