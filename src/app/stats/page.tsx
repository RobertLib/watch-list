import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { BarChart3 } from "lucide-react";
import { WatchStatsContent } from "@/components/WatchStatsContent";

export const metadata: Metadata = pageMetadata({
  title: "Your Stats",
  description:
    "Hours watched, top genres, the decades you live in and how your own scores are spread.",
  noindex: true,
});

export default function StatsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Your stats</h1>
        </div>
        <p className="text-gray-400">
          Worked out from what this browser holds. Nothing here has been sent
          anywhere.
        </p>
      </div>

      <WatchStatsContent />
    </div>
  );
}
