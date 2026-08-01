"use client";

import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import { createSlug } from "@/lib/utils";
import { getImageUrl } from "@/lib/tmdb-image";
import type { Person } from "@/types/tmdb";

/**
 * A grid of people, shared by the search page and the search overlay so the two
 * cannot drift apart on slugs or layout.
 */
export function PersonGrid({
  people,
  onSelect,
}: {
  people: Person[];
  /** Lets the overlay close itself when a result is chosen. */
  onSelect?: () => void;
}) {
  if (people.length === 0) return null;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
      {people.map((person) => (
        <Link
          key={person.id}
          href={`/person/${createSlug(person.name, person.id)}`}
          prefetch={false}
          onClick={onSelect}
          className="group block text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
        >
          <div className="relative aspect-2/3 mb-2 overflow-hidden rounded-lg bg-gray-800">
            {person.profile_path ? (
              <Image
                src={getImageUrl(person.profile_path, "w185")}
                alt={person.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-8 h-8 text-gray-600" aria-hidden="true" />
              </div>
            )}
          </div>
          <p className="text-xs font-medium text-white group-hover:text-blue-400 transition-colors line-clamp-2 leading-tight">
            {person.name}
          </p>
          {person.known_for_department && (
            <p className="text-xs text-gray-500">
              {person.known_for_department}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
