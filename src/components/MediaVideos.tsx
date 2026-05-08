"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, X } from "lucide-react";
import type { Video } from "@/types/tmdb";

interface MediaVideosProps {
  videos: Video[];
}

const TYPE_ORDER = [
  "Trailer",
  "Teaser",
  "Clip",
  "Behind the Scenes",
  "Featurette",
  "Bloopers",
];

const TYPE_BADGE_COLOR: Record<string, string> = {
  Trailer: "bg-red-600",
  Teaser: "bg-orange-500",
  Clip: "bg-blue-600",
  "Behind the Scenes": "bg-purple-600",
  Featurette: "bg-indigo-600",
  Bloopers: "bg-green-600",
};

function sortVideos(videos: Video[]): Video[] {
  return [...videos]
    .filter((v) => v.site === "YouTube")
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type);
      const aOrder = ai === -1 ? 99 : ai;
      const bOrder = bi === -1 ? 99 : bi;
      if (aOrder !== bOrder) return aOrder - bOrder;
      // Official first within same type
      return (b.official ? 1 : 0) - (a.official ? 1 : 0);
    });
}

function VideoPlayer({
  video,
  onClose,
}: {
  video: Video;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-8 h-8" />
      </button>
      <div
        className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0`}
          title={video.name}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

const INITIAL_COUNT = 6;

export function MediaVideos({ videos }: MediaVideosProps) {
  const [active, setActive] = useState<Video | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = sortVideos(videos);
  if (sorted.length === 0) return null;

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-white">Videos</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((video) => {
          const badgeColor = TYPE_BADGE_COLOR[video.type] ?? "bg-gray-600";
          return (
            <button
              key={video.id}
              onClick={() => setActive(video)}
              className="group relative rounded-lg overflow-hidden bg-gray-800 text-left hover:ring-2 hover:ring-blue-500 transition-all"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video">
                <Image
                  src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                  alt={video.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-200"
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors">
                    <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                  </div>
                </div>
                {/* Type badge */}
                <span
                  className={`absolute top-2 left-2 text-white text-xs font-medium px-2 py-0.5 rounded ${badgeColor}`}
                >
                  {video.type}
                </span>
              </div>
              {/* Title */}
              <p className="px-3 py-2 text-sm text-gray-200 group-hover:text-white transition-colors line-clamp-1">
                {video.name}
              </p>
            </button>
          );
        })}
      </div>

      {sorted.length > INITIAL_COUNT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-blue-400 text-sm hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${sorted.length} videos`}
        </button>
      )}

      {active && <VideoPlayer video={active} onClose={() => setActive(null)} />}
    </div>
  );
}
