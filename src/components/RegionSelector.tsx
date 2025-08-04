"use client";

import { useState, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { getSortedRegions, getPopularRegions } from "@/lib/regions-data";
import type { RegionData } from "@/lib/regions-data";
import { trackRegionChange } from "@/lib/analytics";

interface RegionSelectorProps {
  currentRegion: string;
  name: string;
}

export function RegionSelector({ currentRegion, name }: RegionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const allRegions = useMemo(() => getSortedRegions(), []);
  const popularRegions = useMemo(() => getPopularRegions(), []);

  const filteredRegions = useMemo(() => {
    if (!searchQuery) {
      return allRegions;
    }

    const query = searchQuery.toLowerCase();
    return allRegions.filter(
      (region) =>
        region.name.toLowerCase().includes(query) ||
        region.nativeName.toLowerCase().includes(query) ||
        region.code.toLowerCase().includes(query)
    );
  }, [allRegions, searchQuery]);

  const displayedRegions =
    searchQuery || isExpanded ? filteredRegions : popularRegions;

  return (
    <div className="space-y-4">
      {/* Search box */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search for a country or region..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
      </div>

      {/* Popular regions label (when not searching) */}
      {!searchQuery && !isExpanded && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">Popular regions:</p>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Show all regions
          </button>
        </div>
      )}

      {/* Regions list */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {displayedRegions.map((region) => (
          <RegionOption
            key={region.code}
            region={region}
            isSelected={currentRegion === region.code}
            name={name}
          />
        ))}
      </div>

      {/* Show all button */}
      {!searchQuery && !isExpanded && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
          >
            Show all {allRegions.length} regions
          </button>
        </div>
      )}

      {/* No results message */}
      {searchQuery && filteredRegions.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p>No regions found matching &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

interface RegionOptionProps {
  region: RegionData;
  isSelected: boolean;
  name: string;
}

function RegionOption({ region, isSelected, name }: RegionOptionProps) {
  const handleChange = () => {
    if (!isSelected) {
      trackRegionChange(region.code, region.name);
    }
  };

  return (
    <label className="flex items-center gap-3 p-4 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors cursor-pointer">
      <input
        type="radio"
        name={name}
        value={region.code}
        defaultChecked={isSelected}
        onChange={handleChange}
        className="w-4 h-4 text-red-500 bg-gray-700 border-gray-600 focus:ring-red-500 focus:ring-2"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{region.name}</span>
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
            {region.code}
          </span>
        </div>
        {region.name !== region.nativeName && (
          <div className="text-sm text-gray-400 truncate">
            {region.nativeName}
          </div>
        )}
      </div>
      {isSelected && <Check className="w-5 h-5 text-green-500 shrink-0" />}
    </label>
  );
}
