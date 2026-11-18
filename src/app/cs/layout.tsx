import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { RootDocument } from "@/components/RootDocument";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import { SITE_TWITTER, siteOpenGraph } from "@/lib/page-metadata";
import "../globals.css";

// Czech needs `latin-ext` for ě, š, č, ř, ž, ů and the rest; without it those
// letters fall back to another typeface mid-word. Only this tree asks for it,
// so the English pages do not preload a file they never use.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const TITLE = "WatchList – seznam filmů a seriálů ke zhlédnutí zdarma";

/**
 * The Czech tree's site-wide metadata – `app/(en)/layout.tsx` in Czech. The
 * same rules hold: no canonical here (each page declares its own), and the
 * Open Graph and Twitter halves come from `page-metadata.ts` so a page that
 * sets its own keeps the site's.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each tree links its own manifest (see `app/(en)/manifest.webmanifest`).
  manifest: "/cs/manifest.webmanifest",
  title: {
    default: TITLE,
    template: "%s | WatchList",
  },
  description:
    "Mějte přehled o všech filmech a seriálech, které chcete vidět – zdarma a bez registrace. Co je populární a na které streamovací službě co běží.",
  keywords: [
    "watchlist",
    "seznam filmů",
    "filmy ke zhlédnutí",
    "seriály",
    "co sledovat",
    "co dnes sledovat",
    "kde sledovat",
    "streamovací služby",
    "Netflix",
    "filmová databáze",
    "tipy na filmy",
    "tipy na seriály",
  ],
  authors: [{ name: "Robert Libsansky" }],
  creator: "Robert Libsansky",
  publisher: "WatchList",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    ...siteOpenGraph("cs"),
    url: absoluteUrl("/cs"),
    title: TITLE,
    description:
      "Vytvořte si zdarma seznam filmů a seriálů ke zhlédnutí. Objevujte, co je populární, ukládejte si tituly a zjistěte, na které streamovací službě je najdete.",
  },
  twitter: {
    ...SITE_TWITTER,
    title: TITLE,
    description:
      "Vytvořte si zdarma seznam filmů a seriálů ke zhlédnutí a zjistěte, na které streamovací službě je najdete.",
  },
  category: "entertainment",
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
};

/** The Czech site, under `/cs`. The English one is `app/(en)/layout.tsx`. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootDocument locale="cs" fontVariable={geistSans.variable}>
      {children}
    </RootDocument>
  );
}
