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
    // would share to social with the wrong headline.
    openGraph: {
      title,
      description,
      ...(path ? { url: absoluteUrl(path) } : {}),
    },
    twitter: { title, description },
  };
}
