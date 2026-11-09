"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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
  MAX_COLLECTION_ITEMS,
  MAX_COLLECTIONS,
  notifyCollectionsChanged,
  removeFromCollection,
  saveCollections,
  subscribeToCollections,
  type CollectionItem,
} from "@/lib/collections";
import { cn } from "@/lib/utils";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { DEFAULT_PROFILE_ID, getActiveProfileId, subscribeProfiles } from "@/lib/profiles";
import { withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

const getServerProfileId = () => DEFAULT_PROFILE_ID;

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
  const profileId = useSyncExternalStore(
    subscribeProfiles,
    getActiveProfileId,
    getServerProfileId,
  );
  return <ProfileAddToListButton key={profileId} item={item} className={className} profileId={profileId} />;
}

function ProfileAddToListButton({ item, className, profileId }: {
  item: CollectionItem;
  className?: string;
  profileId: string;
}) {
  const collections = useSyncExternalStore(
    subscribeToCollections,
    getCollectionsSnapshot,
    getServerCollectionsSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Dismissed by clicking away or pressing Escape, like every other panel here.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      // Escape during IME composition cancels the composition, not the picker.
      if (event.key !== "Escape" || event.isComposing) return;
      // Spent on the picker, so the header's Escape (search, menu) stands down.
      event.preventDefault();
      if (panelRef.current?.contains(document.activeElement)) {
        triggerRef.current?.focus();
      }
      setOpen(false);
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

  useLayoutEffect(() => {
    if (!open) return;

    function positionPanel() {
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel) return;

      // Detail actions can wrap with this button near either viewport edge.
      // Keep the whole picker, including its create control, within reach.
      const margin = 16;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const anchor = container.getBoundingClientRect();
      const width = panel.getBoundingClientRect().width;
      const left = Math.max(
        margin,
        Math.min(anchor.left, viewportWidth - margin - width),
      );
      panel.style.left = `${left - anchor.left}px`;
    }

    positionPanel();
    window.addEventListener("resize", positionPanel);
    return () => window.removeEventListener("resize", positionPanel);
  }, [open, memberOf]);

  function isCurrentProfile() {
    try {
      if (profileId === getActiveProfileId({ strict: true })) return true;
    } catch {
      toast.showToast("Could not check your active profile. Reload the page and try again.", "error");
      return false;
    }

    setOpen(false);
    setNewName("");
    toast.showToast("Your active profile changed. Reopen the list picker and try again.", "info");
    return false;
  }

  async function mutate(operation: () => void) {
    if (saving.current || !isCurrentProfile()) return;
    saving.current = true;
    setIsSaving(true);
    try {
      const handled = await withProfileRosterLock(() => {
        if (!mounted.current || !isCurrentProfile()) return true;
        withProfileStorage(profileId, operation);
        return true;
      }, false);
      if (!handled && mounted.current) toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
    } finally {
      saving.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }

  async function toggle(collectionId: string, wasMember: boolean) {
    // Read only after obtaining the shared lock; keep the clicked checkbox's
    // intended state even if another tab changed its membership while we waited.
    await mutate(() => {
      const latest = getCollectionsSnapshot({ strict: true });
      const collection = latest.find((entry) => entry.id === collectionId);
      if (!collection) {
        toast.showToast("That list is no longer available. Reopen the list picker and try again.", "info");
        return;
      }
      if (
        !wasMember &&
        !isInCollection(collection, item.id, item.mediaType) &&
        collection.items.length >= MAX_COLLECTION_ITEMS
      ) {
        notifyCollectionsChanged();
        toast.showToast(
          `"${collection.name}" is full (${MAX_COLLECTION_ITEMS} titles). Remove a title before adding another.`,
          "error",
        );
        return;
      }
      const saved = saveCollections(
        wasMember
          ? removeFromCollection(
              latest,
              collectionId,
              item.id,
              item.mediaType,
            )
          : addToCollection(latest, collectionId, item),
      );
      if (!saved) toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
    });
  }

  async function createAndAdd(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !isCurrentProfile()) return;

    const trimmed = newName.trim();
    if (!trimmed) {
      toast.showToast("Enter a list name with visible characters", "error");
      return;
    }

    await mutate(() => {
      const latest = getCollectionsSnapshot({ strict: true });
      if (latest.length >= MAX_COLLECTIONS) {
        toast.showToast("That is the most lists one browser can hold", "error");
        return;
      }

      const withNew = createCollection(latest, trimmed, [item]);
      // Sanitizing a name can leave it empty even after trim (for example U+200B).
      // A refused creation returns the original lists; never treat one as new.
      if (withNew === latest) {
        toast.showToast("Enter a list name with visible characters", "error");
        return;
      }
      if (!saveCollections(withNew)) {
        toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
        return;
      }

      setNewName("");
      toast.showToast(`Added to "${withNew[0].name}"`, "success");
    });
  }

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        // A disclosure, like Share: expanded or not, and which panel it opens.
        // `aria-haspopup="true"` announced a menu, and the panel is not one –
        // no menu role, no arrow keys – so a screen reader promised behaviour
        // that was not there.
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
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
        <div
          ref={panelRef}
          id={panelId}
          className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-32px)] rounded-xl border border-gray-700 bg-gray-900 shadow-xl p-3 space-y-3"
        >
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
                      // Not native `disabled`: browsers blur a disabled button,
                      // so ticking a list by keyboard dropped focus out of the
                      // open picker. `mutate` refuses a second write instead.
                      aria-disabled={isSaving}
                      aria-busy={isSaving}
                      aria-pressed={isMember}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm hover:bg-white/5 aria-disabled:cursor-wait transition-colors focus:outline-none focus-visible:bg-white/10"
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
                        {collection.items.length >= MAX_COLLECTION_ITEMS && " · full"}
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
              // Read-only rather than disabled while saving, for the same
              // reason as the buttons: Enter in this box must not lose focus.
              readOnly={isSaving}
              aria-busy={isSaving}
              maxLength={MAX_COLLECTION_NAME_LENGTH}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New list…"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/60 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              aria-disabled={isSaving}
              aria-busy={isSaving}
              aria-label="Create list and add this title"
              className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 aria-disabled:opacity-60 aria-disabled:cursor-wait text-white transition-colors"
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
