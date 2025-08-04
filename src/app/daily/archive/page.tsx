import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DailyArchiveGrid } from "@/components/DailyArchiveGrid";

export const metadata: Metadata = pageMetadata({
  title: "Daily Puzzle Archive",
  description:
    "Every past daily film puzzle, playable at any time. Catch up on the days you missed and see how your streak holds up.",
  path: "/daily/archive",
});

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
            Every puzzle that has run. Which ones you have played is kept in
            this browser, like everything else here.
          </p>
        </div>

        <DailyArchiveGrid />
      </div>
    </div>
  );
}
