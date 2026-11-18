"use client";

import Image from "next/image";
import Link from "@/i18n/Link";
import { User } from "lucide-react";
import { createSlug } from "@/lib/utils";
import { isPlainPrimaryClick } from "@/lib/plain-click";
import { getImageUrl } from "@/lib/tmdb-image";
import type { Person } from "@/types/tmdb";
import { personHref } from "@/lib/routes";
import { useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/locale";

/**
 * TMDB's `known_for_department`, which it sends in English whatever language
 * was asked for. Its own fixed list; anything else is shown as it came.
 */
const CZECH_DEPARTMENTS: Record<string, string> = {
  Acting: "Herectví",
  Directing: "Režie",
  Writing: "Scénář",
  Production: "Produkce",
  Sound: "Zvuk",
  Camera: "Kamera",
  Editing: "Střih",
  Art: "Výprava",
  Crew: "Štáb",
  "Visual Effects": "Vizuální efekty",
  "Costume & Make-Up": "Kostýmy a masky",
  Lighting: "Osvětlení",
  Creator: "Tvorba",
};

/** A person's department in the page's language: "Acting", „Herectví“. */
export function departmentName(department: string, locale: Locale): string {
  return locale === "cs"
    ? (CZECH_DEPARTMENTS[department] ?? department)
    : department;
}

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
  const locale = useLocale();

  if (people.length === 0) return null;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
      {people.map((person) => (
        <Link
          key={person.id}
          href={personHref(createSlug(person.name, person.id))}
          prefetch={false}
          // Only the click that leaves this page: a person opened in a new tab
          // must not close the search overlay the grid sits in.
          onClick={
            onSelect
              ? (event) => {
                  if (isPlainPrimaryClick(event)) onSelect();
                }
              : undefined
          }
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
              {departmentName(person.known_for_department, locale)}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
