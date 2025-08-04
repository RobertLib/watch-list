import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.watch-list.me";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/profile/", "/watchlist"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
