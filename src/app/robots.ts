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
          "/type/", // Block old redirect route
        ],
      },
    ],
    sitemap: "https://www.watch-list.me/sitemap.xml",
  };
}
