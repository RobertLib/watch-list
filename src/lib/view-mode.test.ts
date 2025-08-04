import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VIEW_MODE,
  getViewMode,
  saveViewMode,
  subscribeToViewMode,
} from "./view-mode";

/**
 * A localStorage plus the slice of `window` this module uses: it dispatches an
 * event of its own, because a `storage` event only fires in *other* tabs and
 * every listing already mounted in this one has to hear about the switch.
 */
class FakeWindow {
  private data = new Map<string, string>();
  failWrites = false;
  private listeners = new Map<string, Set<() => void>>();

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

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener();
    return true;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

let fakeWindow: FakeWindow;

beforeEach(() => {
  fakeWindow = new FakeWindow();
  vi.stubGlobal("window", fakeWindow);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getViewMode", () => {
  it("starts on posters, which is what the app is built around", () => {
    expect(getViewMode()).toBe(DEFAULT_VIEW_MODE);
    expect(DEFAULT_VIEW_MODE).toBe("card");
  });

  it("reads back a saved mode", () => {
    saveViewMode("list");
    expect(getViewMode()).toBe("list");
  });

  it("ignores a stored value that is not a view mode", () => {
    // Storage is hand-editable, and an unknown layout would render nothing.
    fakeWindow.localStorage.setItem("view-mode", "carousel");
    expect(getViewMode()).toBe(DEFAULT_VIEW_MODE);
  });
});

describe("saveViewMode", () => {
  it("tells the listings already on the page", () => {
    const onChange = vi.fn();
    subscribeToViewMode(onChange);

    saveViewMode("list");

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("still announces the change when the write is refused", () => {
    // The switch applies to this page either way; it just will not be
    // remembered, and leaving the grid in the old layout would be the worse
    // of the two failures.
    fakeWindow.failWrites = true;
    const onChange = vi.fn();
    subscribeToViewMode(onChange);

    expect(() => saveViewMode("list")).not.toThrow();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeToViewMode", () => {
  it("also listens for a change made in another tab", () => {
    const onChange = vi.fn();
    subscribeToViewMode(onChange);

    fakeWindow.dispatchEvent(new Event("storage"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("removes both listeners when unsubscribed", () => {
    const unsubscribe = subscribeToViewMode(vi.fn());
    expect(fakeWindow.listenerCount("view-mode-change")).toBe(1);
    expect(fakeWindow.listenerCount("storage")).toBe(1);

    unsubscribe();

    expect(fakeWindow.listenerCount("view-mode-change")).toBe(0);
    expect(fakeWindow.listenerCount("storage")).toBe(0);
  });
});
