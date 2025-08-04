import { Suspense } from "react";
import { WelcomePanel } from "@/components/WelcomePanel";
import { hasUserCustomSettings } from "@/app/actions";

async function WelcomePanelWrapper() {
  const hasSettings = await hasUserCustomSettings();

  return <WelcomePanel hasUserSettings={hasSettings} />;
}

function WelcomePanelSkeleton() {
  return (
    <div className="bg-linear-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 bg-gray-700 rounded-full"></div>
        <div>
          <div className="h-6 bg-gray-700 rounded w-32 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-48"></div>
        </div>
      </div>
      <div className="space-y-2 mb-6">
        <div className="h-4 bg-gray-700 rounded w-full"></div>
        <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        <div className="h-4 bg-gray-700 rounded w-2/3"></div>
      </div>
      <div className="flex gap-3">
        <div className="h-10 bg-gray-700 rounded w-32"></div>
        <div className="h-10 bg-gray-700 rounded w-24"></div>
      </div>
    </div>
  );
}

export function WelcomePanelContent() {
  return (
    <Suspense fallback={<WelcomePanelSkeleton />}>
      <WelcomePanelWrapper />
    </Suspense>
  );
}
