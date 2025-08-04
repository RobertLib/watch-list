import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { GenresProvider } from "@/contexts/GenresContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ToastContainer } from "@/components/Toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.watch-list.me"),
  title: {
    default: "WatchList – Free Movie & TV Show Watchlist Tracker",
    template: "%s | WatchList",
  },
  description:
    "Create your free movie and TV show watchlist. Discover trending films, add them to your personal watch list, and track everything across all streaming platforms. Never forget what to watch next.",
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
  alternates: {
    canonical: "https://www.watch-list.me",
  },
  category: "entertainment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/next-script-for-ga */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-EGE2R16PX1"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-EGE2R16PX1');`,
          }}
        />
      </head>
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
            <div className="font-sans min-h-screen bg-black text-white">
              <Navigation />
              <div className="pt-16">
                <main id="main-content">{children}</main>
              </div>
              <Footer />
              <ToastContainer />
            </div>
          </WatchlistProvider>
        </GenresProvider>
      </body>
    </html>
  );
}
