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
  title: "WatchList - Discover Movies & TV Shows",
  description:
    "Discover the best movies and TV shows across all streaming platforms. Never miss what's trending and find your next favorite watch.",
  keywords: [
    "movies",
    "tv shows",
    "streaming",
    "netflix",
    "entertainment",
    "watch list",
  ],
  authors: [{ name: "Robert Libsansky" }],
  robots: "index, follow",
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
