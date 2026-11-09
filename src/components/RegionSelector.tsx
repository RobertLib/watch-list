"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { getSortedRegions, getPopularRegions } from "@/lib/regions-data";

interface RegionSelectorProps {
  id: string;
  value: string;
  onChange: (region: string) => void;
  /**
   * Unavailable while a change is being saved. The select stays focusable and
   * changes are not passed on: on Windows and Linux, arrowing through a closed
   * select fires a change per key, and native `disabled` dropped focus after
   * the first one, so the next arrow went nowhere.
   */
  disabled?: boolean;
}

export function RegionSelector({
  id,
  value,
  onChange,
  disabled = false,
}: RegionSelectorProps) {
  const allRegions = useMemo(() => getSortedRegions(), []);
  const popularRegions = useMemo(() => getPopularRegions(), []);

  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => {
          // The controlled value snaps back to the saved region.
          if (!disabled) onChange(event.target.value);
        }}
        aria-disabled={disabled || undefined}
        className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-800 py-3 pl-4 pr-10 text-white transition-colors hover:border-gray-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 aria-disabled:cursor-wait aria-disabled:opacity-50 [&_optgroup]:bg-gray-900 [&_option]:bg-gray-900"
      >
        <optgroup label="Popular">
          {popularRegions.map((region) => (
            <option key={`popular-${region.code}`} value={region.code}>
              {region.name} ({region.code})
            </option>
          ))}
        </optgroup>
        <optgroup label={`All countries and regions (${allRegions.length})`}>
          {allRegions.map((region) => (
            <option key={region.code} value={region.code}>
              {region.name} ({region.code})
            </option>
          ))}
        </optgroup>
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden="true"
      />
    </div>
  );
}
