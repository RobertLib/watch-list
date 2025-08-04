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
        disallow: [
          "/api/",
          "/profile/",
          "/watchlist/",
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
