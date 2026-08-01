"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ListPlus, Plus } from "lucide-react";
import { toast } from "@/components/Toast";
import {
  addToCollection,
  createCollection,
  getCollectionsSnapshot,
  getServerCollectionsSnapshot,
  isInCollection,
  MAX_COLLECTION_NAME_LENGTH,
  MAX_COLLECTIONS,
  removeFromCollection,
  saveCollections,
  subscribeToCollections,
  type CollectionItem,
} from "@/lib/collections";
import { cn } from "@/lib/utils";

/**
 * Put a title on one of the visitor's named lists.
 *
 * Sits next to the watchlist heart on a detail page. The heart means "I mean to
 * watch this"; this means "this belongs with those other ones", which is a
 * different thought and the one that produces lists worth sharing.
 */
export function AddToListButton({
  item,
  className,
}: {
  item: CollectionItem;
  className?: string;
}) {
  const collections = useSyncExternalStore(
    subscribeToCollections,
    getCollectionsSnapshot,
    getServerCollectionsSnapshot,
  );

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Dismissed by clicking away or pressing Escape, like every other panel here.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const memberOf = collections.filter((collection) =>
    isInCollection(collection, item.id, item.mediaType),
  ).length;

  function toggle(collectionId: string, isMember: boolean) {
    saveCollections(
      isMember
        ? removeFromCollection(
            collections,
            collectionId,
            item.id,
            item.mediaType,
          )
        : addToCollection(collections, collectionId, item),
    );
  }

  function createAndAdd(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = newName.trim();
    if (!trimmed) return;

    if (collections.length >= MAX_COLLECTIONS) {
      toast.showToast("That is the most lists one browser can hold", "error");
      return;
    }

    // Created first, then added to: `createCollection` generates the id, and the
    // new list is always the one at the front.
    const withNew = createCollection(collections, trimmed);
    saveCollections(addToCollection(withNew, withNew[0].id, item));

    setNewName("");
    toast.showToast(`Added to "${trimmed}"`, "success");
  }

  return (
    <div className={cn("relative", className)} ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          memberOf > 0
            ? "bg-blue-600/20 text-blue-200 border border-blue-500/40"
            : "bg-white/10 hover:bg-white/20 text-white",
        )}
      >
        <ListPlus className="w-4 h-4" aria-hidden="true" />
        {memberOf > 0 ? `On ${memberOf} list${memberOf === 1 ? "" : "s"}` : "Add to list"}
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-gray-700 bg-gray-900 shadow-xl p-3 space-y-3">
          {collections.length > 0 && (
            <ul className="max-h-56 overflow-y-auto space-y-1">
              {collections.map((collection) => {
                const isMember = isInCollection(
                  collection,
                  item.id,
                  item.mediaType,
                );

                return (
                  <li key={collection.id}>
                    <button
                      onClick={() => toggle(collection.id, isMember)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm hover:bg-white/5 transition-colors focus:outline-none focus-visible:bg-white/10"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isMember
                            ? "bg-blue-600 border-blue-500"
                            : "border-gray-600",
                        )}
                        aria-hidden="true"
                      >
                        {isMember && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-white">
                        {collection.name}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {collection.items.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={createAndAdd} className="flex gap-2">
            <label htmlFor={`new-list-${item.id}`} className="sr-only">
              New list name
            </label>
            <input
              id={`new-list-${item.id}`}
              value={newName}
              maxLength={MAX_COLLECTION_NAME_LENGTH}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New list…"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              aria-label="Create list and add this title"
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          <Link
            href="/lists"
            prefetch={false}
            className="block text-xs text-gray-500 hover:text-white transition-colors"
          >
            Manage your lists
          </Link>
        </div>
      )}
    </div>
  );
}
