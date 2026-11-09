"use client";

import { useRef, useState } from "react";
import { Check, Globe, SlidersHorizontal } from "lucide-react";
import { RegionSelector } from "@/components/RegionSelector";
import { WatchProviderFilterSelector } from "@/components/WatchProviderFilterSelector";
import { StreamingProviderSelector } from "@/components/StreamingProviderSelector";
import { ProfileSettingsSkeleton } from "@/components/skeletons";
import { toast } from "@/components/Toast";
import { useHydrated } from "@/hooks/useHydrated";
import { useSettings, useSettingsActions } from "@/hooks/useSettings";
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
  const { setRegion, setWatchProviderFilter, updateSelectedProviderIds } = useSettingsActions();
  const hydrated = useHydrated();
  const [saveStatus, setSaveStatus] = useState<SaveState>("idle");
  const pendingWrites = useRef(0);
  const [isSaving, setIsSaving] = useState(false);

  // The controls below are aria-disabled while a write is pending, not
  // natively disabled: arrowing a closed select on Windows or Linux fires a
  // change per key, and native `disabled` dropped focus after the first one,
  // so the next arrow did nothing. This guard is what refuses a second change
  // while the first is still being saved. Platform updates are exempt: each
  // is applied to the list read under the lock, so queued ones compose, and
  // the catalogue's reconciliation after a region change must never be lost.
  const save = async (
    apply: () => Promise<boolean>,
    errorMessage: string,
    { exclusive = true }: { exclusive?: boolean } = {},
  ) => {
    if (exclusive && pendingWrites.current > 0) return;
    pendingWrites.current += 1;
    setIsSaving(true);
    try {
      if (!(await apply())) {
        setSaveStatus("failed");
        toast.showToast(errorMessage, "error");
        return;
      }
      setSaveStatus("saved");
    } catch (error) {
      console.error(errorMessage, error);
      setSaveStatus("failed");
      toast.showToast(errorMessage, "error");
    } finally {
      pendingWrites.current -= 1;
      if (pendingWrites.current === 0) setIsSaving(false);
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

  const handleProvidersUpdate = (
    update: (providers: number[]) => number[],
    expectedRegion: string,
  ) => save(
    () => updateSelectedProviderIds(update, expectedRegion),
    "Could not save your platforms. Please try again.",
    // Presses are refused by the selector itself while `isSaving`.
    { exclusive: false },
  );

  if (!hydrated) return <ProfileSettingsSkeleton />;

  return (
    <div className="space-y-6">
      <SaveStatus status={isSaving ? "saving" : saveStatus} />

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
          disabled={isSaving}
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
          Filters discovery lists and carousels. Search and your saved lists
          always include all titles.
        </p>

        <WatchProviderFilterSelector
          value={settings.watchProviderFilter}
          onChange={handleFilterChange}
          disabled={isSaving}
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
              onUpdate={handleProvidersUpdate}
              region={settings.region}
              disabled={isSaving}
            />
          </div>
        )}
      </section>
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "failed";

function SaveStatus({ status }: { status: SaveState }) {
  return (
    <div
      className="flex h-5 items-center gap-2 text-sm text-gray-400"
      aria-live="polite"
    >
      {status === "saved" ? (
        <>
          <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
          All changes saved
        </>
      ) : status === "saving" ? (
        "Saving changes…"
      ) : status === "failed" ? (
        <span className="text-red-400">
          Changes could not be saved. Please try again.
        </span>
      ) : (
        "Changes are saved automatically."
      )}
    </div>
  );
}
