"use client";

import { useState } from "react";
import { DiscoverFilterBar } from "./DiscoverFilterBar";
import { useGenres } from "@/contexts/GenresContext";
import type { DiscoverMediaType } from "@/lib/discover-filters";

interface AdvancedFiltersPanelProps {
  type: DiscoverMediaType;
  isExpanded?: boolean;
}

export function AdvancedFiltersPanel({
  type,
  isExpanded = false,
}: AdvancedFiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(isExpanded);
  const { movieGenres, tvGenres } = useGenres();

  return (
    <div className="bg-gray-900/50 rounded-lg mb-8 overflow-hidden">
      {/* Toggle Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-white hover:bg-gray-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        aria-expanded={isOpen}
        aria-controls="filters-panel"
        aria-label={
          isOpen ? "Collapse advanced filters" : "Expand advanced filters"
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">
            Advanced Filters & Sorting
          </span>
          <span className="text-sm text-gray-400">
            (Sort, filter by year, genre, rating, and more)
          </span>
        </div>
        <div
          className={`transform transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Collapsible Content. Animating the grid row instead of a max-height
          keeps tall content (stacked selects on a phone) from being clipped. */}
      <div
        id="filters-panel"
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
      >
        {/* The padding lives one level deeper so it collapses with the row. */}
        <div className="overflow-hidden">
          <div className="p-4 pt-0 border-t border-gray-700">
            <DiscoverFilterBar
              type={type}
              genres={type === "movie" ? movieGenres : tvGenres}
            />

            {/* Filter Tips */}
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded-md">
              <h4 className="text-sm font-medium text-blue-300 mb-2">
                💡 Filter Tips:
              </h4>
              <ul className="text-xs text-blue-200 space-y-1">
                <li>
                  • Use Sort By to order results by popularity, rating, release
                  date, or title
                </li>
                <li>
                  • Filter by Year to find{" "}
                  {type === "movie" ? "movies" : "TV shows"} from specific years
                </li>
                <li>
                  • Select a Genre to discover content in your favorite
                  categories
                </li>
                <li>
                  • Min. Rating only counts titles with enough votes, so you get
                  genuinely well-rated content instead of obscure one-off
                  ratings
                </li>
                <li>
                  • Choose Country of Origin to find content from specific
                  countries
                </li>
                <li>
                  • Remove a single filter with its ✕ chip, or click &ldquo;Clear
                  Filters&rdquo; to reset everything
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
