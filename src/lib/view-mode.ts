"use client";

/** How a listing lays its titles out: posters in a grid, or rows in a list. */
export type ViewMode = "card" | "list";

/** Posters are what the app is built around, so they stay the starting point. */
export const DEFAULT_VIEW_MODE: ViewMode = "card";

// Kept in localStorage rather than a cookie: nothing on the server renders
// differently for it, and a listing can switch layout without a round trip.
const VIEW_MODE_STORAGE_KEY = "view-mode";

// Every listing on the page reads the same preference, so a change has to reach
// the ones already mounted – a `storage` event only fires in *other* tabs.
const VIEW_MODE_EVENT = "view-mode-change";

function isViewMode(value: unknown): value is ViewMode {
  return value === "card" || value === "list";
}

export function getViewMode(): ViewMode {
  if (typeof window === "undefined") return DEFAULT_VIEW_MODE;

  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return isViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
  } catch (error) {
    console.error("Error reading view mode from storage:", error);
    return DEFAULT_VIEW_MODE;
  }
}

export function saveViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch (error) {
    // Private browsing modes can refuse writes entirely – the switch still
    // applies to this page, it just will not be remembered.
    console.error("Error saving view mode to storage:", error);
  }

  window.dispatchEvent(new Event(VIEW_MODE_EVENT));
}

export function subscribeToViewMode(onChange: () => void): () => void {
  window.addEventListener(VIEW_MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(VIEW_MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
