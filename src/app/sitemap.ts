import { MetadataRoute } from "next";
import { MOODS } from "@/lib/moods";
import { SITE_URL, moodHref } from "@/lib/routes";

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
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

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
    ...MOODS.map((mood) => ({ path: moodHref(mood.slug), priority: 0.6 })),
  ];

  return routes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority,
  }));
}
