import type { Metadata } from "next";
import { Dices } from "lucide-react";
import { TonightPicker } from "@/components/TonightPicker";

export const metadata: Metadata = {
  title: "What Should I Watch Tonight?",
  description:
    "One pick from your own watchlist for tonight – filtered by how long you have, what is streaming on your platforms, and the mood you are in.",
  openGraph: {
    title: "What Should I Watch Tonight? – WatchList",
    description:
      "One pick from your watchlist, chosen for the time you have and the platforms you pay for.",
    type: "website",
    url: "https://www.watch-list.me/tonight",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "What Should I Watch Tonight? – WatchList",
      },
    ],
  },
  keywords: [
    "what should i watch tonight",
    "what to watch",
    "movie picker",
    "random movie from my watchlist",
    "what to watch on netflix tonight",
  ],
  twitter: {
    card: "summary_large_image",
    title: "What Should I Watch Tonight? – WatchList",
    description:
      "One pick from your watchlist, chosen for the time you have and the platforms you pay for.",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://www.watch-list.me/tonight",
  },
};

export default function TonightPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Dices className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Tonight</h1>
        </div>
        <p className="text-gray-400">
          One title off your own list, chosen for the evening in front of you.
          Not another grid to scroll.
        </p>
      </div>

      <TonightPicker />
    </div>
  );
}
