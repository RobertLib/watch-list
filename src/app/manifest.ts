import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "WatchList - Discover Movies & TV Shows",
    short_name: "WatchList",
    description:
      "Discover the best movies and TV shows across all streaming platforms",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#1a1a2e",
    orientation: "portrait",
    scope: "/",
    lang: "en",
    dir: "ltr",
    categories: ["entertainment", "lifestyle"],
    screenshots: [
      {
        src: "/screenshot-wide.png",
        sizes: "1280x720",
        type: "image/png",
        form_factor: "wide",
      },
      {
        src: "/screenshot-narrow.png",
        sizes: "375x812",
        type: "image/png",
        form_factor: "narrow",
      },
    ],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
