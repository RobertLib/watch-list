import { Suspense } from "react";
import { getRegion } from "@/lib/region-server";
import { getWatchProviderFilter } from "@/lib/watch-provider-server";
import { Globe, Filter } from "lucide-react";
import { ProfileSettingsForm } from "@/components/ProfileSettingsForm";

async function ProfileSettingsWrapper() {
  const [currentRegion, currentWatchProviderFilter] = await Promise.all([
    getRegion(),
    getWatchProviderFilter(),
  ]);

  return (
    <ProfileSettingsForm
      currentRegion={currentRegion}
      currentWatchProviderFilter={currentWatchProviderFilter}
    />
  );
}

function ProfileSettingsLoadingFallback() {
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 animate-pulse">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="h-6 w-6 text-blue-500" />
          <h2 className="text-xl font-semibold">Content Region</h2>
        </div>
        <div className="h-4 bg-gray-700 rounded w-3/4 mb-6"></div>

        <div className="mb-4">
          <div className="h-3 bg-gray-700 rounded w-24 mb-2"></div>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-md">
            <div className="h-4 bg-gray-700 rounded w-32"></div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-10 bg-gray-700 rounded w-full"></div>
          <div className="h-10 bg-gray-700 rounded w-32"></div>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <Filter className="h-6 w-6 text-green-500" />
          <h2 className="text-xl font-semibold">Content Filter</h2>
        </div>
        <div className="h-4 bg-gray-700 rounded w-3/4 mb-6"></div>

        <div className="mb-4">
          <div className="h-3 bg-gray-700 rounded w-24 mb-2"></div>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-md">
            <div className="h-4 bg-gray-700 rounded w-32"></div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-10 bg-gray-700 rounded w-full"></div>
          <div className="h-10 bg-gray-700 rounded w-32"></div>
        </div>
      </div>
    </div>
  );
}

export function ProfileContent() {
  return (
    <Suspense fallback={<ProfileSettingsLoadingFallback />}>
      <ProfileSettingsWrapper />
    </Suspense>
  );
}
