import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          // Explicitly allow paginated genre pages before the broader disallow below
          "/genres/movie/*?page=*",
          "/genres/tv/*?page=*",
        ],
        // /profile and /watchlist are deliberately not listed. They carry a
        // noindex tag, and a crawler has to fetch a page to see that tag — a
        // Disallow here would hide it and the bare URLs could still surface in
        // results. (The former "/profile/" and "/watchlist/" entries matched
        // nothing anyway: the real paths carry no trailing slash.)
        disallow: [
          // Block parameterised filter URLs — endless combinations waste crawl budget
          // and produce duplicate content. Canonical (param-free) pages are in the sitemap.
          "/movies?*",
          "/tv-shows?*",
          "/genres/movie/*?*",
          "/genres/tv/*?*",
        ],
      },
    ],
    sitemap: "https://www.watch-list.me/sitemap.xml",
  };
}
