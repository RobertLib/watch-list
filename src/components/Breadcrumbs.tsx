"use client";

import Link from "@/i18n/Link";
import { ChevronRight, Home } from "lucide-react";
import { Genre } from "@/types/tmdb";
import { createSlug } from "@/lib/utils";
import { genreHref } from "@/lib/routes";
import { findGenreById, genreSlug } from "@/lib/genre-catalog";
import { useT } from "@/i18n/LocaleProvider";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  const t = useT();
  return (
    <nav
      aria-label={t("Breadcrumb", "Drobečková navigace")}
      className={`flex items-center space-x-2 text-sm text-gray-400 ${className}`}
    >
      <Link
        href="/"
        prefetch={false}
        className="hover:text-white transition-colors flex items-center"
        aria-label={t("Home", "Domů")}
      >
        <Home className="w-4 h-4" />
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={item.href} className="flex items-center space-x-2">
            <ChevronRight className="w-4 h-4 text-gray-600" />
            {isLast ? (
              <span className="text-gray-300 font-medium" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                prefetch={false}
                className="hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}

interface MediaBreadcrumbsProps {
  mediaType: "movie" | "tv";
  title: string;
  genres?: Genre[];
}

export function MediaBreadcrumbs({
  mediaType,
  title,
  genres = [],
}: MediaBreadcrumbsProps) {
  const t = useT();
  const items: BreadcrumbItem[] = [
    {
      label:
        mediaType === "movie"
          ? t("Movies", "Filmy")
          : t("TV Shows", "Seriály"),
      href: mediaType === "movie" ? "/movies" : "/tv-shows",
    },
  ];

  // Add primary genre if available
  if (genres.length > 0) {
    const primaryGenre = genres[0];
    // The genre page is published under the catalogue's English slug in both
    // trees. On a Czech page TMDB names the genre in Czech ("Akční"), and a
    // slug made from that name is a page the build never wrote.
    const known = findGenreById(mediaType, primaryGenre.id);
    items.push({
      label: primaryGenre.name,
      href: genreHref(
        mediaType,
        known
          ? genreSlug(known)
          : createSlug(primaryGenre.name, primaryGenre.id),
      ),
    });
  }

  // Add current title (will be displayed as current page)
  items.push({
    label: title,
    href: "#",
  });

  return <Breadcrumbs items={items} />;
}
