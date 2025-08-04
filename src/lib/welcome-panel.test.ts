// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissWelcomePanel,
  isWelcomeDismissed,
  subscribeToWelcomeDismissal,
} from "./welcome-panel";

/**
 * The flag behind the first-run panel, and – more to the point – how it tells
 * the page about itself.
 *
 * The panel dismisses itself, so the write and the read are in the same tab and
 * a real `storage` event never fires. What used to bridge that gap was a
 * hand-made `Event("storage")`, which reached all seven of the app's genuine
 * storage listeners. They ignored it, but only because their guard compares
 * `event.key` against a name and a hand-made event has no `key` – one listener
 * written as `if (!event.key) refresh()` would have turned closing this panel
 * into a re-read of every store in the app. That is what the last test here is
 * standing guard over.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isWelcomeDismissed", () => {
  it("is false before anyone has dismissed anything", () => {
    expect(isWelcomeDismissed()).toBe(false);
  });

  it("is true once the panel has been sent away", () => {
    dismissWelcomePanel();
    expect(isWelcomeDismissed()).toBe(true);
  });

  it("reads only the exact stored value", () => {
    window.localStorage.setItem("welcome-panel-dismissed", "yes");
    expect(isWelcomeDismissed()).toBe(false);
  });

  // Storage throws rather than returning null in a browser configured to block
  // it, and the panel is an enhancement: it must not take the home page down.
  it("treats unreadable storage as not dismissed", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(isWelcomeDismissed()).toBe(false);
  });
});

describe("dismissWelcomePanel", () => {
  it("notifies the page it is already on", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToWelcomeDismissal(listener);

    dismissWelcomePanel();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops notifying once unsubscribed", () => {
    const listener = vi.fn();
    subscribeToWelcomeDismissal(listener)();

    dismissWelcomePanel();

    expect(listener).not.toHaveBeenCalled();
  });

  // A second tab dismissing it should not leave this one showing the panel.
  it("still listens for the real thing from another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToWelcomeDismissal(listener);

    window.dispatchEvent(
      new StorageEvent("storage", { key: "welcome-panel-dismissed" }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("closes for this page view even when the write is refused", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const listener = vi.fn();
    const unsubscribe = subscribeToWelcomeDismissal(listener);

    expect(() => dismissWelcomePanel()).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  /**
   * The regression this module was extracted for: dismissing the panel must not
   * masquerade as a storage change, or every store in the app is asked to
   * re-read itself because somebody closed a banner.
   */
  it("does not fire a storage event of its own", () => {
    const storageListener = vi.fn();
    window.addEventListener("storage", storageListener);

    dismissWelcomePanel();

    expect(storageListener).not.toHaveBeenCalled();
    window.removeEventListener("storage", storageListener);
  });
});
