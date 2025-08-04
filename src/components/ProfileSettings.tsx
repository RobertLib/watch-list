"use client";

import { useState } from "react";
import { Check, Globe, SlidersHorizontal } from "lucide-react";
import { RegionSelector } from "@/components/RegionSelector";
import { WatchProviderFilterSelector } from "@/components/WatchProviderFilterSelector";
import { StreamingProviderSelector } from "@/components/StreamingProviderSelector";
import { ProfileSettingsSkeleton } from "@/components/skeletons";
import { toast } from "@/components/Toast";
import { useHydrated } from "@/hooks/useHydrated";
import { useSettings } from "@/hooks/useSettings";
import {
  setRegion,
  setSelectedProviderIds,
  setWatchProviderFilter,
} from "@/lib/settings";
import { getRegionName } from "@/lib/region";
import type { Region } from "@/lib/region";
import type { WatchProviderFilter } from "@/lib/watch-provider-settings";

/**
 * The settings screen.
 *
 * There is no round trip left: a change is a `localStorage` write, and the store
 * it goes through notifies every listing on the site. The skeleton is still here
 * because the saved values cannot be read until the page is hydrated, and
 * rendering the defaults first would show a US visitor's settings to everyone.
 */
export function ProfileSettings() {
  const settings = useSettings();
  const hydrated = useHydrated();
  const [hasSaved, setHasSaved] = useState(false);

  const save = (apply: () => void, errorMessage: string) => {
    try {
      apply();
      setHasSaved(true);
    } catch (error) {
      console.error(errorMessage, error);
      toast.showToast(errorMessage, "error");
    }
  };

  const handleRegionChange = (region: Region) =>
    save(
      () => setRegion(region),
      "Could not save your region. Please try again.",
    );

  const handleFilterChange = (filter: WatchProviderFilter) =>
    save(
      () => setWatchProviderFilter(filter),
      "Could not save what to show. Please try again.",
    );

  const handleProvidersChange = (providers: number[]) =>
    save(
      () => setSelectedProviderIds(providers),
      "Could not save your platforms. Please try again.",
    );

  if (!hydrated) return <ProfileSettingsSkeleton />;

  return (
    <div className="space-y-6">
      <SaveStatus hasSaved={hasSaved} />

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="mb-1 flex items-center gap-3">
          <Globe className="h-6 w-6 text-blue-500" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Region</h2>
        </div>
        <p className="mb-4 text-gray-400">
          Sets the release dates, ratings and streaming availability you see
          across WatchList.
        </p>

        <label
          htmlFor="region-select"
          className="mb-2 block text-sm font-medium text-gray-300"
        >
          Country or region
        </label>
        <RegionSelector
          id="region-select"
          value={settings.region}
          onChange={handleRegionChange}
        />
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="mb-1 flex items-center gap-3">
          <SlidersHorizontal
            className="h-6 w-6 text-green-500"
            aria-hidden="true"
          />
          <h2 className="text-xl font-semibold">What to show</h2>
        </div>
        <p className="mb-4 text-gray-400">
          Applies to every list, carousel and search result.
        </p>

        <WatchProviderFilterSelector
          value={settings.watchProviderFilter}
          onChange={handleFilterChange}
        />

        {settings.watchProviderFilter === "streaming-only" && (
          <div className="mt-6 border-t border-gray-800 pt-6">
            <h3 className="mb-1 font-semibold text-white">
              Pick your platforms
            </h3>
            <p className="mb-4 text-sm text-gray-400">
              Platforms available in {getRegionName(settings.region)}. Tap a
              platform to add or remove it.
            </p>

            <StreamingProviderSelector
              selectedProviderIds={settings.selectedProviderIds}
              onChange={handleProvidersChange}
              region={settings.region}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function SaveStatus({ hasSaved }: { hasSaved: boolean }) {
  return (
    <div
      className="flex h-5 items-center gap-2 text-sm text-gray-400"
      aria-live="polite"
    >
      {hasSaved ? (
        <>
          <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
          All changes saved
        </>
      ) : (
        "Changes are saved automatically."
      )}
    </div>
  );
}
