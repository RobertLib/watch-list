import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Release Calendar",
  description:
    "Upcoming episode air dates and cinema releases for the movies and TV shows you follow, with a one-click export to your own calendar app.",
  openGraph: {
    title: "Release Calendar - WatchList",
    description:
      "Upcoming episode air dates and cinema releases for the movies and TV shows you follow.",
    type: "website",
    url: "https://www.watch-list.me/calendar",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Release Calendar - WatchList",
      },
    ],
  },
  keywords: [
    "tv calendar",
    "episode air dates",
    "movie release dates",
    "upcoming episodes",
    "release calendar",
    "when is the next episode",
  ],
  twitter: {
    card: "summary_large_image",
    title: "Release Calendar - WatchList",
    description:
      "Upcoming episode air dates and cinema releases for the movies and TV shows you follow.",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://www.watch-list.me/calendar",
  },
  // The page has nothing to show a crawler: every entry is derived from the
  // visitor's own browser storage, exactly like the watchlist.
  robots: {
    index: false,
    follow: false,
  },
};

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
