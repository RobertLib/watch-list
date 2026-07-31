"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_VIEW_MODE,
  getViewMode,
  saveViewMode,
  subscribeToViewMode,
  type ViewMode,
} from "@/lib/view-mode";

/**
 * The layout preference shared by every listing on the page. Server-rendered
 * HTML cannot know it, so it always starts on cards and switches once the
 * browser takes over.
 */
export function useViewMode(): {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
} {
  const viewMode = useSyncExternalStore(
    subscribeToViewMode,
    getViewMode,
    () => DEFAULT_VIEW_MODE,
  );

  return { viewMode, setViewMode: saveViewMode };
}
