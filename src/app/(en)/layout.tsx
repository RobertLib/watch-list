import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { RootDocument } from "@/components/RootDocument";
import { SITE_URL } from "@/lib/routes";
import { SITE_OPEN_GRAPH, SITE_TWITTER } from "@/lib/page-metadata";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each tree links its own manifest (see `app/(en)/manifest.webmanifest`).
  manifest: "/manifest.webmanifest",
  title: {
    default: "WatchList – Free Movie & TV Show Watchlist Tracker",
    template: "%s | WatchList",
  },
  // Kept under ~160 characters: past that, the tail is cut off in results and only
  // the truncation shows.
  description:
    "Track every movie and TV show you mean to watch – free, no account. See what's trending and which streaming service each title is on.",
  keywords: [
    "watchlist",
    "movie watchlist",
    "watch list",
    "my watchlist",
    "movie watch list",
    "movies",
    "tv shows",
    "streaming",
    "entertainment",
    "movie database",
    "tv series",
    "film recommendations",
    "streaming platforms",
    "watch tracker",
    "what to watch",
  ],
  authors: [{ name: "Robert Libsansky" }],
  creator: "Robert Libsansky",
  publisher: "WatchList",
  robots: {
    index: true,
    follow: true,
  },
  // The site-wide half of each card – type, locale, site name, image, card
  // style, creator – comes from `page-metadata.ts`, where every page's
  // `pageMetadata()` call spreads the same constants. It has to be shared
  // rather than written here once: a page that sets `openGraph` or `twitter`
  // replaces this block wholesale, so anything only stated here reaches `/` and
  // the 404 and no other page.
  openGraph: {
    ...SITE_OPEN_GRAPH,
    url: SITE_URL,
    title: "WatchList – Free Movie & TV Show Watchlist Tracker",
    description:
      "Create your free movie and TV show watchlist. Discover trending films, add them to your personal watch list, and track everything across all streaming platforms.",
  },
  twitter: {
    ...SITE_TWITTER,
    title: "WatchList – Free Movie & TV Show Watchlist Tracker",
    description:
      "Create your free movie and TV show watchlist. Discover trending films and track everything across all streaming platforms.",
  },
  // Deliberately no `alternates.canonical` here. Metadata is inherited, so a
  // canonical set on the root layout is claimed by every page that does not set
  // its own – which had /search, the soft-404 responses and the legacy redirect
  // route all telling crawlers they were the home page. Each route declares its
  // own instead, through `pageMetadata`; the home page does it in page.tsx, and
  // the query-addressed ones set theirs from `useCanonicalUrl` because the build
  // cannot know which title a URL names.
  category: "entertainment",
};

// Matches the manifest's `theme_color`, and has to be stated here as well: the
// manifest only applies once the app is installed, while this is what colours
// the browser's own chrome on a plain visit.
export const viewport: Viewport = {
  themeColor: "#1a1a2e",
};

/** The English site, at the root. The Czech one is `app/cs/layout.tsx`. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootDocument locale="en" fontVariable={geistSans.variable}>
      {children}
    </RootDocument>
  );
}
