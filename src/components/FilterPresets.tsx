"use client";

import { useId } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AdvancedFiltersPanel } from "./AdvancedFiltersPanel";
import {
  hasActiveDiscoverFilters,
  parseDiscoverFilters,
  type DiscoverMediaType,
} from "@/lib/discover-filters";
import type { FilterPreset } from "@/lib/filter-presets";

interface FilterPresetsProps {
  type: DiscoverMediaType;
  presets: FilterPreset[];
}

export function FilterPresets({ type, presets }: FilterPresetsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedPreset = searchParams.get("preset");
  const idPrefix = useId();

  // A preset replaces every other filter – picking the active one again clears it.
  const handlePresetSelect = (preset: FilterPreset) => {
    router.push(
      selectedPreset === preset.id ? pathname : `${pathname}?preset=${preset.id}`,
      { scroll: false },
    );
  };

  const hasAdvancedFilters = hasActiveDiscoverFilters(
    parseDiscoverFilters(searchParams, type),
  );

  return (
    <div className="space-y-6">
      {/* Quick Presets */}
      <section className="bg-gray-900/50 rounded-lg p-6">
        <h3 id="quick-filters-heading" className="text-lg font-semibold text-white mb-4">Quick Filters</h3>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          role="group"
          aria-labelledby="quick-filters-heading"
        >
          {/* Named by the preset's visible name and described by its visible
              description. An `aria-label` ("Apply … filter preset") used to
              replace both, so the description was never read and a voice
              command naming what is on the button matched nothing; whether it
              is applied is what `aria-pressed` says. The name is not a heading:
              a heading inside a button is invalid, and announced as neither. */}
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
              aria-labelledby={`${idPrefix}-${preset.id}-name`}
              aria-describedby={`${idPrefix}-${preset.id}-description`}
            >
              <span
                id={`${idPrefix}-${preset.id}-name`}
                className="block font-medium text-white mb-1"
              >
                {preset.name}
              </span>
              <span
                id={`${idPrefix}-${preset.id}-description`}
                className="block text-sm text-gray-400"
              >
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Advanced Filters */}
      <AdvancedFiltersPanel type={type} isExpanded={hasAdvancedFilters} />
    </div>
  );
}
