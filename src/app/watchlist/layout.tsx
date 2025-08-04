import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Watchlist",
  description:
    "View and manage your personal watchlist of movies and TV shows. Keep track of what you want to watch next on WatchList.",
  openGraph: {
    title: "My Watchlist - WatchList",
    description:
      "View and manage your personal watchlist of movies and TV shows. Keep track of what you want to watch next.",
    type: "website",
    url: "https://www.watch-list.me/watchlist",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "My Watchlist - WatchList",
      },
    ],
  },
  alternates: {
    canonical: "https://www.watch-list.me/watchlist",
  },
};

export default function WatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
