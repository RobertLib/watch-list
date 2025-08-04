import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/routes";

// A static export has no runtime, so this file is written once at build time.
export const dynamic = "force-static";

/**
 * The sitemap, reduced to the pages that are actually pages.
 *
 * It used to enumerate thousands of titles, which meant fifty TMDB requests at
 * build time. Every one of those URLs is a query string now – `/movie?id=…` –
 * and a static export has no route to submit for them, so there is nothing to
 * list beyond the fixed routes below. That also means the build no longer needs
 * a TMDB token to succeed.
 *
 * The one rule every entry here has to keep: a URL in a sitemap is a URL being
 * submitted for indexing, so nothing listed may serve `noindex`. The eleven
 * moods used to be listed – `/mood?id=easy-watch` and the rest – and each one
 * contradicted itself the moment a crawler followed it, because `/mood` is
 * `noindex` and for good reason: query-addressed routes are one prerendered
 * file, so every mood URL serves byte-identical markup and there is nothing for
 * a crawler to tell apart. Search Console reports that pairing as "Submitted
 * URL marked 'noindex'", once per mood. `/moods` is the indexable page that
 * links to all of them, and it is listed below.
 *
 * So: if a route gains `noindex` in `pageMetadata`, it does not belong here –
 * which is why `/tonight`, `/calendar`, `/search` and the genre listings are
 * absent too.
 *
 * No `lastModified`, deliberately. It used to be `new Date()`, which stamped
 * every URL with the moment of the build, on every build – a date that moved
 * whenever any file changed and said nothing about whether the page behind it
 * had. Google treats a `lastmod` that is not consistently truthful as noise
 * and stops reading it; better to state nothing than to state that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
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

  return routes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority,
  }));
}
