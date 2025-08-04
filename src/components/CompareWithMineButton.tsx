"use client";

import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { toast } from "@/components/Toast";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { buildMatchPath } from "@/lib/list-match";
import { MAX_SHARED_LIST_ITEMS, type SharedListRef } from "@/lib/shared-list";

/**
 * "Do we want the same things?" – asked from the list somebody just sent.
 *
 * This is the moment the question occurs to people, so the button belongs here
 * rather than only on a page they would have to go and find. Their list is
 * already in the address; ours comes out of this browser.
 */
export function CompareWithMineButton({ items }: { items: SharedListRef[] }) {
  const router = useRouter();
  const { watchlist, isLoading } = useWatchlist();

  if (isLoading || watchlist.length === 0) return null;

  function compare() {
    const mine = watchlist
      .slice(0, MAX_SHARED_LIST_ITEMS)
      .map((item) => ({ id: item.id, mediaType: item.mediaType }));

    const path = buildMatchPath(mine, items);
    if (!path) {
      toast.showToast("Nothing to compare yet", "error");
      return;
    }

    router.push(path);
  }

  return (
    <button
      onClick={compare}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <Users className="w-4 h-4" aria-hidden="true" />
      Compare with mine
    </button>
  );
}
