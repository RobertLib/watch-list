/**
 * Per-page `Metadata`, built from one place.
 *
 * Every page used to be a Client Component, which meant none of them could
 * export `metadata` at all – so all thirty-odd shipped the root layout's title
 * and description, and `useDocumentTitle` patched the title back in after
 * hydration. A crawler that does not run JS saw one title for the whole site.
 *
 * Pages are Server Components now and declare their own. This helper exists so
 * that the three things which must not be forgotten – a canonical, a robots
 * directive, and an Open Graph title that matches the real one – are one call
 * rather than thirty chances to omit one.
 */

import type { Metadata } from "next";
import { absoluteUrl } from "./routes";

/**
 * The one social card image the site has.
 *
 * It is the file at `src/app/opengraph-image.png`, which the static export
 * writes to `/opengraph-image.png`. Next's file convention also emits it for
 * the root segment – as `/opengraph-image.png?opengraph-image.<hash>.png`,
 * with a cache-busting query that is computed at build time and not exposed to
 * code – so this is the same bytes under a plain URL, which is the only way a
 * page's own metadata can name it.
 *
 * Absolute rather than relative on purpose: `metadataBase` would resolve a
 * relative one, but a social scraper reading the emitted tag needs the origin
 * in it, and stating it here means the test can assert it.
 */
export const SITE_SHARE_IMAGE = {
  url: absoluteUrl("/opengraph-image.png"),
  width: 1200,
  height: 630,
  alt: "WatchList - Discover Movies & TV Shows",
} as const;

/**
 * The parts of an Open Graph card that name the site rather than the page.
 *
 * Spread into the root layout's `openGraph` and into every `pageMetadata()`
 * call, and kept as one constant so they cannot drift apart. That matters
 * because metadata merges shallowly: a page that sets `openGraph` at all
 * replaces the root layout's whole block, so anything not repeated here – the
 * image, the type, the site name, the locale – silently vanished from every
 * page except `/` and the 404, and the share card for `/movies` was a bare
 * headline with no picture.
 */
export const SITE_OPEN_GRAPH = {
  type: "website",
  locale: "en_US",
  siteName: "WatchList",
  images: [SITE_SHARE_IMAGE],
} as const satisfies NonNullable<Metadata["openGraph"]>;

/**
 * Same again for the Twitter card, for the same reason. `summary_large_image`
 * is what makes the picture the card rather than a thumbnail beside the text;
 * without it a page's card downgrades to `summary`. `images` is not repeated:
 * Next fills `twitter:image` from `openGraph.images` whenever a segment does
 * not set its own, and there is only the one picture.
 */
export const SITE_TWITTER = {
  card: "summary_large_image",
  creator: "@RobertLibsansky",
} as const satisfies NonNullable<Metadata["twitter"]>;

interface PageMetadataOptions {
  /** Slotted into the root layout's `%s | WatchList` template. */
  title: string;
  description: string;
  /**
   * The path this page canonicalises to. Omitted for pages addressed by query
   * string, whose real canonical is only knowable in the browser – those set it
   * from `useCanonicalUrl` instead.
   */
  path?: string;
  /**
   * Keep the page out of the index while still letting a crawler follow its
   * links. For the two kinds of page that should never rank: the ones that are
   * a view of the visitor's own storage, and the ones whose content comes
   * entirely from a query string, where "every possible URL" is the set of
   * pages a crawler would otherwise try to enumerate.
   */
  noindex?: boolean;
}

export function pageMetadata({
  title,
  description,
  path,
  noindex,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    ...(path ? { alternates: { canonical: absoluteUrl(path) } } : {}),
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    // Repeated rather than inherited: the root layout's Open Graph block names
    // the site, and a page that overrides `title` without overriding this one
    // would share to social with the wrong headline. And since setting it at
    // all replaces the root block wholesale, the site-wide half has to come
    // along too – see `SITE_OPEN_GRAPH`.
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title,
      description,
      ...(path ? { url: absoluteUrl(path) } : {}),
    },
    twitter: { ...SITE_TWITTER, title, description },
  };
}
