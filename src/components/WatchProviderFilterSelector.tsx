"use client";

import { Clapperboard, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WatchProviderFilter } from "@/lib/watch-provider-settings";

const OPTIONS: {
  value: WatchProviderFilter;
  label: string;
  description: string;
  icon: typeof Tv;
}[] = [
  {
    value: "all",
    label: "Everything",
    description: "All movies and shows, wherever they are available",
    icon: Clapperboard,
  },
  {
    value: "streaming-only",
    label: "Only my platforms",
    description: "Just titles you can stream on the platforms you pick",
    icon: Tv,
  },
];

interface WatchProviderFilterSelectorProps {
  value: WatchProviderFilter;
  onChange: (filter: WatchProviderFilter) => void;
}

export function WatchProviderFilterSelector({
  value,
  onChange,
}: WatchProviderFilterSelectorProps) {
  return (
    <fieldset>
      <legend className="sr-only">Choose what to show</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const isSelected = value === option.value;
          const Icon = option.icon;

          return (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name="watch-provider-filter"
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <div
                className={cn(
                  "flex h-full items-start gap-3 rounded-lg border-2 p-4 transition-colors",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-red-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-gray-900",
                  isSelected
                    ? "border-red-500 bg-red-500/10"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-600",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    isSelected ? "text-red-400" : "text-gray-400",
                  )}
                  aria-hidden="true"
                />
                <div>
                  <div className="font-medium text-white">{option.label}</div>
                  <div className="text-sm text-gray-400">
                    {option.description}
                  </div>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
