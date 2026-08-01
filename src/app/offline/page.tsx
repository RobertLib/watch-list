import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
  description: "You are offline.",
  robots: { index: false, follow: false },
};

/**
 * What the service worker serves when a navigation fails.
 *
 * Deliberately static and dependency-free: it has to render from the cache with
 * no network, so anything it needed to fetch would defeat the point.
 */
export default function OfflinePage() {
  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
        <WifiOff className="w-10 h-10 text-gray-500" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold mb-3">You are offline</h1>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
        WatchList needs a connection to look anything up on TMDb. Your watchlist,
        episode ticks and ratings are all safe in this browser and will be here
        when you are back.
      </p>
      <Link
        href="/"
        prefetch={false}
        className="mt-8 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
      >
        Try again
      </Link>
    </div>
  );
}
