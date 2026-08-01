"use client";

import { Layers, Search, X } from "lucide-react";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { cn } from "@/lib/utils";
import {
  SORT_LABELS,
  type WatchlistGrouping,
  type WatchlistPreferences,
  type WatchlistSort,
  type WatchlistTypeFilter,
} from "@/lib/watchlist-view";

const TYPE_OPTIONS: Array<{ value: WatchlistTypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
];

/**
 * Sort, filter and grouping for the watchlist.
 *
 * The controls are what turn a long list back into something usable, so they sit
 * above the list rather than behind a disclosure – "what can I watch tonight" is
 * the question the page is opened with.
 */
export function WatchlistControls({
  preferences,
  onChange,
  query,
  onQueryChange,
  counts,
  isCheckingAvailability,
}: {
  preferences: WatchlistPreferences;
  onChange: (next: WatchlistPreferences) => void;
  query: string;
  onQueryChange: (query: string) => void;
  counts: { all: number; movie: number; tv: number };
  isCheckingAvailability: boolean;
}) {
  const grouped = preferences.grouping === "availability";

  return (
    <div className="space-y-3 mb-8">
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div
          role="group"
          aria-label="Filter by type"
          className="flex rounded-lg border border-gray-800 bg-gray-900/60 p-1"
        >
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ ...preferences, type: option.value })}
              aria-pressed={preferences.type === option.value}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                preferences.type === option.value
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white",
              )}
            >
              {option.label}
              <span className="ml-1.5 text-xs text-gray-500">
                {counts[option.value]}
              </span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <label htmlFor="watchlist-sort" className="text-sm text-gray-400">
            Sort
          </label>
          <select
            id="watchlist-sort"
            value={preferences.sort}
            onChange={(event) =>
              onChange({
                ...preferences,
                sort: event.target.value as WatchlistSort,
              })
            }
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-gray-900"
          >
            {(Object.keys(SORT_LABELS) as WatchlistSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>

        {/* Availability grouping */}
        <button
          onClick={() =>
            onChange({
              ...preferences,
              grouping: (grouped
                ? "none"
                : "availability") as WatchlistGrouping,
            })
          }
          aria-pressed={grouped}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            grouped
              ? "border-blue-500 bg-blue-500/15 text-blue-200"
              : "border-gray-800 bg-gray-900/60 text-gray-300 hover:text-white",
          )}
        >
          <Layers className="w-4 h-4" aria-hidden="true" />
          Group by where to watch
          {grouped && isCheckingAvailability && (
            <span
              className="w-3.5 h-3.5 rounded-full border-2 border-blue-300 border-t-transparent animate-spin"
              aria-hidden="true"
            />
          )}
        </button>

        <div className="ml-auto">
          <ViewModeToggle />
        </div>
      </div>

      {/* Title search – the cheapest way through a list of eighty. */}
      <div className="relative max-w-sm">
        <label htmlFor="watchlist-search" className="sr-only">
          Search your list
        </label>
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
          aria-hidden="true"
        />
        <input
          id="watchlist-search"
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search your list…"
          className="w-full rounded-lg border border-gray-800 bg-gray-900 pl-9 pr-9 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => onQueryChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
