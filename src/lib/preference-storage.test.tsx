// @vitest-environment jsdom

import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href }: React.ComponentProps<"a">) => (
    <a href={href}>{children}</a>
  ),
}));

let preferences: typeof import("./watchlist-view");
let mode: typeof import("./view-mode");
let welcome: typeof import("./welcome-panel");
let useViewMode: typeof import("@/hooks/useViewMode").useViewMode;
let WelcomePanel: typeof import("@/components/WelcomePanel").WelcomePanel;

beforeEach(async () => {
  // A new page starts with no transient preferences from the preceding test.
  vi.resetModules();
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  preferences = await import("./watchlist-view");
  mode = await import("./view-mode");
  welcome = await import("./welcome-panel");
  ({ useViewMode } = await import("@/hooks/useViewMode"));
  ({ WelcomePanel } = await import("@/components/WelcomePanel"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function refuseStorage(blockReads: boolean) {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is blocked", "QuotaExceededError");
  });
  if (blockReads) {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
  }
}

function usePreferences() {
  return useSyncExternalStore(
    preferences.subscribeToPreferences,
    preferences.getPreferences,
    preferences.getDefaultPreferences,
  );
}

describe.each([false, true])("preferences when reads are blocked: %s", (blockReads) => {
  it("applies each watchlist control and keeps the snapshot stable", () => {
    window.localStorage.setItem("watchlist-view", JSON.stringify(preferences.DEFAULT_PREFERENCES));
    refuseStorage(blockReads);
    const { result } = renderHook(() => usePreferences());

    act(() => preferences.savePreferences({ ...result.current, sort: "title" }));
    expect(result.current.sort).toBe("title");
    act(() => preferences.savePreferences({ ...result.current, type: "tv" }));
    expect(result.current.type).toBe("tv");
    act(() => preferences.savePreferences({ ...result.current, grouping: "availability" }));
    expect(result.current.grouping).toBe("availability");
    act(() => preferences.savePreferences({ ...result.current, ratedOnly: true }));

    expect(result.current).toEqual({ sort: "title", type: "tv", grouping: "availability", ratedOnly: true });
    expect(preferences.getPreferences()).toBe(result.current);
    expect(preferences.getPreferences()).toBe(result.current);
  });

  it("switches every mounted listing in both directions", () => {
    window.localStorage.setItem("view-mode", "card");
    refuseStorage(blockReads);
    const first = renderHook(() => useViewMode());
    const second = renderHook(() => useViewMode());

    act(() => first.result.current.setViewMode("list"));
    expect(first.result.current.viewMode).toBe("list");
    expect(second.result.current.viewMode).toBe("list");

    act(() => second.result.current.setViewMode("card"));
    expect(first.result.current.viewMode).toBe("card");
    expect(second.result.current.viewMode).toBe("card");
  });

  it.each(["Close welcome panel", "Dismiss welcome panel"])("closes the welcome panel via %s", (button) => {
    refuseStorage(blockReads);
    const { unmount } = render(<WelcomePanel hasUserSettings={false} />);

    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.queryByRole("region")).toBeNull();
    unmount();

    render(<WelcomePanel hasUserSettings={false} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("storage recovery and other tabs", () => {
  it("keeps successful choices when writes work but reads are denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });

    const chosen = { ...preferences.DEFAULT_PREFERENCES, sort: "rating" as const };
    preferences.savePreferences(chosen);
    mode.saveViewMode("list");
    welcome.dismissWelcomePanel();

    expect(preferences.getPreferences()).toEqual(chosen);
    expect(mode.getViewMode()).toBe("list");
    expect(welcome.isWelcomeDismissed()).toBe(true);
  });

  it("keeps transient choices when a storage event cannot be read", () => {
    refuseStorage(true);
    const watchlist = renderHook(() => usePreferences());
    const listing = renderHook(() => useViewMode());
    const panel = renderHook(() => useSyncExternalStore(welcome.subscribeToWelcomeDismissal, welcome.isWelcomeDismissed, () => false));
    act(() => {
      preferences.savePreferences({ ...preferences.DEFAULT_PREFERENCES, sort: "title" });
      mode.saveViewMode("list");
      welcome.dismissWelcomePanel();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(watchlist.result.current.sort).toBe("title");
    expect(listing.result.current.viewMode).toBe("list");
    expect(panel.result.current).toBe(true);
  });

  it("keeps local choices through unrelated events, then follows a storage clear", () => {
    refuseStorage(false);
    const watchlist = renderHook(() => usePreferences());
    const listing = renderHook(() => useViewMode());
    const panel = renderHook(() => useSyncExternalStore(welcome.subscribeToWelcomeDismissal, welcome.isWelcomeDismissed, () => false));
    act(() => {
      preferences.savePreferences({ ...preferences.DEFAULT_PREFERENCES, sort: "title" });
      mode.saveViewMode("list");
      welcome.dismissWelcomePanel();
      window.dispatchEvent(new StorageEvent("storage", { key: "active-profile" }));
    });
    expect(watchlist.result.current.sort).toBe("title");
    expect(listing.result.current.viewMode).toBe("list");
    expect(panel.result.current).toBe(true);

    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(watchlist.result.current).toBe(preferences.DEFAULT_PREFERENCES);
    expect(listing.result.current.viewMode).toBe("card");
    expect(panel.result.current).toBe(false);
  });

  it("accepts a matching event even when another tab restores the previous stored value", () => {
    refuseStorage(false);
    const watchlist = renderHook(() => usePreferences());
    const listing = renderHook(() => useViewMode());
    const panel = renderHook(() => useSyncExternalStore(welcome.subscribeToWelcomeDismissal, welcome.isWelcomeDismissed, () => false));
    act(() => {
      preferences.savePreferences({ ...preferences.DEFAULT_PREFERENCES, type: "tv" });
      mode.saveViewMode("list");
      welcome.dismissWelcomePanel();
    });

    act(() => {
      for (const key of ["watchlist-view", "view-mode", "welcome-panel-dismissed"]) {
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    });
    expect(watchlist.result.current.type).toBe("all");
    expect(listing.result.current.viewMode).toBe("card");
    expect(panel.result.current).toBe(false);
  });

  it("detects changed storage after the preferences have no subscribers", () => {
    window.localStorage.setItem("view-mode", "card");
    window.localStorage.setItem("welcome-panel-dismissed", "false");
    refuseStorage(false);
    preferences.savePreferences({ ...preferences.DEFAULT_PREFERENCES, type: "tv" });
    mode.saveViewMode("list");
    welcome.dismissWelcomePanel();
    vi.restoreAllMocks();

    const incoming = { ...preferences.DEFAULT_PREFERENCES, sort: "rating" as const };
    window.localStorage.setItem("watchlist-view", JSON.stringify(incoming));
    window.localStorage.removeItem("view-mode");
    window.localStorage.removeItem("welcome-panel-dismissed");
    expect(preferences.getPreferences()).toEqual(incoming);
    expect(mode.getViewMode()).toBe("card");
    expect(welcome.isWelcomeDismissed()).toBe(false);
  });

  it("persists the next successful choice after transient changes", () => {
    refuseStorage(false);
    preferences.savePreferences({ ...preferences.DEFAULT_PREFERENCES, type: "tv" });
    mode.saveViewMode("list");
    welcome.dismissWelcomePanel();
    vi.restoreAllMocks();

    preferences.savePreferences({ ...preferences.DEFAULT_PREFERENCES, type: "movie" });
    mode.saveViewMode("card");
    welcome.dismissWelcomePanel();
    expect(JSON.parse(window.localStorage.getItem("watchlist-view")!)).toEqual(preferences.getPreferences());
    expect(preferences.getPreferences().type).toBe("movie");
    expect(window.localStorage.getItem("view-mode")).toBe("card");
    expect(mode.getViewMode()).toBe("card");
    expect(window.localStorage.getItem("welcome-panel-dismissed")).toBe("true");
    expect(welcome.isWelcomeDismissed()).toBe(true);
  });
});
