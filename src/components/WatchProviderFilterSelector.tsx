"use client";

import { Monitor, Tv } from "lucide-react";
import type { WatchProviderFilter } from "@/lib/watch-provider-settings";

interface WatchProviderFilterSelectorProps {
  currentFilter: WatchProviderFilter;
  name: string;
}

export function WatchProviderFilterSelector({
  currentFilter,
  name,
}: WatchProviderFilterSelectorProps) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">Watch provider filter options</legend>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name={name}
              value="all"
              defaultChecked={currentFilter === "all"}
              className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 focus:ring-red-500 focus:ring-2"
            />
            <div className="flex items-center space-x-2">
              <Monitor className="h-5 w-5 text-gray-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-white">Show All Content</div>
                <div className="text-sm text-gray-400">
                  Display all movies and TV shows regardless of streaming
                  availability
                </div>
              </div>
            </div>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name={name}
              value="streaming-only"
              defaultChecked={currentFilter === "streaming-only"}
              className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 focus:ring-red-500 focus:ring-2"
            />
            <div className="flex items-center space-x-2">
              <Tv className="h-5 w-5 text-blue-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-white">Streaming Only</div>
                <div className="text-sm text-gray-400">
                  Only show content available on major streaming platforms
                </div>
              </div>
            </div>
          </label>
        </div>
      </fieldset>

      <div className="text-xs text-gray-500 mt-4">
        Streaming platforms include: Netflix, Amazon Prime Video, Disney+, HBO
        Max, Apple TV+, Hulu, Paramount+
      </div>
    </div>
  );
}
