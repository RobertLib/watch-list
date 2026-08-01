import type { Metadata } from "next";
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
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const GA_MEASUREMENT_ID = "G-EGE2R16PX1";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.watch-list.me"),
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
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.watch-list.me",
    siteName: "WatchList",
    title: "WatchList – Free Movie & TV Show Watchlist Tracker",
    description:
      "Create your free movie and TV show watchlist. Discover trending films, add them to your personal watch list, and track everything across all streaming platforms.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "WatchList - Discover Movies & TV Shows",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WatchList – Free Movie & TV Show Watchlist Tracker",
    description:
      "Create your free movie and TV show watchlist. Discover trending films and track everything across all streaming platforms.",
    creator: "@RobertLibsansky",
  },
  // Deliberately no `alternates.canonical` here. Metadata is inherited, so a
  // canonical set on the root layout is claimed by every page that does not set
  // its own – which had /search, the soft-404 responses and the legacy redirect
  // route all telling crawlers they were the home page. Each indexable route
  // declares its own; the home page does it in page.tsx.
  category: "entertainment",
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
                <Script
                  src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                  strategy="afterInteractive"
                />
                <Script id="google-analytics" strategy="afterInteractive">
                  {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${GA_MEASUREMENT_ID}');`}
                </Script>
              </EpisodeProgressProvider>
            </WatchedProvider>
          </WatchlistProvider>
        </GenresProvider>
      </body>
    </html>
  );
}
