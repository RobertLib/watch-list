"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ShareListButton } from "@/components/ShareListButton";
import { toast } from "@/components/Toast";
import {
  createCollection,
  deleteCollection,
  getCollectionsSnapshot,
  getServerCollectionsSnapshot,
  isInCollection,
  MAX_COLLECTION_NAME_LENGTH,
  MAX_COLLECTIONS,
  notifyCollectionsChanged,
  removeFromCollection,
  renameCollection,
  saveCollections,
  subscribeToCollections,
  toSharedRefs,
  type Collection,
  type CollectionItem,
} from "@/lib/collections";
import { getImageUrl } from "@/lib/tmdb-image";
import { createSlug, mediaItemKey } from "@/lib/utils";
import { mediaHref } from "@/lib/routes";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { useHydrated } from "@/hooks/useHydrated";
import { withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

/** Cancel queued actions when their card or rendered profile disappears. */
function useCollectionMutation(profileId: string, checkProfile: () => boolean) {
  const mounted = useRef(true);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function mutate(operation: () => void) {
    if (saving.current || !checkProfile()) return;
    saving.current = true;
    setIsSaving(true);
    try {
      const handled = await withProfileRosterLock(() => {
        if (!mounted.current || !checkProfile()) return true;
        withProfileStorage(profileId, operation);
        return true;
      }, false);
      if (!handled && mounted.current) toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }
  return { mutate, isSaving };
}

function saveCollectionChanges(collections: Collection[]): boolean {
  const saved = saveCollections(collections);
  if (!saved) toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
  return saved;
}

/**
 * Named lists, and everything that can be done to them.
 *
 * The watchlist can only ever answer one question. These answer the others – and
 * unlike the watchlist, a named list is worth sending somebody, which is why the
 * share button sits on every one of them.
 */
export function CollectionsManager() {
  const { profileId, checkProfile } = useProfileGuard("list");

  // A profile switch must discard drafts, confirmations and share panels even
  // when imported backups gave both profiles identical lists and list IDs.
  return <ProfileCollectionsManager key={profileId} profileId={profileId} checkProfile={checkProfile} />;
}

function ProfileCollectionsManager({ profileId, checkProfile }: {
  profileId: string;
  checkProfile: () => boolean;
}) {
  const collections = useSyncExternalStore(
    subscribeToCollections,
    getCollectionsSnapshot,
    getServerCollectionsSnapshot,
  );
  // The prerendered page has no storage, so its snapshot is always empty. Until
  // the browser has read the real one, "No lists yet" would be a claim made to
  // everyone – including visitors with a dozen lists – so it waits.
  const hydrated = useHydrated();

  const [newName, setNewName] = useState("");
  const { mutate, isSaving } = useCollectionMutation(profileId, checkProfile);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (isSaving || !checkProfile()) return;

    const trimmed = newName.trim();
    if (!trimmed) {
      toast.showToast("Enter a list name with visible characters", "error");
      return;
    }

    // Read the live snapshot under the shared lock so a queued restore or edit
    // completes before we derive and save this change.
    await mutate(() => {
      const latest = getCollectionsSnapshot({ strict: true });
      if (latest.length >= MAX_COLLECTIONS) {
        notifyCollectionsChanged();
        toast.showToast(`That is the most lists one browser can hold`, "error");
        return;
      }

      const withNew = createCollection(latest, trimmed);
      if (withNew === latest) {
        toast.showToast("Enter a list name with visible characters", "error");
        return;
      }
      if (!saveCollectionChanges(withNew)) return;
      setNewName("");
      toast.showToast(`Created "${withNew[0].name}"`, "success");
    });
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
            // Read-only rather than disabled while saving: browsers blur a
            // disabled field, so pressing Enter here used to drop focus.
            readOnly={isSaving}
            maxLength={MAX_COLLECTION_NAME_LENGTH}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Films to show my dad"
            className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="submit"
            aria-disabled={isSaving}
            aria-busy={isSaving}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 aria-disabled:opacity-60 aria-disabled:cursor-wait font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create
          </button>
        </div>
      </form>

      {!hydrated ? (
        <LoadingSpinner className="py-12" />
      ) : collections.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-4">
          {collections.map((collection) => (
            <li key={collection.id}>
              <CollectionCard collection={collection} profileId={profileId} checkProfile={checkProfile} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CollectionCard({
  collection,
  profileId,
  checkProfile,
}: {
  collection: Collection;
  profileId: string;
  checkProfile: () => boolean;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(collection.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { mutate, isSaving } = useCollectionMutation(profileId, checkProfile);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  // Leaving the rename form or the delete confirmation unmounts the control
  // that was just pressed, which would leave focus on the page body. Where it
  // should go once the swap has rendered – set only when that control actually
  // held focus, so a click that never focused it does not move anything.
  const focusAfterSwap = useRef<React.RefObject<HTMLButtonElement | null> | null>(null);
  useEffect(() => {
    focusAfterSwap.current?.current?.focus();
    focusAfterSwap.current = null;
  }, [isRenaming, confirmingDelete]);

  function focusAfterRender(
    pressed: HTMLElement,
    target: React.RefObject<HTMLButtonElement | null>,
  ) {
    // `pressed` may be the rename form, submitted from its input or Save.
    if (pressed.contains(document.activeElement)) focusAfterSwap.current = target;
  }

  function startRename() {
    if (isSaving || !checkProfile()) return;
    const current = withProfileStorage(profileId, () =>
      getCollectionsSnapshot().find((entry) => entry.id === collection.id),
    );
    if (!current) {
      notifyCollectionsChanged();
      toast.showToast("That list is no longer available", "info");
      return;
    }
    // A rename in another tab may have arrived since this card mounted.
    setDraft(current.name);
    setIsRenaming(true);
  }

  async function commitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await mutate(() => {
      const latest = getCollectionsSnapshot({ strict: true });
      const current = latest.find((entry) => entry.id === collection.id);
      if (!current) {
        notifyCollectionsChanged();
        toast.showToast("That list is no longer available", "info");
        return;
      }
      const renamed = renameCollection(latest, collection.id, draft);
      if (renamed === latest) {
        toast.showToast("Enter a list name with visible characters", "error");
        return;
      }
      if (renamed.find((entry) => entry.id === collection.id)?.name === current.name) {
        notifyCollectionsChanged();
        focusAfterRender(form, renameButtonRef);
        setIsRenaming(false);
        return;
      }
      if (!saveCollectionChanges(renamed)) return;
      focusAfterRender(form, renameButtonRef);
      setIsRenaming(false);
    });
  }

  async function commitDelete() {
    await mutate(() => {
      const latest = getCollectionsSnapshot({ strict: true });
      if (!latest.some((entry) => entry.id === collection.id)) {
        notifyCollectionsChanged();
        return;
      }
      saveCollectionChanges(deleteCollection(latest, collection.id));
    });
  }

  async function removeItem(itemId: number, mediaType: CollectionItem["mediaType"]) {
    await mutate(() => {
      const latest = getCollectionsSnapshot({ strict: true });
      const current = latest.find((entry) => entry.id === collection.id);
      if (!current || !isInCollection(current, itemId, mediaType)) {
        notifyCollectionsChanged();
        return;
      }
      saveCollectionChanges(
        removeFromCollection(latest, collection.id, itemId, mediaType),
      );
    });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {isRenaming ? (
          <form onSubmit={commitRename} className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              // Read-only, not disabled, while saving: browsers blur a
              // disabled field. The same goes for every button on this card,
              // which say they are busy with `aria-disabled` and refuse a
              // second action in their handlers instead.
              readOnly={isSaving}
              maxLength={MAX_COLLECTION_NAME_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="List name"
              className="px-3 py-1.5 rounded-lg bg-black/60 border border-gray-700 text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              aria-disabled={isSaving}
              aria-busy={isSaving}
              className="text-sm text-blue-400 hover:text-blue-300 aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
            >
              Save
            </button>
            <button
              type="button"
              aria-disabled={isSaving}
              onClick={(event) => {
                if (isSaving) return;
                focusAfterRender(event.currentTarget, renameButtonRef);
                setDraft(collection.name);
                setIsRenaming(false);
              }}
              className="text-sm text-gray-500 hover:text-white aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
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
            ref={renameButtonRef}
            onClick={startRename}
            aria-disabled={isSaving}
            aria-label={`Rename ${collection.name}`}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          {confirmingDelete ? (
            <span className="flex items-center gap-2 text-sm">
              <button
                onClick={commitDelete}
                aria-disabled={isSaving}
                aria-busy={isSaving}
                className="text-red-400 hover:text-red-300 aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
              >
                Delete
              </button>
              <button
                ref={cancelDeleteRef}
                onClick={(event) => {
                  if (isSaving) return;
                  focusAfterRender(event.currentTarget, deleteButtonRef);
                  setConfirmingDelete(false);
                }}
                aria-disabled={isSaving}
                className="text-gray-500 hover:text-white aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              ref={deleteButtonRef}
              aria-disabled={isSaving}
              onClick={(event) => {
                if (isSaving || !checkProfile()) return;
                // Onto the safe answer, so a second Enter cannot delete.
                focusAfterRender(event.currentTarget, cancelDeleteRef);
                setConfirmingDelete(true);
              }}
              aria-label={`Delete ${collection.name}`}
              className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-white/10 aria-disabled:opacity-60 aria-disabled:cursor-wait transition-colors"
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
                href={mediaHref(item.mediaType, createSlug(item.title, item.id))}
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
                onClick={() => removeItem(item.id, item.mediaType)}
                aria-disabled={isSaving}
                aria-busy={isSaving}
                aria-label={`Remove ${item.title} from ${collection.name}`}
                // Revealed on hover only where there is hover. On a touch
                // screen it used to be invisible yet still tappable, so a tap
                // near a poster's corner removed the title without warning.
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-black/80 text-gray-300 opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-300 aria-disabled:cursor-wait transition-opacity"
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
