"use client";

import { useState } from "react";
import { FilterBar } from "./FilterBar";
import type { FilterOptions } from "@/types/filters";

interface AdvancedFiltersPanelProps {
  type: "movie" | "tv";
  onFiltersChange: (filters: FilterOptions) => void;
  isExpanded?: boolean;
}

export function AdvancedFiltersPanel({
  type,
  onFiltersChange,
  isExpanded = false,
}: AdvancedFiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(isExpanded);

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

      {/* Collapsible Content */}
      <div
        id="filters-panel"
        className={`transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
        }`}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
      >
        <div className="p-4 pt-0 border-t border-gray-700">
          <FilterBar type={type} onFiltersChange={onFiltersChange} />

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
                • Select a Genre to discover content in your favorite categories
              </li>
              <li>• Set Min. Rating to find highly-rated content only</li>
              <li>
                • Choose Country of Origin to find content from specific
                countries
              </li>
              <li>
                • Click &ldquo;Clear Filters&rdquo; to reset all filters and
                return to default view
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
