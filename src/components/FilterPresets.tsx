"use client";

import { useState } from "react";
import { AdvancedFiltersPanel } from "./AdvancedFiltersPanel";
import type { FilterOptions } from "@/types/filters";

interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: FilterOptions;
}

const MOVIE_PRESETS: FilterPreset[] = [
  {
    id: "latest-blockbusters",
    name: "Latest Blockbusters",
    description: "Popular movies from the last 2 years",
    filters: {
      sortBy: "popularity.desc",
      primaryReleaseDateGte: new Date(
        Date.now() - 2 * 365 * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split("T")[0],
      voteCountGte: 100,
    },
  },
  {
    id: "hidden-gems",
    name: "Hidden Gems",
    description: "Highly rated movies with fewer votes",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 7,
      voteCountGte: 50,
    },
  },
  {
    id: "recent-releases",
    name: "Recent Releases",
    description: "Movies released in the last 6 months",
    filters: {
      sortBy: "primary_release_date.desc",
      primaryReleaseDateGte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    },
  },
  {
    id: "top-rated-classics",
    name: "Top Rated Classics",
    description: "Highest rated movies of all time",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 8,
      voteCountGte: 1000,
    },
  },
];

const TV_PRESETS: FilterPreset[] = [
  {
    id: "trending-series",
    name: "Trending Series",
    description: "Popular TV shows currently airing",
    filters: {
      sortBy: "popularity.desc",
      voteCountGte: 50,
    },
  },
  {
    id: "binge-worthy",
    name: "Binge-Worthy",
    description: "Highly rated completed series",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 7.5,
      voteCountGte: 100,
    },
  },
  {
    id: "new-series",
    name: "New Series",
    description: "TV shows that started in the last year",
    filters: {
      sortBy: "first_air_date.desc",
      year: new Date().getFullYear().toString(),
    },
  },
  {
    id: "award-winners",
    name: "Award Winners",
    description: "Critically acclaimed TV series",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 8.5,
      voteCountGte: 200,
    },
  },
];

interface FilterPresetsProps {
  type: "movie" | "tv";
  onFiltersChange: (filters: FilterOptions) => void;
}

export function FilterPresets({ type, onFiltersChange }: FilterPresetsProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const presets = type === "movie" ? MOVIE_PRESETS : TV_PRESETS;

  const handlePresetSelect = (preset: FilterPreset) => {
    setSelectedPreset(preset.id);
    onFiltersChange(preset.filters);
  };

  const handleCustomFilters = (filters: FilterOptions) => {
    setSelectedPreset(null);
    onFiltersChange(filters);
  };

  return (
    <div className="space-y-6">
      {/* Quick Presets */}
      <section className="bg-gray-900/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Filters</h3>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          role="group"
          aria-labelledby="quick-filters-heading"
        >
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetSelect(preset)}
              className={`p-4 rounded-lg border-2 transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                selectedPreset === preset.id
                  ? "border-blue-500 bg-blue-900/30"
                  : "border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800"
              }`}
              aria-pressed={selectedPreset === preset.id}
              aria-label={`Apply ${preset.name} filter preset`}
            >
              <h4 className="font-medium text-white mb-1">{preset.name}</h4>
              <p className="text-sm text-gray-400">{preset.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Advanced Filters */}
      <AdvancedFiltersPanel
        type={type}
        onFiltersChange={handleCustomFilters}
        isExpanded={selectedPreset !== null}
      />
    </div>
  );
}
