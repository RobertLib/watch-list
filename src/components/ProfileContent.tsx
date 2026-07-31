import { Suspense } from "react";
import { getRegion } from "@/lib/region-server";
import {
  getWatchProviderFilter,
  getSelectedProviderIds,
} from "@/lib/watch-provider-server";
import { ProfileSettings } from "@/components/ProfileSettings";
import { ProfileSettingsSkeleton } from "@/components/skeletons";

async function ProfileSettingsWrapper() {
  const [currentRegion, currentWatchProviderFilter, selectedProviderIds] =
    await Promise.all([
      getRegion(),
      getWatchProviderFilter(),
      getSelectedProviderIds(),
    ]);

  return (
    <ProfileSettings
      currentRegion={currentRegion}
      currentWatchProviderFilter={currentWatchProviderFilter}
      selectedProviderIds={selectedProviderIds}
    />
  );
}

export function ProfileContent() {
  return (
    <Suspense fallback={<ProfileSettingsSkeleton />}>
      <ProfileSettingsWrapper />
    </Suspense>
  );
}
