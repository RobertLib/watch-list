"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { ShareListButton } from "@/components/ShareListButton";
import { toast } from "@/components/Toast";
import {
  createCollection,
  deleteCollection,
  getCollectionsSnapshot,
  getServerCollectionsSnapshot,
  MAX_COLLECTION_NAME_LENGTH,
  MAX_COLLECTIONS,
  removeFromCollection,
  renameCollection,
  saveCollections,
  subscribeToCollections,
  toSharedRefs,
  type Collection,
} from "@/lib/collections";
import { getImageUrl } from "@/lib/tmdb-image";
import { createSlug, mediaItemKey } from "@/lib/utils";

/**
 * Named lists, and everything that can be done to them.
 *
 * The watchlist can only ever answer one question. These answer the others – and
 * unlike the watchlist, a named list is worth sending somebody, which is why the
 * share button sits on every one of them.
 */
export function CollectionsManager() {
  const collections = useSyncExternalStore(
    subscribeToCollections,
    getCollectionsSnapshot,
    getServerCollectionsSnapshot,
  );

  const [newName, setNewName] = useState("");

  function create(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = newName.trim();
    if (!trimmed) return;

    if (collections.length >= MAX_COLLECTIONS) {
      toast.showToast(`That is the most lists one browser can hold`, "error");
      return;
    }

    saveCollections(createCollection(collections, trimmed));
    setNewName("");
    toast.showToast(`Created "${trimmed}"`, "success");
  }

  return (
    <div className="space-y-8">
      <form onSubmit={create} className="space-y-2">
        <label htmlFor="new-list" className="block font-medium text-white">
          New list
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="new-list"
            type="text"
            value={newName}
            maxLength={MAX_COLLECTION_NAME_LENGTH}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Films to show my dad"
            className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create
          </button>
        </div>
      </form>

      {collections.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-4">
          {collections.map((collection) => (
            <li key={collection.id}>
              <CollectionCard
                collection={collection}
                collections={collections}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CollectionCard({
  collection,
  collections,
}: {
  collection: Collection;
  collections: Collection[];
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(collection.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function commitRename(event: React.FormEvent) {
    event.preventDefault();
    saveCollections(renameCollection(collections, collection.id, draft));
    setIsRenaming(false);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {isRenaming ? (
          <form onSubmit={commitRename} className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              maxLength={MAX_COLLECTION_NAME_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="List name"
              className="px-3 py-1.5 rounded-lg bg-black/60 border border-gray-700 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(collection.name);
                setIsRenaming(false);
              }}
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div>
            <h2 className="text-lg font-semibold text-white">
              {collection.name}
            </h2>
            <p className="text-sm text-gray-500">
              {collection.items.length} title
              {collection.items.length === 1 ? "" : "s"}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {collection.items.length > 0 && (
            <ShareListButton
              items={toSharedRefs(collection)}
              defaultTitle={collection.name}
            />
          )}
          <button
            onClick={() => setIsRenaming(true)}
            aria-label={`Rename ${collection.name}`}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          {confirmingDelete ? (
            <span className="flex items-center gap-2 text-sm">
              <button
                onClick={() =>
                  saveCollections(deleteCollection(collections, collection.id))
                }
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete ${collection.name}`}
              className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-white/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {collection.items.length === 0 ? (
        <p className="text-sm text-gray-500">
          Empty for now. Add titles from any film or series page with the
          &ldquo;Add to list&rdquo; button.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {collection.items.map((item) => (
            <li
              key={mediaItemKey(item.id, item.mediaType)}
              className="group relative"
            >
              <Link
                href={`/${item.mediaType}/${createSlug(item.title, item.id)}`}
                prefetch={false}
                className="block w-16 rounded-lg overflow-hidden bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title={item.title}
              >
                <div className="relative aspect-2/3">
                  {item.posterPath && (
                    <Image
                      src={getImageUrl(item.posterPath, "w185")}
                      alt={item.title}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
              </Link>
              <button
                onClick={() =>
                  saveCollections(
                    removeFromCollection(
                      collections,
                      collection.id,
                      item.id,
                      item.mediaType,
                    ),
                  )
                }
                aria-label={`Remove ${item.title} from ${collection.name}`}
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-black/80 text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-300 transition-opacity"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 rounded-xl border border-dashed border-gray-800">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <ListPlus className="w-8 h-8 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold mb-2">No lists yet</h2>
      <p className="text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
        A watchlist answers one question. These answer the rest – &ldquo;the
        horror run for October&rdquo;, &ldquo;what to show my dad&rdquo;,
        &ldquo;best of this year&rdquo; – and each one shares as a link.
      </p>
    </div>
  );
}
