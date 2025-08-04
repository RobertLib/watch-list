import { Globe, SlidersHorizontal } from "lucide-react";

/**
 * Mirrors the layout of ProfileSettings so the page does not shift on load
 */
export function ProfileSettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-56 rounded bg-gray-800"></div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="mb-1 flex items-center gap-3">
          <Globe className="h-6 w-6 text-blue-500" aria-hidden="true" />
          <h2 className="text-xl font-semibold">Region</h2>
        </div>
        <div className="mb-6 h-4 w-3/4 rounded bg-gray-800"></div>
        <div className="mb-2 h-3 w-32 rounded bg-gray-800"></div>
        <div className="h-12 w-full rounded-lg bg-gray-800"></div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="mb-1 flex items-center gap-3">
          <SlidersHorizontal
            className="h-6 w-6 text-green-500"
            aria-hidden="true"
          />
          <h2 className="text-xl font-semibold">What to show</h2>
        </div>
        <div className="mb-6 h-4 w-2/3 rounded bg-gray-800"></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 rounded-lg bg-gray-800"></div>
          <div className="h-24 rounded-lg bg-gray-800"></div>
        </div>
      </div>
    </div>
  );
}
