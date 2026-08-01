import type { Metadata } from "next";
import { Users } from "lucide-react";
import { MatchStarter } from "@/components/MatchStarter";

export const metadata: Metadata = {
  title: "What Should We Watch?",
  description:
    "Compare two watchlists and find what you both already want to see. No accounts – each list travels in its own link.",
  openGraph: {
    title: "What Should We Watch? – WatchList",
    description:
      "Compare two watchlists and find what you both already want to see.",
    type: "website",
    url: "https://www.watch-list.me/match",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "What Should We Watch? – WatchList",
      },
    ],
  },
  keywords: [
    "what should we watch",
    "compare watchlists",
    "movie night picker",
    "what to watch with friends",
  ],
  twitter: {
    card: "summary_large_image",
    title: "What Should We Watch? – WatchList",
    description: "Compare two watchlists and find what you both want to see.",
    images: ["/opengraph-image.png"],
  },
  alternates: { canonical: "https://www.watch-list.me/match" },
};

export default function MatchIndexPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Users className="h-8 w-8 text-pink-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">What should we watch?</h1>
        </div>
        <p className="text-gray-400">
          Two lists, one evening. Paste the link somebody sent you and see what
          you have both already saved.
        </p>
      </div>

      <MatchStarter />
    </div>
  );
}
