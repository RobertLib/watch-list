"use client";

import { useState, useTransition } from "react";
import { Check, Globe, Loader2, SlidersHorizontal } from "lucide-react";
import { RegionSelector } from "@/components/RegionSelector";
import { WatchProviderFilterSelector } from "@/components/WatchProviderFilterSelector";
import { StreamingProviderSelector } from "@/components/StreamingProviderSelector";
import { toast } from "@/components/Toast";
import {
  changeRegion,
  changeWatchProviderFilter,
  changeSelectedProviders,
} from "@/app/actions";
import { getRegionName } from "@/lib/region";
import type { Region } from "@/lib/region-server";
import type { WatchProviderFilter } from "@/lib/watch-provider-settings";

interface ProfileSettingsProps {
  currentRegion: Region;
  currentWatchProviderFilter: WatchProviderFilter;
  selectedProviderIds: number[];
}

interface Settings {
  region: Region;
  filter: WatchProviderFilter;
  providers: number[];
}

export function ProfileSettings({
  currentRegion,
  currentWatchProviderFilter,
  selectedProviderIds,
}: ProfileSettingsProps) {
  const [isSaving, startSaveTransition] = useTransition();
  const [hasSaved, setHasSaved] = useState(false);

  // These cookies are only ever written from this screen, so the server values
  // seed the UI and every change is applied here first, then persisted.
  const [settings, setSettings] = useState<Settings>({
    region: currentRegion,
    filter: currentWatchProviderFilter,
    providers: selectedProviderIds,
  });

  const save = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
    persist: (value: Settings[K]) => Promise<void>,
    errorMessage: string,
  ) => {
    const previousValue = settings[key];
    setSettings((current) => ({ ...current, [key]: value }));

    startSaveTransition(async () => {
      try {
        await persist(value);
        setHasSaved(true);
      } catch (error) {
        console.error(errorMessage, error);
        toast.showToast(errorMessage, "error");
        setSettings((current) => ({ ...current, [key]: previousValue }));
      }
    });
  };

  const handleRegionChange = (region: Region) =>
    save(
      "region",
      region,
      changeRegion,
      "Could not save your region. Please try again.",
    );

  const handleFilterChange = (filter: WatchProviderFilter) =>
    save(
      "filter",
      filter,
      changeWatchProviderFilter,
      "Could not save what to show. Please try again.",
    );

  const handleProvidersChange = (providers: number[]) =>
    save(
      "providers",
      providers,
      changeSelectedProviders,
      "Could not save your platforms. Please try again.",
    );

  return (
    <div className="space-y-6">
      <SaveStatus isSaving={isSaving} hasSaved={hasSaved} />

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
          value={settings.filter}
          onChange={handleFilterChange}
        />

        {settings.filter === "streaming-only" && (
          <div className="mt-6 border-t border-gray-800 pt-6">
            <h3 className="mb-1 font-semibold text-white">
              Pick your platforms
            </h3>
            <p className="mb-4 text-sm text-gray-400">
              Platforms available in {getRegionName(settings.region)}. Tap a
              platform to add or remove it.
            </p>

            <StreamingProviderSelector
              selectedProviderIds={settings.providers}
              onChange={handleProvidersChange}
              region={settings.region}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function SaveStatus({
  isSaving,
  hasSaved,
}: {
  isSaving: boolean;
  hasSaved: boolean;
}) {
  return (
    <div
      className="flex h-5 items-center gap-2 text-sm text-gray-400"
      aria-live="polite"
    >
      {isSaving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Saving...
        </>
      ) : hasSaved ? (
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
