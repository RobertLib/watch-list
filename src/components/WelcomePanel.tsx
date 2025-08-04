"use client";

import { useMemo, useSyncExternalStore } from "react";
import { X, Settings, Globe, Filter, ArrowRight } from "lucide-react";
import Link from "next/link";

interface WelcomePanelProps {
  hasUserSettings: boolean;
}

function getIsDismissed() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("welcome-panel-dismissed") === "true";
}

export function WelcomePanel({ hasUserSettings }: WelcomePanelProps) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isDismissed = useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", callback);
      return () => window.removeEventListener("storage", callback);
    },
    getIsDismissed,
    () => false
  );

  const isVisible = useMemo(() => {
    if (!isClient) return false;
    return !isDismissed && !hasUserSettings;
  }, [isClient, isDismissed, hasUserSettings]);

  const handleDismiss = () => {
    localStorage.setItem("welcome-panel-dismissed", "true");
    window.dispatchEvent(new Event("storage"));
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="bg-linear-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-lg p-6 mb-8 relative"
      role="banner"
      aria-labelledby="welcome-title"
    >
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 rounded-md p-1"
        aria-label="Close welcome panel"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="sm:pr-8">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="h-12 w-12 bg-linear-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center"
            role="img"
            aria-label="Movie icon"
          >
            <span className="text-xl font-bold" aria-hidden="true">
              🎬
            </span>
          </div>
          <div>
            <h2 id="welcome-title" className="text-2xl font-bold text-white">
              Welcome to WatchList!
            </h2>
            <p className="text-gray-300 text-sm">
              Discover the best movies & TV shows
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <p className="text-gray-300 leading-relaxed">
            WatchList helps you discover amazing movies and TV shows from around
            the world. Stay on top of trends, find your next favorite content,
            and never miss what&apos;s important.
          </p>

          <div className="bg-gray-900/40 rounded-lg p-4 border border-gray-800/50">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-400" aria-hidden="true" />
              Customize your experience
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Globe
                  className="h-4 w-4 text-green-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-white font-medium">Set your region</p>
                  <p className="text-gray-400">
                    For more accurate availability and release date information
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Filter
                  className="h-4 w-4 text-purple-400 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-white font-medium">Filter content</p>
                  <p className="text-gray-400">
                    Show only movies and TV shows available on streaming
                    platforms
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/profile"
            prefetch={false}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label="Go to profile settings to customize your experience"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Set up profile
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            onClick={handleDismiss}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 hover:text-white transition-colors font-medium text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label="Dismiss welcome panel"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
