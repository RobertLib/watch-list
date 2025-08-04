"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AdvancedFiltersPanel } from "./AdvancedFiltersPanel";
import type { FilterOptions } from "@/types/filters";

interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filters: FilterOptions;
}

export const MOVIE_PRESETS: FilterPreset[] = [
  {
    id: "latest-blockbusters",
    name: "Latest Blockbusters",
    description: "Popular movies from the last 2 years",
    filters: {
      sortBy: "popularity.desc",
      primaryReleaseDateGte: new Date(
        Date.now() - 2 * 365 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0],
      primaryReleaseDateLte: new Date().toISOString().split("T")[0],
      voteCountGte: 100,
    },
  },
  {
    id: "hidden-gems",
    name: "Hidden Gems",
    description: "Highly rated movies you might have missed",
    filters: {
      sortBy: "popularity.asc",
      minRating: 7.5,
      voteCountGte: 300,
      primaryReleaseDateGte: new Date(
        Date.now() - 10 * 365 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0],
      primaryReleaseDateLte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
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
      primaryReleaseDateLte: new Date().toISOString().split("T")[0],
      voteCountGte: 20,
    },
  },
  {
    id: "top-rated-classics",
    name: "Top Rated Classics",
    description: "Highest rated movies released before 2015",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 8,
      voteCountGte: 2000,
      primaryReleaseDateLte: "2014-12-31",
    },
  },
];

export const TV_PRESETS: FilterPreset[] = [
  {
    id: "trending-series",
    name: "Trending Series",
    description: "Popular TV shows currently airing",
    filters: {
      sortBy: "popularity.desc",
      firstAirDateGte: new Date(Date.now() - 4 * 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      firstAirDateLte: new Date().toISOString().split("T")[0],
      voteCountGte: 50,
    },
  },
  {
    id: "binge-worthy",
    name: "Binge-Worthy",
    description: "Highly rated series worth watching through",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 8,
      voteCountGte: 1000,
    },
  },
  {
    id: "new-series",
    name: "New Series",
    description: "TV shows that started this year",
    filters: {
      sortBy: "first_air_date.desc",
      firstAirDateGte: `${new Date().getFullYear()}-01-01`,
      firstAirDateLte: new Date().toISOString().split("T")[0],
      voteCountGte: 10,
    },
  },
  {
    id: "award-winners",
    name: "Award Winners",
    description: "Critically acclaimed TV series",
    filters: {
      sortBy: "vote_average.desc",
      minRating: 8.5,
      voteCountGte: 5000,
    },
  },
];

interface FilterPresetsProps {
  type: "movie" | "tv";
  onFiltersChange: (filters: FilterOptions) => void;
}

export function FilterPresets({ type, onFiltersChange }: FilterPresetsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const presets = type === "movie" ? MOVIE_PRESETS : TV_PRESETS;

  const selectedPreset = searchParams.get("preset");

  const handlePresetSelect = (preset: FilterPreset) => {
    router.push(`${pathname}?preset=${preset.id}`, { scroll: false });
    onFiltersChange(preset.filters);
  };

  const handleCustomFilters = (filters: FilterOptions) => {
    onFiltersChange(filters);
  };

  const hasAdvancedFilters = Boolean(
    searchParams.get("sort_by") ||
    searchParams.get("year") ||
    searchParams.get("genre") ||
    searchParams.get("min_rating") ||
    searchParams.get("language"),
  );

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
        isExpanded={hasAdvancedFilters}
      />
    </div>
  );
}
