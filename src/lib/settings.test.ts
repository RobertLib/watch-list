import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The settings store, which is a `useSyncExternalStore` source rather than a
 * plain reader: it memoises its snapshot by identity, subscribes to `storage`
 * only while somebody is listening, and is module-level state.
 *
 * Hence a fresh import per test. A memoised snapshot carried over from the
 * previous test would make every read here a test of the previous test.
 */
async function freshModule() {
  vi.resetModules();
  return import("./settings");
}

class FakeWindow {
  private data = new Map<string, string>();
  failWrites = false;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  localStorage = {
    getItem: (key: string): string | null =>
      this.data.has(key) ? (this.data.get(key) as string) : null,
    setItem: (key: string, value: string): void => {
      if (this.failWrites) throw new DOMException("QuotaExceededError");
      this.data.set(key, value);
    },
    removeItem: (key: string): void => {
      this.data.delete(key);
    },
  };

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Stand in for another tab writing to the same origin. */
  emitStorage(key: string | null): void {
    for (const listener of this.listeners.get("storage") ?? []) {
      listener({ key });
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

let fakeWindow: FakeWindow;

beforeEach(() => {
  fakeWindow = new FakeWindow();
  vi.stubGlobal("window", fakeWindow);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getSettings", () => {
  it("answers the defaults when storage holds nothing", async () => {
    const { getSettings, DEFAULT_SETTINGS } = await freshModule();

    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns the same object until something changes", async () => {
    // `useSyncExternalStore` compares snapshots by identity and re-renders
    // forever if a fresh object comes back every time it asks.
    const { getSettings } = await freshModule();

    expect(getSettings()).toBe(getSettings());
  });

  it("returns a new object once a setting is written", async () => {
    const { getSettings, setRegion } = await freshModule();

    const before = getSettings();
    setRegion("GB");

    expect(getSettings()).not.toBe(before);
    expect(getSettings().region).toBe("GB");
  });

  it("falls back to the default region when storage names one that is gone", async () => {
    fakeWindow.localStorage.setItem("tmdb-region", "XX");
    const { getSettings, DEFAULT_REGION } = await freshModule();

    expect(getSettings().region).toBe(DEFAULT_REGION);
  });

  it("ignores a provider filter it does not recognise", async () => {
    fakeWindow.localStorage.setItem("watch-provider-filter", "whatever");
    const { getSettings } = await freshModule();

    expect(getSettings().watchProviderFilter).toBe("all");
  });
});

describe("getServerSettings", () => {
  it("is always the defaults, whatever storage holds", async () => {
    fakeWindow.localStorage.setItem("tmdb-region", "GB");
    const { getServerSettings, DEFAULT_SETTINGS } = await freshModule();

    // It is what the prerendered HTML and the hydrating render both see; a
    // value read from storage here is a hydration mismatch by construction.
    expect(getServerSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("readStoredSettings", () => {
  it("reads another tab's pending changes without replacing or announcing the cached snapshot", async () => {
    const store = await freshModule();
    const cached = store.getSettings();
    const listener = vi.fn();
    const unsubscribe = store.subscribeSettings(listener);
    fakeWindow.localStorage.setItem(store.REGION_KEY, "CZ");
    fakeWindow.localStorage.setItem(store.WATCH_PROVIDER_FILTER_KEY, "streaming-only");
    fakeWindow.localStorage.setItem(store.SELECTED_PROVIDERS_KEY, "9,119,9");
    fakeWindow.localStorage.setItem(store.HAS_SETTINGS_KEY, "true");

    expect(store.readStoredSettings()).toEqual({
      region: "CZ",
      watchProviderFilter: "streaming-only",
      selectedProviderIds: [9, 119],
      hasCustomSettings: true,
    });
    expect(store.getSettings()).toBe(cached);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("setRegion", () => {
  it("stores a valid region and marks the visitor as configured", async () => {
    const { getRegion, getSettings, setRegion } = await freshModule();

    setRegion("CZ");

    expect(getRegion()).toBe("CZ");
    expect(getSettings().hasCustomSettings).toBe(true);
  });

  it("refuses a region that is not one", async () => {
    const { setRegion } = await freshModule();

    expect(() => setRegion("XX")).toThrow(/Invalid region/);
  });

  it("keeps the defaults for a session when storage refuses the write", async () => {
    const { getRegion, DEFAULT_REGION } = await freshModule();
    fakeWindow.failWrites = true;

    const { setRegion } = await import("./settings");
    expect(() => setRegion("GB")).not.toThrow();
    expect(getRegion()).toBe(DEFAULT_REGION);
  });
});

describe("getSelectedProviderIdsString", () => {
  it("joins the saved platforms the way TMDB wants them", async () => {
    const { getSelectedProviderIdsString, setSelectedProviderIds } =
      await freshModule();

    setSelectedProviderIds([8, 337]);

    expect(getSelectedProviderIdsString()).toBe("8|337");
  });

  it("is empty when nothing is selected", async () => {
    const { getSelectedProviderIdsString } = await freshModule();

    expect(getSelectedProviderIdsString()).toBe("");
  });
});

describe("settings save results", () => {
  const setters = [
    { name: "region", save: (store: typeof import("./settings")) => store.setRegion("GB") },
    { name: "filter", save: (store: typeof import("./settings")) => store.setWatchProviderFilter("streaming-only") },
    { name: "platforms", save: (store: typeof import("./settings")) => store.setSelectedProviderIds([8]) },
  ];

  it.each(setters)("reports successful $name saves", async ({ save }) => {
    const store = await freshModule();
    expect(save(store)).toBe(true);
    expect(store.getSettings().hasCustomSettings).toBe(true);
  });

  it.each(setters)("reports refused $name saves without announcing a change", async ({ save }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = await freshModule();
    const before = store.getSettings();
    const listener = vi.fn();
    store.subscribeSettings(listener);
    fakeWindow.failWrites = true;

    expect(save(store)).toBe(false);
    expect(store.getSettings()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(fakeWindow.localStorage.getItem(store.HAS_SETTINGS_KEY)).toBeNull();
  });

  it("restores a setting when saving its configured flag fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = await freshModule();
    fakeWindow.localStorage.setItem(store.REGION_KEY, "US");
    const before = store.getSettings();
    const original = fakeWindow.localStorage.setItem;
    vi.spyOn(fakeWindow.localStorage, "setItem").mockImplementation((key, value) => {
      if (key === store.HAS_SETTINGS_KEY) throw new DOMException("QuotaExceededError");
      original(key, value);
    });

    expect(store.setRegion("GB")).toBe(false);
    expect(fakeWindow.localStorage.getItem(store.REGION_KEY)).toBe("US");
    expect(fakeWindow.localStorage.getItem(store.HAS_SETTINGS_KEY)).toBeNull();
    expect(store.getSettings()).toBe(before);
  });
});

describe("isCustomised", () => {
  it("is false for an untouched profile", async () => {
    const { isCustomised, DEFAULT_SETTINGS } = await freshModule();

    expect(isCustomised(DEFAULT_SETTINGS)).toBe(false);
  });

  it("is true once the region moves off the default", async () => {
    const { getSettings, isCustomised, setRegion } = await freshModule();

    setRegion("GB");

    expect(isCustomised(getSettings())).toBe(true);
  });

  it("is true for a streaming-only filter even at the default region", async () => {
    const { getSettings, isCustomised, setWatchProviderFilter } =
      await freshModule();

    setWatchProviderFilter("streaming-only");

    expect(isCustomised(getSettings())).toBe(true);
  });
});

describe("subscribeSettings", () => {
  it("refreshes changes made in another tab while no settings consumer was mounted", async () => {
    const store = await freshModule();
    const original = store.getSettings();
    const first = store.subscribeSettings(vi.fn());
    first();

    fakeWindow.localStorage.setItem(store.REGION_KEY, "CZ");
    fakeWindow.localStorage.setItem(store.WATCH_PROVIDER_FILTER_KEY, "streaming-only");
    fakeWindow.localStorage.setItem(store.SELECTED_PROVIDERS_KEY, "8,337");
    fakeWindow.emitStorage(store.REGION_KEY);
    expect(store.getSettings()).toBe(original);

    const second = store.subscribeSettings(vi.fn());

    expect(store.getSettings()).toMatchObject({
      region: "CZ", watchProviderFilter: "streaming-only", selectedProviderIds: [8, 337],
    });
    expect(store.getSettings()).toBe(store.getSettings());
    second();
  });

  it("keeps snapshot identity when a returning subscriber finds no changed settings", async () => {
    const store = await freshModule();
    store.setSelectedProviderIds([8, 337]);
    const original = store.getSettings();
    const first = store.subscribeSettings(vi.fn());
    first();
    const second = store.subscribeSettings(vi.fn());

    expect(store.getSettings()).toBe(original);
    second();
  });

  it("notifies a listener when a setting changes", async () => {
    const { setRegion, subscribeSettings } = await freshModule();
    const listener = vi.fn();
    subscribeSettings(listener);

    setRegion("GB");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("attaches the storage listener only while somebody is subscribed", async () => {
    const { subscribeSettings } = await freshModule();

    expect(fakeWindow.listenerCount("storage")).toBe(0);

    const first = subscribeSettings(vi.fn());
    const second = subscribeSettings(vi.fn());
    expect(fakeWindow.listenerCount("storage")).toBe(1);

    first();
    expect(fakeWindow.listenerCount("storage")).toBe(1);

    second();
    expect(fakeWindow.listenerCount("storage")).toBe(0);
  });

  it("picks up a region another tab wrote", async () => {
    const { getRegion, subscribeSettings } = await freshModule();
    const listener = vi.fn();
    subscribeSettings(listener);

    fakeWindow.localStorage.setItem("tmdb-region", "GB");
    fakeWindow.emitStorage("tmdb-region");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getRegion()).toBe("GB");
  });

  it("ignores a storage event about a key it does not own", async () => {
    const { subscribeSettings } = await freshModule();
    const listener = vi.fn();
    subscribeSettings(listener);

    fakeWindow.emitStorage("watchlist");

    expect(listener).not.toHaveBeenCalled();
  });

  it("re-reads everything on a cleared origin", async () => {
    // `key === null` is what a browser sends for `localStorage.clear()`.
    const { subscribeSettings } = await freshModule();
    const listener = vi.fn();
    subscribeSettings(listener);

    fakeWindow.emitStorage(null);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("inspectStoredSettings", () => {
  it("returns the defaults for an untouched browser", async () => {
    const { inspectStoredSettings } = await freshModule();

    expect(inspectStoredSettings()).toEqual({
      region: { readable: true, value: "US" },
      watchProviderFilter: { readable: true, value: "all" },
      selectedProviderIds: { readable: true, value: [] },
      hasCustomSettings: { readable: true, value: false },
    });
  });

  // A backup used to be refused outright over any one of these; each is now
  // named on its own, with its exact text, and the others still read.
  it.each([
    ["region", "tmdb-region", "not-a-region"],
    ["watchProviderFilter", "watch-provider-filter", "unsupported-filter"],
    ["selectedProviderIds", "selected-watch-providers", "8,337broken"],
    ["hasCustomSettings", "user-has-settings", "not-a-boolean"],
  ])("names an invalid %s without affecting the other settings", async (name, key, raw) => {
    const { inspectStoredSettings, readStoredSettings } = await freshModule();
    fakeWindow.localStorage.setItem("tmdb-region", "CZ");
    fakeWindow.localStorage.setItem(key, raw);

    const inspected = inspectStoredSettings();
    expect(inspected[name as keyof typeof inspected]).toEqual({ readable: false, raw });
    for (const [other, setting] of Object.entries(inspected)) {
      if (other !== name) expect(setting.readable).toBe(true);
    }
    expect(() => readStoredSettings({ strict: true })).toThrow(name);
  });

  it("reports a refused read without text to keep", async () => {
    const { inspectStoredSettings } = await freshModule();
    const read = fakeWindow.localStorage.getItem;
    fakeWindow.localStorage.getItem = (key: string) => {
      if (key === "tmdb-region") throw new DOMException("Read denied", "SecurityError");
      return read(key);
    };

    expect(inspectStoredSettings().region).toEqual({ readable: false, raw: null });
  });

  it("gives strict reads the same values as the rendered snapshot", async () => {
    const { readStoredSettings, getSettings } = await freshModule();
    fakeWindow.localStorage.setItem("tmdb-region", "CZ");
    fakeWindow.localStorage.setItem("watch-provider-filter", "streaming-only");
    fakeWindow.localStorage.setItem("selected-watch-providers", "8,337");
    fakeWindow.localStorage.setItem("user-has-settings", "true");

    expect(readStoredSettings({ strict: true })).toEqual(getSettings());
  });
});
