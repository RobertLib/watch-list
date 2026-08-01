"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import {
  buildSharedListPath,
  MAX_SHARED_LIST_ITEMS,
  MAX_SHARED_LIST_TITLE_LENGTH,
  type SharedListRef,
} from "@/lib/shared-list";
import { toast } from "@/components/Toast";

/**
 * Turn the current list into a link.
 *
 * The titles travel in the URL itself, which is what makes this possible with no
 * account and nothing stored server-side: the same link shares a list with a
 * friend and carries it onto a second device.
 *
 * The panel opens first even where the native share sheet is available. Handing
 * straight to the sheet would skip naming the list – and a list arriving as
 * "A shared watchlist" is the whole difference between a link that gets opened
 * and one that gets ignored.
 */
export function ShareListButton({
  items,
  defaultTitle,
}: {
  items: SharedListRef[];
  defaultTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Whether the platform has a native share sheet. Read through a store rather
  // than in an effect: the server has no `navigator`, so branching on it during
  // render would make the two disagree at hydration – and the answer never
  // changes after load, hence the no-op subscribe.
  const canShareNatively = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && !!navigator.share,
    () => false,
  );

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

  if (items.length === 0) return null;

  const path = buildSharedListPath(items, title);
  // `window` is absent while this renders on the server; the relative path is
  // replaced with the absolute one as soon as the browser takes over.
  const url =
    typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const truncated = items.length > MAX_SHARED_LIST_ITEMS;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright. The field is selectable, so
      // there is still a way to get the link out – say so rather than failing
      // silently.
      toast.showToast("Copy the link from the box instead", "info");
    }
  }

  async function shareNatively() {
    try {
      await navigator.share({ title: title || "My watchlist", url });
    } catch {
      // The visitor dismissed the sheet, which is not an error.
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-semibold transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-expanded={open}
      >
        <Share2 className="w-4 h-4" aria-hidden="true" />
        Share
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl bg-gray-800 border border-white/10 shadow-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-white text-sm">Share this list</p>
              <p className="text-xs text-gray-400 mt-0.5">
                The titles travel inside the link – no account needed on either
                end.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-white shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label
              htmlFor="share-list-title"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Name it (optional)
            </label>
            <input
              id="share-list-title"
              type="text"
              value={title}
              maxLength={MAX_SHARED_LIST_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="My sci-fi picks"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="share-list-url" className="sr-only">
              Share link
            </label>
            <input
              id="share-list-url"
              type="text"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-300 font-mono"
            />
          </div>

          {truncated && (
            <p className="text-xs text-amber-300/80">
              Only the first {MAX_SHARED_LIST_ITEMS} titles fit in a link.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {copied ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>

            {canShareNatively && (
              <button
                onClick={shareNatively}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                Share…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
