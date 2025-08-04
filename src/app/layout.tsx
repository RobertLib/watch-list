import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { GenresProvider } from "@/contexts/GenresContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { IndexNowProvider } from "@/contexts/IndexNowContext";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { ToastContainer } from "@/components/Toast";
import { IndexNowTracker } from "@/components/IndexNowTracker";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { BotIdClient } from "botid/client";

const protectedRoutes = [
  { path: "/api/*", method: "GET" as const },
  { path: "/api/*", method: "POST" as const },
];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.watch-list.me"),
  title: {
    default: "WatchList - Discover Movies & TV Shows",
    template: "%s | WatchList",
  },
  description:
    "Discover the best movies and TV shows across all streaming platforms. Never miss what's trending and find your next favorite watch. Track your watchlist and get personalized recommendations.",
  keywords: [
    "movies",
    "tv shows",
    "streaming",
    "netflix",
    "entertainment",
    "watch list",
    "movie database",
    "tv series",
    "film recommendations",
    "streaming platforms",
    "movie reviews",
    "tv show reviews",
    "popular movies",
    "trending shows",
    "watch tracker",
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
    title: "WatchList - Discover Movies & TV Shows",
    description:
      "Discover the best movies and TV shows across all streaming platforms. Never miss what's trending and find your next favorite watch.",
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
    title: "WatchList - Discover Movies & TV Shows",
    description:
      "Discover the best movies and TV shows across all streaming platforms. Never miss what's trending.",
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
        <BotIdClient protect={protectedRoutes} />
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
            <IndexNowProvider>
              <div className="font-sans min-h-screen bg-black text-white">
                <Navigation />
                <div className="pt-16">
                  <main id="main-content">{children}</main>
                </div>
                <Footer />
                <ToastContainer />
                <IndexNowTracker />
              </div>
            </IndexNowProvider>
          </WatchlistProvider>
        </GenresProvider>
        <Analytics />
      </body>
    </html>
  );
}
