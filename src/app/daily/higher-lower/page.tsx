import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HigherLowerGame } from "@/components/HigherLowerGame";

export const metadata: Metadata = {
  title: "Higher or Lower – Film Rating Game",
  description:
    "Which film scored better? Guess higher or lower on TMDb ratings and see how long a run you can put together. Free, no account, play as often as you like.",
  openGraph: {
    title: "Higher or Lower – WatchList",
    description:
      "Which film scored better? Guess higher or lower and see how long a run you can put together.",
    type: "website",
    url: "https://www.watch-list.me/daily/higher-lower",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Higher or Lower – WatchList",
      },
    ],
  },
  keywords: [
    "higher or lower movie game",
    "movie rating game",
    "film quiz",
    "guess the rating",
    "movie trivia",
  ],
  twitter: {
    card: "summary_large_image",
    title: "Higher or Lower – WatchList",
    description: "Which film scored better? Guess higher or lower.",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://www.watch-list.me/daily/higher-lower",
  },
};

export default function HigherLowerPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto mb-8">
        <Link
          href="/daily"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Daily puzzle
        </Link>
        <h1 className="text-3xl font-bold mb-2">Higher or lower</h1>
        <p className="text-gray-400">
          Two films, one score showing. Guess whether the other scored higher or
          lower on TMDb and keep the run going. A tie counts in your favour.
        </p>
      </div>

      <HigherLowerGame />
    </div>
  );
}
