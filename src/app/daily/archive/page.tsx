import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DailyArchiveGrid } from "@/components/DailyArchiveGrid";

export const metadata: Metadata = {
  title: "Daily Puzzle Archive",
  description:
    "Every WatchList daily film puzzle that has run so far. Missed a day? Play it now – the answer is still there.",
  openGraph: {
    title: "Daily Puzzle Archive – WatchList",
    description:
      "Every daily film puzzle that has run so far. Missed a day? Play it now.",
    type: "website",
    url: "https://www.watch-list.me/daily/archive",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Daily Puzzle Archive – WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Daily Puzzle Archive – WatchList",
    description: "Every daily film puzzle that has run so far.",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://www.watch-list.me/daily/archive",
  },
};

export default function DailyArchivePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link
            href="/daily"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Today&apos;s puzzle
          </Link>
          <h1 className="text-3xl font-bold mb-2">Puzzle archive</h1>
          <p className="text-gray-400">
            Every puzzle that has run. Which ones you have played is kept in this
            browser, like everything else here.
          </p>
        </div>

        <DailyArchiveGrid />
      </div>
    </div>
  );
}
