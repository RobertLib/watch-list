"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Heart } from "lucide-react";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import type { MediaItem } from "@/types/tmdb";

/**
 * "Save all to my watchlist" for a shared list.
 *
 * The point of a share link is that the recipient can act on it in one click –
 * hearting nineteen posters one at a time is what makes a shared list get closed
 * instead of used.
 */
export function SaveSharedListButton({ items }: { items: MediaItem[] }) {
  const { addItems, isInWatchlist, isLoading, profileId } = useWatchlist();
  const { checkProfile } = useProfileGuard("list");
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

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

  async function saveAll() {
    // `missing` belongs to the loaded list, even if another tab has already
    // switched the live stores before this tab receives its storage event.
    if (saving.current || !checkProfile(profileId)) return;

    saving.current = true;
    setIsSaving(true);
    try {
      // The batch rechecks membership under one lock. A clear or restore queued
      // before this click may remove titles that were present in this render.
      const results = await addItems(items);
      const added = results.filter((result) => result === "ok").length;
      const refused = results.filter((result) => result === "failed").length;

      if (refused > 0) {
        toast.showToast(
          added === 0
            ? STORAGE_REFUSED_MESSAGE
            : `Added ${added} title${added === 1 ? "" : "s"} to your watchlist, but could not save ${refused} title${refused === 1 ? "" : "s"}. Check your browser's storage settings.`,
          "error",
        );
        return;
      }

      toast.showToast(
        added > 0
          ? `Added ${added} title${added === 1 ? "" : "s"} to your watchlist`
          : "Those are already on your watchlist",
        added > 0 ? "success" : "info",
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  const alreadyHaveAll = missing.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={saveAll}
        disabled={alreadyHaveAll || isSaving}
        aria-busy={isSaving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-white/10 disabled:cursor-default text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {alreadyHaveAll ? (
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
