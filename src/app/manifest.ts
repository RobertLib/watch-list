import type { MetadataRoute } from "next";

// A static export has no runtime, so this file is written once at build time.
export const dynamic = "force-static";

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
    // Two sets, because the two purposes want different artwork. The wordmark
    // is `any`: it fills its square and a mask would cut the ends off the word.
    // The maskable pair is the logo mark alone on a full-bleed gradient, drawn
    // well inside the safe zone, so a launcher can crop it to a circle, a
    // squircle or a rounded square and still get the whole heart. Declaring the
    // wordmark as maskable instead would just hand Android something to crop.
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
