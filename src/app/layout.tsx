import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { GenresProvider } from "@/contexts/GenresContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { EpisodeProgressProvider } from "@/contexts/EpisodeProgressContext";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ToastContainer } from "@/components/Toast";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { SITE_URL } from "@/lib/routes";
import { SITE_OPEN_GRAPH, SITE_TWITTER } from "@/lib/page-metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Read from the environment so a fork does not report into this property, and
// so a preview deployment can leave it unset. Absent means the two scripts below
// are not rendered at all, rather than rendered pointing at nothing.
//
// Validated rather than trusted, because the value is interpolated into the body
// of an inline <script> further down and a template literal escapes nothing. A
// measurement id is `G-` and then letters and digits; anything else – an
// apostrophe pasted along with the id, a stray newline out of a CI secret – would
// close the string it sits in and take the whole script with it, which is a
// blank page rather than a missing metric. A malformed id is dropped the same
// way an absent one is: no analytics, and the app itself unaffected.
const GA_MEASUREMENT_ID = /^G-[A-Z0-9]+$/i.test(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "",
)
  ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        {/* Skip to main content link for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Skip to main content
        </a>

        <GenresProvider>
          <WatchlistProvider>
            <WatchedProvider>
              <EpisodeProgressProvider>
                <div className="font-sans min-h-screen bg-black text-white">
                  <Navigation />
                  <div className="pt-16">
                    <main id="main-content">{children}</main>
                  </div>
                  <Footer />
                  <ToastContainer />
                  <ServiceWorkerRegistrar />
                </div>

                {/* Analytics loads after the page is interactive rather than from
                    <head>, so it competes with nothing that the visitor – or a
                    crawler measuring Core Web Vitals – is waiting for. */}
                {GA_MEASUREMENT_ID && (
                  <>
                    <Script
                      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                      strategy="afterInteractive"
                    />
                    <Script id="google-analytics" strategy="afterInteractive">
                      {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${GA_MEASUREMENT_ID}');`}
                    </Script>
                  </>
                )}
              </EpisodeProgressProvider>
            </WatchedProvider>
          </WatchlistProvider>
        </GenresProvider>
      </body>
    </html>
  );
}
