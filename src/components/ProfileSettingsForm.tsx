"use client";

import { useOptimistic, useTransition } from "react";
import { Globe, Filter, Tv } from "lucide-react";
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

interface ProfileSettingsFormProps {
  currentRegion: Region;
  currentWatchProviderFilter: WatchProviderFilter;
  selectedProviderIds: number[];
}

export function ProfileSettingsForm({
  currentRegion,
  currentWatchProviderFilter,
  selectedProviderIds,
}: ProfileSettingsFormProps) {
  const [isRegionPending, startRegionTransition] = useTransition();
  const [isFilterPending, startFilterTransition] = useTransition();
  const [isProvidersPending, startProvidersTransition] = useTransition();
  const [optimisticRegion, setOptimisticRegion] = useOptimistic(currentRegion);
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(
    currentWatchProviderFilter
  );
  const [optimisticProviders, setOptimisticProviders] =
    useOptimistic(selectedProviderIds);

  const handleRegionChange = async (formData: FormData) => {
    const newRegion = formData.get("region") as Region;

    startRegionTransition(async () => {
      setOptimisticRegion(newRegion);

      try {
        await changeRegion(formData);
        toast.showToast(
          `Region changed to ${getRegionName(newRegion)}`,
          "success"
        );
      } catch (error) {
        console.error("Failed to change region:", error);
        toast.showToast("Failed to change region", "error");
        setOptimisticRegion(currentRegion); // Revert optimistic update
      }
    });
  };

  const handleFilterChange = async (formData: FormData) => {
    const newFilter = formData.get("filter") as WatchProviderFilter;

    startFilterTransition(async () => {
      setOptimisticFilter(newFilter);

      try {
        await changeWatchProviderFilter(formData);
        toast.showToast(
          `Content filter changed to ${
            newFilter === "all" ? "Show All Content" : "Streaming Only"
          }`,
          "success"
        );
      } catch (error) {
        console.error("Failed to change content filter:", error);
        toast.showToast("Failed to change content filter", "error");
        setOptimisticFilter(currentWatchProviderFilter); // Revert optimistic update
      }
    });
  };

  const handleProvidersChange = async (formData: FormData) => {
    const providersString = formData.get("providers") as string;
    const newProviders = providersString
      ? providersString.split(",").map((id) => parseInt(id, 10))
      : [];

    startProvidersTransition(async () => {
      setOptimisticProviders(newProviders);

      try {
        await changeSelectedProviders(formData);
        toast.showToast(
          `Streaming platforms updated (${newProviders.length} selected)`,
          "success"
        );
      } catch (error) {
        console.error("Failed to update streaming platforms:", error);
        toast.showToast("Failed to update streaming platforms", "error");
        setOptimisticProviders(selectedProviderIds); // Revert optimistic update
      }
    });
  };

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="h-6 w-6 text-blue-500" />
          <h2 className="text-xl font-semibold">Content Region</h2>
        </div>
        <p className="text-gray-400 mb-6">
          Select your preferred region for movie and TV show data. This affects
          release dates, ratings, and availability information.
        </p>

        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Current region:</p>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-md">
            <span className="text-white font-medium">
              {getRegionName(optimisticRegion)}
            </span>
            <span className="text-gray-400">({optimisticRegion})</span>
          </div>
        </div>

        <form action={handleRegionChange}>
          <RegionSelector currentRegion={optimisticRegion} name="region" />

          <div className="mt-6">
            <button
              type="submit"
              disabled={isRegionPending}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRegionPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <div className="border-t border-gray-800 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <Filter className="h-6 w-6 text-green-500" />
          <h2 className="text-xl font-semibold">Content Filter</h2>
        </div>
        <p className="text-gray-400 mb-6">
          Choose whether to show all content or only content available on
          streaming platforms. This affects which movies and TV shows appear in
          lists and search results.
        </p>

        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Current setting:</p>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-md">
            <span className="text-white font-medium">
              {optimisticFilter === "all"
                ? "Show All Content"
                : "Streaming Only"}
            </span>
          </div>
        </div>

        <form action={handleFilterChange}>
          <WatchProviderFilterSelector
            key={currentWatchProviderFilter} // Force re-mount when server state changes
            currentFilter={currentWatchProviderFilter}
            name="filter"
          />

          <div className="mt-6">
            <button
              type="submit"
              disabled={isFilterPending}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFilterPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <div className="border-t border-gray-800 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <Tv className="h-6 w-6 text-purple-500" />
          <h2 className="text-xl font-semibold">Streaming Platforms</h2>
        </div>
        <p className="text-gray-400 mb-6">
          Select which streaming platforms you have access to in your region.
          When &quot;Streaming Only&quot; filter is enabled above, only content
          available on these platforms will be shown. The available platforms
          are loaded based on your selected region.
        </p>

        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Selected platforms:</p>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-md">
            <span className="text-white font-medium">
              {optimisticProviders.length === 0
                ? "None (showing all content)"
                : `${optimisticProviders.length} platform${
                    optimisticProviders.length !== 1 ? "s" : ""
                  } selected`}
            </span>
          </div>
        </div>

        <form action={handleProvidersChange}>
          <StreamingProviderSelector
            key={`${optimisticRegion}-${selectedProviderIds.join(",")}`} // Force re-mount when region or server state changes
            selectedProviderIds={optimisticProviders}
            name="providers"
            disabled={optimisticFilter === "all"}
            region={optimisticRegion}
          />

          {optimisticFilter === "all" && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
              <p className="text-sm text-yellow-400">
                Enable &quot;Streaming Only&quot; filter above to use this
                setting. Platform selection only applies when filtering by
                streaming availability.
              </p>
            </div>
          )}

          <div className="mt-6">
            <button
              type="submit"
              disabled={isProvidersPending || optimisticFilter === "all"}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProvidersPending ? "Saving..." : "Save Platforms"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
