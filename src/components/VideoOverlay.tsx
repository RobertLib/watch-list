"use client";

import { useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { Video } from "@/types/tmdb";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus and scroll lock, for exactly as long as the dialog is open.
  //
  // Kept apart from the key handler below so that a parent re-rendering with a
  // fresh `onClose` cannot re-run this one: that would hand focus "back" to the
  // close button and re-read the lock mid-session.
  useEffect(() => {
    if (!isOpen) return;

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

    return () => {
      document.body.style.overflow = previousOverflow;
      // Only if the opener is still on the page: a card that unmounted while
      // the trailer played – the visitor navigated – has nothing to focus.
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
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
      <div
        className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute -top-12 right-0 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
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
        ) : video ? (
          <iframe
            // youtube-nocookie, matching the other trailer player: the two are
            // the same feature reached from two places, and only one of them
            // used to spare the visitor YouTube's tracking cookies.
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
    </div>
  );
}
