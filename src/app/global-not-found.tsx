import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { RootDocument } from "@/components/RootDocument";
import { NotFoundContent } from "@/components/NotFoundContent";
import { SITE_URL } from "@/lib/routes";
import "./globals.css";

// Both subsets: this one page serves the Czech tree's missing paths as well.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

/**
 * Not under any layout, so the title carries the site name itself rather
 * than through a template. See `app/(en)/not-found.tsx` for the robots entry.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each tree links its own manifest (see `app/(en)/manifest.webmanifest`).
  manifest: "/manifest.webmanifest",
  title: "Page not found | WatchList",
  description: "That page does not exist. Your watchlist is unaffected.",
  robots: { index: false, follow: true },
};

/**
 * The page for a URL that matches no route at all – `404.html` in the static
 * export, which GitHub Pages serves for every path it has no file for.
 *
 * Needed because the site has two root layouts, one per language, and so no
 * single layout a 404 could be composed from. One file answers both trees: it
 * is prerendered in English and switches to Czech under `/cs` once running
 * (`localeFromPath`).
 */
export default function GlobalNotFound() {
  return (
    <RootDocument locale="en" fontVariable={geistSans.variable} localeFromPath>
      <NotFoundContent />
    </RootDocument>
  );
}
