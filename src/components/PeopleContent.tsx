"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getImageUrl } from "@/lib/tmdb-image";
import { createSlug } from "@/lib/utils";
import type { Person } from "@/types/tmdb";
import { personHref } from "@/lib/routes";

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
      {/* These filter one grid rather than switching between tab panels. */}
      <div
        className="flex flex-wrap items-center gap-2 mb-8"
        role="group"
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
              type="button"
              aria-pressed={activeFilter === f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeFilter === f.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {f.label}{" "}
              <span className="ml-2 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
        <span className="ml-auto text-sm text-gray-500 self-center" aria-live="polite">
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
              href={personHref(createSlug(person.name, person.id))}
              prefetch={false}
              className="group block"
            >
              <div className="relative aspect-2/3 mb-3 overflow-hidden rounded-lg bg-gray-800">
                {/* A card is roughly 140–235px wide across the breakpoints,
                    so a 2x screen wants up to ~470px: h632 (421×632) is the
                    profile size that comes closest, short of the full-size
                    original. The w500 asked for before is 40% more pixels per
                    card, and the first twelve cards load eagerly. */}
                <Image
                  src={getImageUrl(person.profile_path, "h632")}
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
