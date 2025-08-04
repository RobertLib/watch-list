"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { createSlug } from "@/lib/utils";
import type { Person } from "@/types/tmdb";

interface PeopleContentProps {
  people: Person[];
}

type FilterKey = "all" | "movies" | "tv" | "both";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movies", label: "Movies" },
  { key: "tv", label: "TV Shows" },
  { key: "both", label: "Movies & TV" },
];

function getMediaMix(person: Person): FilterKey {
  const hasMovie = person.known_for.some(
    (item) => "media_type" in item && item.media_type === "movie",
  );
  const hasTV = person.known_for.some(
    (item) => "media_type" in item && item.media_type === "tv",
  );
  if (hasMovie && hasTV) return "both";
  if (hasMovie) return "movies";
  if (hasTV) return "tv";
  return "movies"; // fallback
}

export function PeopleContent({ people }: PeopleContentProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const filtered =
    activeFilter === "all"
      ? people
      : activeFilter === "both"
        ? people.filter((p) => getMediaMix(p) === "both")
        : people.filter(
            (p) => getMediaMix(p) === activeFilter || getMediaMix(p) === "both",
          );

  return (
    <>
      {/* Filter tabs */}
      <div
        className="flex flex-wrap items-center gap-2 mb-8"
        role="tablist"
        aria-label="Filter by media type"
      >
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? people.length
              : f.key === "both"
                ? people.filter((p) => getMediaMix(p) === "both").length
                : people.filter(
                    (p) =>
                      getMediaMix(p) === f.key || getMediaMix(p) === "both",
                  ).length;
          if (f.key !== "all" && count === 0) return null;
          return (
            <button
              key={f.key}
              role="tab"
              aria-selected={activeFilter === f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeFilter === f.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {f.label}
              <span className="ml-2 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
        <span className="ml-auto text-sm text-gray-500 self-center">
          {filtered.length} {filtered.length === 1 ? "person" : "people"}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map((person, index) => {
          const knownForTitles = person.known_for
            .map((item) =>
              "title" in item
                ? (item as { title: string }).title
                : "name" in item
                  ? (item as { name: string }).name
                  : "",
            )
            .filter(Boolean)
            .slice(0, 2);

          return (
            <Link
              key={person.id}
              href={`/person/${createSlug(person.name, person.id)}`}
              className="group block"
            >
              <div className="relative aspect-2/3 mb-3 overflow-hidden rounded-lg bg-gray-800">
                <Image
                  src={tmdbApi.getImageUrl(person.profile_path, "w500")}
                  alt={person.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-200"
                  loading={index < 12 ? "eager" : "lazy"}
                />
                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </div>
              <p className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors leading-tight line-clamp-1">
                {person.name}
              </p>
              {person.known_for_department && (
                <span className="inline-block text-xs text-blue-400/80 mt-0.5">
                  {person.known_for_department}
                </span>
              )}
              {knownForTitles.length > 0 && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                  {knownForTitles.join(" · ")}
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-400 text-center py-16">
          No results for this category.
        </p>
      )}
    </>
  );
}
