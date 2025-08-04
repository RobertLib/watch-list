"use client";

/**
 * Whether the first-run panel has been sent away.
 *
 * A one-flag store, here rather than inside the component for the reason every
 * other preference in this folder is: the panel dismisses *itself*, so the write
 * and the read happen in the same tab – and a `storage` event only fires in the
 * *others*. Something has to tell the mounted component that the ground moved.
 *
 * That something used to be `window.dispatchEvent(new Event("storage"))`, a
 * synthetic event of the browser's own type. It worked, but it woke all seven of
 * the app's real `storage` listeners – watchlist, watched, ratings, collections,
 * episode progress, settings, the daily game – and every one of them declined
 * only by accident: their guard is `event.key !== null && event.key !== KEY`,
 * and a hand-made event has no `key` at all. A named event of our own is what
 * `view-mode.ts` and `watchlist-view.ts` already do, and it wakes nothing else.
 */

const WELCOME_DISMISSED_STORAGE_KEY = "welcome-panel-dismissed";

const WELCOME_DISMISSED_EVENT = "welcome-panel-dismissed-change";

let cachedDismissed = false;
let unsavedDismissal: { storedRaw: string | null | undefined } | null = null;

export function isWelcomeDismissed(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const stored = window.localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY);
    if (unsavedDismissal) {
      if (
        unsavedDismissal.storedRaw === undefined ||
        stored === unsavedDismissal.storedRaw
      ) {
        return true;
      }
      unsavedDismissal = null;
    }
    cachedDismissed = stored === "true";
    return cachedDismissed;
  } catch (error) {
    // Storage throws rather than returning null in a browser configured to
    // block it. Retain any dismissal made during this page view.
    console.error("Error reading the welcome panel's state:", error);
    return unsavedDismissal !== null || cachedDismissed;
  }
}

export function dismissWelcomePanel(): void {
  if (typeof window === "undefined") return;

  let storedRaw: string | null | undefined;
  try {
    storedRaw = window.localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY);
  } catch {
    // The visitor can still dismiss the panel when reads are blocked.
  }

  try {
    window.localStorage.setItem(WELCOME_DISMISSED_STORAGE_KEY, "true");
    unsavedDismissal = null;
    cachedDismissed = true;
  } catch (error) {
    // The panel still closes for this page view; it just comes back next time.
    unsavedDismissal = { storedRaw };
    console.error("Error saving the welcome panel's state:", error);
  }

  window.dispatchEvent(new Event(WELCOME_DISMISSED_EVENT));
}

export function subscribeToWelcomeDismissal(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== WELCOME_DISMISSED_STORAGE_KEY) return;
    try {
      window.localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY);
      unsavedDismissal = null;
    } catch {
      // Keep the panel closed until the incoming value can be read.
    }
    onChange();
  };
  window.addEventListener(WELCOME_DISMISSED_EVENT, onChange);
  // Still worth listening for the real thing: a second tab that dismisses the
  // panel should not leave this one showing it.
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(WELCOME_DISMISSED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
