"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { getImageUrl } from "@/lib/tmdb-image";
import type { TMDBImage } from "@/types/tmdb";

interface MediaGalleryProps {
  backdrops: TMDBImage[];
  posters: TMDBImage[];
  title: string;
}

type Tab = "backdrops" | "posters";

function Lightbox({
  images,
  startIndex,
  title,
  onClose,
}: {
  images: TMDBImage[];
  startIndex: number;
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const img = images[index];

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Keep this separate from focus setup so a new onClose callback never resets
  // focus or replaces the original scroll lock while the gallery is open.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        setIndex((i) => (i + direction + images.length) % images.length);
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      const controls = dialog?.querySelectorAll<HTMLButtonElement>("button");
      if (!dialog || !controls?.length) return;

      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [images.length, onClose]);

  function prev() {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }
  function next() {
    setIndex((i) => (i + 1) % images.length);
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} image gallery`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* Close */}
      <button
        ref={closeButtonRef}
        type="button"
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-8 h-8" />
      </button>

      {/* Counter */}
      <span
        className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/60 text-sm"
        aria-live="polite"
        aria-atomic="true"
      >
        {index + 1} / {images.length}
      </span>

      {/* Prev */}
      {images.length > 1 && (
        <button
          type="button"
          className="absolute left-3 sm:left-6 z-10 text-white/70 hover:text-white p-2"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {/* Image */}
      <div
        className="relative max-w-5xl w-full h-[calc(100dvh-8rem)] mx-16 sm:mx-24"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={getImageUrl(img.file_path, "original")}
          alt={`${title} — image ${index + 1}`}
          fill
          className="object-contain"
          sizes="(max-width: 1024px) 100vw, 1024px"
        />
      </div>

      {/* Next */}
      {images.length > 1 && (
        <button
          type="button"
          className="absolute right-3 sm:right-6 z-10 text-white/70 hover:text-white p-2"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
    </div>
  );
}

const MAX_DISPLAY = 18;

export function MediaGallery({ backdrops, posters, title }: MediaGalleryProps) {
  const [tab, setTab] = useState<Tab>("backdrops");
  const [lightbox, setLightbox] = useState<{
    images: TMDBImage[];
    index: number;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const hasBackdrops = backdrops.length > 0;
  const hasPosters = posters.length > 0;

  if (!hasBackdrops && !hasPosters) return null;

  // Default to first available tab
  const activeTab =
    tab === "backdrops" && !hasBackdrops
      ? "posters"
      : tab === "posters" && !hasPosters
        ? "backdrops"
        : tab;
  const images = activeTab === "backdrops" ? backdrops : posters;
  const visible = showAll ? images : images.slice(0, MAX_DISPLAY);

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">
        <Images className="w-6 h-6 text-gray-400" />
        Gallery
      </h2>

      {/* Tabs */}
      {hasBackdrops && hasPosters && (
        <div className="flex gap-2 mb-4">
          {(["backdrops", "posters"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setShowAll(false);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === t
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {t === "backdrops" ? "Backdrops" : "Posters"}
              <span className="ml-1.5 text-xs opacity-70">
                {t === "backdrops" ? backdrops.length : posters.length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div
        className={
          activeTab === "backdrops"
            ? "grid grid-cols-2 sm:grid-cols-3 gap-2"
            : "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2"
        }
      >
        {visible.map((img, i) => (
          <button
            key={img.file_path}
            type="button"
            onClick={() => setLightbox({ images, index: i })}
            className="relative overflow-hidden rounded-lg bg-gray-800 hover:opacity-90 transition-opacity group"
            style={{ aspectRatio: `${img.width}/${img.height}` }}
            aria-label={`${title} — image ${i + 1}`}
            aria-haspopup="dialog"
          >
            <Image
              src={getImageUrl(img.file_path, "w780")}
              alt={`${title} — image ${i + 1}`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-200"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
            />
          </button>
        ))}
      </div>

      {images.length > MAX_DISPLAY && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-blue-400 text-sm hover:underline flex items-center gap-1"
        >
          {showAll ? "Show fewer" : `Show all ${images.length} ${activeTab}`}
        </button>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          startIndex={lightbox.index}
          title={title}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
