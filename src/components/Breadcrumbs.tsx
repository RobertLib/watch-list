"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { Genre } from "@/types/tmdb";
import { createSlug } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center space-x-2 text-sm text-gray-400 ${className}`}
    >
      <Link
        href="/"
        className="hover:text-white transition-colors flex items-center"
        aria-label="Home"
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
  const items: BreadcrumbItem[] = [
    {
      label: mediaType === "movie" ? "Movies" : "TV Shows",
      href: mediaType === "movie" ? "/movies" : "/tv-shows",
    },
  ];

  // Add primary genre if available
  if (genres.length > 0) {
    const primaryGenre = genres[0];
    items.push({
      label: primaryGenre.name,
      href: `/genres/${mediaType}/${createSlug(
        primaryGenre.name,
        primaryGenre.id
      )}`,
    });
  }

  // Add current title (will be displayed as current page)
  items.push({
    label: title,
    href: "#",
  });

  return <Breadcrumbs items={items} />;
}
