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
import { OG_LOCALE, t, type Locale } from "@/i18n/locale";
import { absoluteUrl, localizeHref } from "./routes";

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

/** `SITE_OPEN_GRAPH` for a page in either language. */
export function siteOpenGraph(locale: Locale) {
  if (locale === "en") return SITE_OPEN_GRAPH;
  return {
    ...SITE_OPEN_GRAPH,
    locale: OG_LOCALE[locale],
    alternateLocale: [OG_LOCALE.en],
    images: [
      {
        ...SITE_SHARE_IMAGE,
        alt: t(locale, SITE_SHARE_IMAGE.alt, "WatchList – objevujte filmy a seriály"),
      },
    ],
  } as const satisfies NonNullable<Metadata["openGraph"]>;
}

/**
 * The `hreflang` set for a page that exists in both trees: each language's
 * absolute address, and English as the `x-default` a visitor in any other
 * language is sent to. `paths` overrides a language whose address is not just
 * the English path with a prefix – a title, whose Czech page has a Czech slug
 * – and `null` there leaves that language out, for a page only one tree has.
 */
export function languageAlternates(
  path: string,
  paths: Partial<Record<Locale, string | null>> = {},
): Record<string, string> {
  const en = paths.en === undefined ? path : paths.en;
  const cs = paths.cs === undefined ? localizeHref(path, "cs") : paths.cs;
  if (!en || !cs) return {};
  return {
    en: absoluteUrl(en),
    cs: absoluteUrl(cs),
    "x-default": absoluteUrl(en),
  };
}

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
  /**
   * The page's own picture for its social card – a film's backdrop, a person's
   * portrait – in place of the site's. Absolute, like `SITE_SHARE_IMAGE`.
   */
  image?: { url: string; width: number; height: number; alt: string };
  /** Open Graph's type, where the page is more than a `website`. */
  type?: "video.movie" | "video.tv_show" | "profile";
  /**
   * Which tree the page is in. `path` is always the English path: the
   * canonical is that path moved into this language (`localizeHref`).
   */
  locale?: Locale;
  /**
   * The `hreflang` addresses where they are not simply `path` in each tree –
   * see `languageAlternates`. `false` for a page with no counterpart at all.
   */
  languages?: Partial<Record<Locale, string | null>> | false;
}

export function pageMetadata({
  title,
  description,
  path,
  noindex,
  image,
  type,
  locale = "en",
  languages,
}: PageMetadataOptions): Metadata {
  const canonical = path ? absoluteUrl(localizeHref(path, locale)) : undefined;
  // Only an indexable page names its translations: a `noindex` page is not a
  // candidate for either language's results, and pointing at one from the
  // other would only invite a crawler to it.
  const alternates =
    path && !noindex && languages !== false
      ? languageAlternates(path, languages || {})
      : {};
  return {
    title,
    description,
    ...(canonical
      ? {
          alternates: {
            canonical,
            ...(Object.keys(alternates).length > 0 ? { languages: alternates } : {}),
          },
        }
      : {}),
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    // Repeated rather than inherited: the root layout's Open Graph block names
    // the site, and a page that overrides `title` without overriding this one
    // would share to social with the wrong headline. And since setting it at
    // all replaces the root block wholesale, the site-wide half has to come
    // along too – see `SITE_OPEN_GRAPH`.
    openGraph: {
      ...siteOpenGraph(locale),
      ...(type ? { type } : {}),
      ...(image ? { images: [image] } : {}),
      title,
      description,
      ...(canonical ? { url: canonical } : {}),
    },
    twitter: { ...SITE_TWITTER, title, description },
  };
}
