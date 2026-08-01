import type { Metadata } from "next";
import Link from "next/link";
import { Dices } from "lucide-react";
import { MOODS } from "@/lib/moods";
import { cn } from "@/lib/utils";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "What to Watch, by Mood",
  description:
    "Pick by how you feel, not by genre: something easy, something mind-bending, something under ninety minutes. Curated films and series for tonight.",
  keywords: [
    "what to watch",
    "movies by mood",
    "what should i watch tonight",
    "film recommendations",
    "mood movie picker",
  ],
  openGraph: {
    title: "What to Watch, by Mood – WatchList",
    description:
      "Pick by how you feel rather than by genre: something easy, something mind-bending, something under ninety minutes.",
    type: "website",
    url: "https://www.watch-list.me/mood",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "What to Watch, by Mood – WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "What to Watch, by Mood – WatchList",
    description: "Pick by how you feel rather than by genre.",
    images: ["/opengraph-image.png"],
  },
  alternates: { canonical: "https://www.watch-list.me/mood" },
};

export default function MoodIndexPage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      <div className="mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold text-white mb-3">
          What are you in the mood for?
        </h1>
        <p className="text-gray-400 text-lg">
          Nobody wants &ldquo;Drama, 2019, sorted by popularity&rdquo;. Pick the
          kind of evening instead.
        </p>
      </div>

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MOODS.map((mood) => (
          <li key={mood.slug}>
            <Link
              href={`/mood/${mood.slug}`}
              className={cn(
                "group block h-full rounded-2xl border bg-linear-to-br p-6 transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                mood.accent,
              )}
            >
              <span aria-hidden="true" className="text-3xl">
                {mood.emoji}
              </span>
              <h2 className="mt-3 text-xl font-bold text-white">
                {mood.label}
              </h2>
              <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">
                {mood.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 rounded-xl border border-gray-800 bg-gray-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Dices className="w-5 h-5 text-blue-400" aria-hidden="true" />
            Already have a watchlist?
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Let it pick one for you, filtered by how long you have and what you
            can play right now.
          </p>
        </div>
        <Link
          href="/tonight"
          prefetch={false}
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors shrink-0"
        >
          Pick for tonight
        </Link>
      </div>
    </div>
  );
}
