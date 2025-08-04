import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "ClaudeBot",
        disallow: "/",
      },
      {
        userAgent: "Claude-SearchBot",
        disallow: "/",
      },
      {
        userAgent: "Applebot",
        disallow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/profile/"],
      },
    ],
    sitemap: "https://www.watch-list.me/sitemap.xml",
  };
}
