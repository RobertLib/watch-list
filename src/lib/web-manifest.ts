import type { MetadataRoute } from "next";
import { t, type Locale } from "@/i18n/locale";

/**
 * The web app manifest of one language's site, served as a static file by
 * `app/(en)/manifest.webmanifest/route.ts` and `app/cs/manifest.webmanifest/route.ts`
 * and linked from each tree's root layout.
 */
export function webManifest(locale: Locale): MetadataRoute.Manifest {
  return {
    // One installable app per language: the id and the start page are the
    // tree's own, while the scope stays the whole origin so a link across to
    // the other language stays inside the installed app.
    id: locale === "cs" ? "/cs" : "/",
    name: t(
      locale,
      "WatchList - Discover Movies & TV Shows",
      "WatchList – objevujte filmy a seriály",
    ),
    short_name: "WatchList",
    description: t(
      locale,
      "Discover the best movies and TV shows across all streaming platforms",
      "Objevujte nejlepší filmy a seriály napříč všemi streamovacími službami",
    ),
    start_url: locale === "cs" ? "/cs" : "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#1a1a2e",
    // `any` rather than `portrait`. The manifest's orientation is a lock, not
    // a hint: on Android an installed app declaring `portrait` is held there
    // even when the visitor turns the phone – and this app plays trailers in
    // an overlay, which is the one thing everybody rotates for. It also
    // advertises a wide-form-factor screenshot below, which would sit oddly
    // beside a promise never to be wide.
    orientation: "any",
    scope: "/",
    lang: locale,
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
