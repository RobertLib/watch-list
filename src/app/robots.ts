import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.watch-list.me";

  return {
    rules: [
      // Allow search engine bots
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/profile/", "/watchlist"],
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/api/", "/profile/", "/watchlist"],
      },
      // Block AI bots and scrapers
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "OpenAI-ChatGPT",
        disallow: "/",
      },
      {
        userAgent: "ChatGPT-User",
        disallow: "/",
      },
      {
        userAgent: "CCBot",
        disallow: "/",
      },
      {
        userAgent: "anthropic-ai",
        disallow: "/",
      },
      {
        userAgent: "Claude-Web",
        disallow: "/",
      },
      {
        userAgent: "AI2Bot",
        disallow: "/",
      },
      {
        userAgent: "Applebot-Extended",
        disallow: "/",
      },
      {
        userAgent: "PerplexityBot",
        disallow: "/",
      },
      {
        userAgent: "YouBot",
        disallow: "/",
      },
      {
        userAgent: "Bytespider",
        disallow: "/",
      },
      {
        userAgent: "Meta-ExternalAgent",
        disallow: "/",
      },
      {
        userAgent: "Meta-ExternalFetcher",
        disallow: "/",
      },
      {
        userAgent: "ImagesiftBot",
        disallow: "/",
      },
      {
        userAgent: "Omgilibot",
        disallow: "/",
      },
      {
        userAgent: "FacebookBot",
        disallow: "/",
      },
      {
        userAgent: "SemrushBot",
        disallow: "/",
      },
      {
        userAgent: "AhrefsBot",
        disallow: "/",
      },
      {
        userAgent: "MJ12bot",
        disallow: "/",
      },
      {
        userAgent: "DotBot",
        disallow: "/",
      },
      {
        userAgent: "PetalBot",
        disallow: "/",
      },
      {
        userAgent: "YandexBot",
        disallow: "/",
      },
      // General rules for other bots
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/profile/", "/watchlist"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
