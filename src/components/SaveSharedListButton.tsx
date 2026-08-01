"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Heart } from "lucide-react";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import type { MediaItem } from "@/types/tmdb";

/**
 * "Save all to my watchlist" for a shared list.
 *
 * The point of a share link is that the recipient can act on it in one click –
 * hearting nineteen posters one at a time is what makes a shared list get closed
 * instead of used.
 */
export function SaveSharedListButton({ items }: { items: MediaItem[] }) {
  const { addItem, isInWatchlist, isLoading } = useWatchlist();
  const [justSaved, setJustSaved] = useState(false);

  const missing = useMemo(
    () => items.filter((item) => !isInWatchlist(item.id, item.media_type)),
    [items, isInWatchlist],
  );

  if (items.length === 0) return null;

  // Rendered only once storage has been read, so it cannot briefly claim that
  // titles the visitor already has are missing.
  if (isLoading) {
    return <div className="h-10 w-56 rounded-lg bg-gray-800 animate-pulse" />;
  }

  function saveAll() {
    const added = missing.filter((item) => addItem(item)).length;

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);

    toast.showToast(
      added > 0
        ? `Added ${added} title${added === 1 ? "" : "s"} to your watchlist`
        : "Those are already on your watchlist",
      added > 0 ? "success" : "info",
    );
  }

  const alreadyHaveAll = missing.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={saveAll}
        disabled={alreadyHaveAll}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-white/10 disabled:cursor-default text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {alreadyHaveAll || justSaved ? (
          <Check className="w-4 h-4 text-green-400" aria-hidden="true" />
        ) : (
          <Heart className="w-4 h-4" aria-hidden="true" />
        )}
        {alreadyHaveAll
          ? "All on your watchlist"
          : `Save ${missing.length} to my watchlist`}
      </button>

      <Link
        href="/watchlist"
        prefetch={false}
        className="text-sm text-gray-400 hover:text-white transition-colors underline underline-offset-4"
      >
        View my watchlist
      </Link>
    </div>
  );
}
