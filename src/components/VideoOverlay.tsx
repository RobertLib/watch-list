"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { Video } from "@/types/tmdb";
import { useHydrated } from "@/hooks/useHydrated";
import { isPlayableYouTubeVideo } from "@/lib/trailer";

interface VideoOverlayProps {
  isOpen: boolean;
  video: Video | null;
  isLoading: boolean;
  onClose: () => void;
}

/**
 * What the Tab key may land on inside the player. The iframe is in the list on
 * purpose: tabbing into YouTube's own controls is the point of the dialog.
 */
const FOCUSABLE =
  'button:not([disabled]), [href], iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The trailer player, as a modal dialog.
 *
 * Modal in the ARIA sense and in the keyboard sense both: while it is open,
 * focus lives inside it, Tab cycles within it, Escape closes it, and closing
 * hands focus back to whatever opened it – the play button on a poster, or the
 * thumbnail in a detail page's video grid. Without that, a keyboard user who
 * opened a trailer was left with focus on a button hidden under the backdrop,
 * and closing it dropped them at the top of the document.
 */
export function VideoOverlay({
  isOpen,
  video,
  isLoading,
  onClose,
}: VideoOverlayProps) {
  const hydrated = useHydrated();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus and scroll lock, for exactly as long as the dialog is open.
  //
  // Kept apart from the key handler below so that a parent re-rendering with a
  // fresh `onClose` cannot re-run this one: that would hand focus "back" to the
  // close button and re-read the lock mid-session.
  useEffect(() => {
    if (!isOpen || !hydrated) return;

    // Whatever was focused before the dialog took over – the play button, in
    // practice – gets focus back on close. Read now, before the focus below
    // moves it.
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // What was there is put back, not a fixed value. `Navigation` locks the same
    // property while its results are up, and a trailer opened from those results
    // used to unlock the page underneath a panel that was still open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    // Focus that lands outside the dialog is handed back to the close button.
    // The Escape and Tab handlers below listen on this document, and a click
    // into the YouTube player moves focus into a cross-origin frame whose key
    // events never reach it – a platform limit, not something to fight. What
    // the visitor can still do is Shift+Tab out of the player, which lands on
    // the close button, or Tab past its last control, which leaves through the
    // browser's toolbar and comes back in at the page's first link, underneath
    // the backdrop. This is what catches that second route.
    const reclaimFocus = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (
        dialog &&
        event.target instanceof Node &&
        !dialog.contains(event.target)
      ) {
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("focusin", reclaimFocus);

    return () => {
      // Removed before the opener is refocused, or that refocus would be
      // "reclaimed" by a dialog that is closing.
      document.removeEventListener("focusin", reclaimFocus);
      document.body.style.overflow = previousOverflow;
      // Only if the opener is still on the page: a card that unmounted while
      // the trailer played – the visitor navigated – has nothing to focus.
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, hydrated]);

  useEffect(() => {
    if (!isOpen || !hydrated) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      // A simple trap: Tab off the last control wraps to the first, and
      // Shift+Tab off the first wraps to the last. Enough for a dialog with a
      // close button and a player.
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Focus outside the dialog altogether – it was never moved in, or the
      // player stole it – is brought back to the start rather than left to
      // wander the page underneath.
      if (!(active instanceof HTMLElement) || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hydrated, onClose]);

  if (!isOpen || !hydrated) return null;

  // Escape the hero's stacking context so the backdrop covers the navigation
  // too. Hydration gating keeps document access out of the static prerender.
  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      // Named directly rather than by the iframe's id: the loading and the
      // "not available" branches render no iframe, and a dialog labelled by an
      // element that does not exist has no name at all.
      aria-label={video ? `Video: ${video.name}` : "Video player"}
      onClick={onClose}
    >
      {/* Fit both viewport dimensions while keeping 16:9. Width alone puts the
          top of the player and its close button off short landscape screens. */}
      <div
        className="relative max-w-5xl aspect-video bg-black rounded-lg overflow-hidden"
        style={{ width: "min(100%, calc((100dvh - 2rem) * 16 / 9))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Keep the close control inside the clipped player so it stays visible
            on small screens and in landscape. */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
          aria-label="Close video player"
        >
          <X className="w-6 h-6" aria-hidden="true" />
        </button>

        {isLoading ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="w-8 h-8 text-white animate-spin"
              aria-hidden="true"
            />
            <span className="sr-only">Loading video...</span>
          </div>
        ) : video && isPlayableYouTubeVideo(video) ? (
          <iframe
            // youtube-nocookie, matching the other trailer player: the two are
            // the same feature reached from two places, and only one of them
            // used to spare the visitor YouTube's tracking cookies. The key is
            // checked to be an id (`isPlayableYouTubeVideo`), because it lands
            // in the path, where a `/` or `?` of its own would change the URL.
            src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0`}
            title={video.name}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-white"
            role="alert"
          >
            <p>Video is not available</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
