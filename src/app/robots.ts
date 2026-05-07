import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/profile/",
          "/watchlist/",
          // Block parameterised filter URLs — endless combinations waste crawl budget
          // and produce duplicate content. Canonical (param-free) pages are in the sitemap.
          "/movies?*",
          "/tv-shows?*",
          "/trending?*",
          "/movies/top-rated?*",
          "/movies/now-playing?*",
          "/movies/upcoming?*",
          "/tv-shows/top-rated?*",
          "/tv-shows/on-the-air?*",
          "/genres/movie/*?*",
          "/genres/tv/*?*",
        ],
      },
    ],
    sitemap: "https://www.watch-list.me/sitemap.xml",
  };
}
