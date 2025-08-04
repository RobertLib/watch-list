"use client";

import { useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { Video } from "@/types/tmdb";

interface VideoOverlayProps {
  isOpen: boolean;
  video: Video | null;
  isLoading: boolean;
  onClose: () => void;
}

export function VideoOverlay({
  isOpen,
  video,
  isLoading,
  onClose,
}: VideoOverlayProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
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
            src={`https://www.youtube.com/embed/${video.key}?autoplay=1&rel=0`}
            title={video.name}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            id="video-title"
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
