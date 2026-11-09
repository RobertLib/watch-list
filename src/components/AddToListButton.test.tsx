// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  COLLECTIONS_STORAGE_KEY,
  MAX_COLLECTION_ITEMS,
  type Collection,
  type CollectionItem,
} from "@/lib/collections";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey } from "@/lib/profile-storage";
import { toast } from "./Toast";
import { AddToListButton } from "./AddToListButton";

vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));

const item: CollectionItem = {
  id: 550,
  mediaType: "movie",
  title: "Fight Club",
  posterPath: null,
};

function collection(items: CollectionItem[] = []): Collection {
  return {
    id: "existing-list",
    name: "Existing list",
    items,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function stored(): Collection[] {
  return JSON.parse(window.localStorage.getItem(COLLECTIONS_STORAGE_KEY) ?? "[]");
}

async function openPanel() {
  render(<AddToListButton item={item} />);
  await click(screen.getByRole("button", { name: /Add to list|On \d+ list/ }));
  return screen.getByRole("textbox", { name: "New list name" }) as HTMLInputElement;
}

async function openPositionedPanel(viewportWidth: number, anchorLeft: number) {
  render(<AddToListButton item={item} />);
  const button = screen.getByRole("button", { name: "Add to list" });
  const anchor = button.parentElement as HTMLDivElement;
  let viewport = viewportWidth;
  let left = anchorLeft;
  vi.spyOn(document.documentElement, "clientWidth", "get").mockImplementation(() => viewport);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === anchor) return new DOMRect(left, 100, 128, 40);
    // jsdom has no layout; model the picker's CSS width and viewport maximum.
    const width = this.classList.contains("max-w-[calc(100vw-32px)]")
      ? Math.min(288, viewport - 32)
      : 288;
    return new DOMRect(0, 0, width, 200);
  });

  await click(button);
  const input = screen.getByRole("textbox", { name: "New list name" });
  const panel = input.parentElement?.parentElement as HTMLDivElement;
  return {
    panel,
    bounds() {
      const panelLeft = left + Number.parseFloat(panel.style.left);
      return { left: panelLeft, right: panelLeft + panel.getBoundingClientRect().width };
    },
    resize(nextViewport: number, nextLeft: number) {
      viewport = nextViewport;
      left = nextLeft;
      fireEvent(window, new Event("resize"));
    },
  };
}

function refuseWrites() {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
}

async function click(element: Element) {
  await act(async () => { fireEvent.click(element); });
}

async function holdProfileLock() {
  let release!: () => void;
  let entered!: () => void;
  const acquired = new Promise<void>((resolve) => { entered = resolve; });
  const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => {
    entered();
    return new Promise<void>((resolve) => { release = resolve; });
  });
  await acquired;
  return async () => { await act(async () => { release(); await held; }); };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("AddToListButton", () => {
  it.each(["create", "add", "remove"])("keeps existing lists and drafts after a transient read failure during %s, then retries", async (action) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const otherTitle = { ...item, id: 949, title: "Heat" };
    const existing = collection(action === "remove" ? [otherTitle, item] : [otherTitle]);
    const otherList = { ...collection(), id: "other", name: "Other list" };
    const initial = [existing, otherList];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(initial));
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const release = await holdProfileLock();
    const button = screen.getByRole("button", {
      name: action === "create" ? "Create list and add this title" : /Existing list/,
    });
    await click(button);
    refuseNextLocalStorageRead(COLLECTIONS_STORAGE_KEY);

    await release();

    expect(stored()).toEqual(initial);
    expect(input.value).toBe("Friday night");
    expect(button.getAttribute("aria-disabled")).toBe("false");
    expect(input.readOnly).toBe(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
    await click(button);
    if (action === "create") {
      expect(stored()[0]).toMatchObject({ name: "Friday night", items: [item] });
      expect(stored().slice(1)).toEqual(initial);
    } else {
      expect(stored()[0].items).toEqual(action === "add" ? [otherTitle, item] : [otherTitle]);
      expect(stored()[1]).toEqual(otherList);
    }
  });

  it("returns focus from the list name to the trigger when Escape closes the picker", async () => {
    const input = await openPanel();
    input.focus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "New list name" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add to list" }));
  });

  it("ignores the Escape that cancels an IME composition in the list name", async () => {
    const input = await openPanel();
    input.focus();

    fireEvent.keyDown(input, { key: "Escape", isComposing: true });

    expect(screen.getByRole("textbox", { name: "New list name" })).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it.each(["membership", "creation"])("keeps keyboard focus on the %s control while its save waits", async (action) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const release = await holdProfileLock();
    const control = action === "membership"
      ? screen.getByRole("button", { name: /Existing list/ })
      : input;
    control.focus();

    if (action === "membership") await click(control);
    else await act(async () => { fireEvent.submit(input.form!); });

    expect(document.activeElement).toBe(control);
    await release();
    expect(document.activeElement).toBe(action === "membership"
      ? screen.getByRole("button", { name: /Existing list/ })
      : screen.getByRole("textbox", { name: "New list name" }));
    expect(stored().some((entry) => entry.items.some((title) => title.id === item.id))).toBe(true);
  });

  it("leaves focus on another control when Escape dismisses an unfocused picker", async () => {
    await openPanel();
    const otherControl = document.createElement("button");
    document.body.appendChild(otherControl);
    otherControl.focus();

    fireEvent.keyDown(otherControl, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "New list name" })).toBeNull();
    expect(document.activeElement).toBe(otherControl);
    otherControl.remove();
  });

  it.each([
    { viewport: 375, anchorLeft: 196.28, expectedLeft: 71 },
    { viewport: 375, anchorLeft: 350, expectedLeft: 71 },
    { viewport: 375, anchorLeft: 0, expectedLeft: 16 },
    { viewport: 1280, anchorLeft: 400, expectedLeft: 400 },
    { viewport: 1280, anchorLeft: 1000, expectedLeft: 976 },
    { viewport: 280, anchorLeft: 196, expectedLeft: 16 },
  ])("keeps the whole picker within a $viewport px viewport at anchor $anchorLeft", async ({ viewport, anchorLeft, expectedLeft }) => {
    const picker = await openPositionedPanel(viewport, anchorLeft);
    const bounds = picker.bounds();

    expect(bounds.left).toBeCloseTo(expectedLeft);
    expect(bounds.left).toBeGreaterThanOrEqual(16);
    expect(bounds.right).toBeLessThanOrEqual(viewport - 16);
    expect(screen.getByRole("button", { name: "Create list and add this title" })).toBeTruthy();
  });

  it("repositions and narrows an open picker when its action row wraps after resize", async () => {
    const picker = await openPositionedPanel(1280, 900);
    expect(picker.bounds()).toEqual({ left: 900, right: 1188 });

    picker.resize(375, 196.28);
    expect(picker.bounds().left).toBeCloseTo(71);
    expect(picker.bounds().right).toBeCloseTo(359);

    picker.resize(280, 16);
    expect(picker.bounds()).toEqual({ left: 16, right: 264 });
    expect(picker.panel.getBoundingClientRect().width).toBe(248);
  });

  it.each(["membership", "creation"])("reads another tab's changes after a queued %s action acquires the lock", async (action) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const release = await holdProfileLock();
    const request = vi.spyOn(navigator.locks, "request");
    const button = screen.getByRole("button", {
      name: action === "membership" ? /Existing list/ : "Create list and add this title",
    });
    await click(button);
    await click(button);
    // Busy, but never natively disabled: that would blur the pressed control.
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(PROFILE_ROSTER_LOCK);
    expect(stored()).toEqual([collection()]);

    const otherTitle = { ...item, id: 949, title: "Heat" };
    const newer = [collection([otherTitle]), { ...collection(), id: "other", name: "Other tab" }];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(newer));
    await release();

    if (action === "membership") {
      expect(stored()[0].items).toEqual([otherTitle, item]);
      expect(stored()[1]).toEqual(newer[1]);
    } else {
      expect(stored()[0]).toMatchObject({ name: "Friday night", items: [item] });
      expect(stored().slice(1)).toEqual(newer);
      expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Added to "Friday night"', "success");
    }
  });

  it("does not recreate a list removed by a restore while its membership action waits", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    await openPanel();
    const release = await holdProfileLock();
    await click(screen.getByRole("button", { name: /Existing list/ }));
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "[]");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await release();
    expect(stored()).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "That list is no longer available. Reopen the list picker and try again.", "info",
    );
  });

  it.each(["switch", "unmount"])("cancels a queued creation after %s without claiming success", async (change) => {
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const release = await holdProfileLock();
    await click(screen.getByRole("button", { name: "Create list and add this title" }));
    if (change === "switch") window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    else cleanup();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await release();
    expect(writes).not.toHaveBeenCalled();
    expect(stored()).toEqual([]);
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("reports a missing browser lock without writing or clearing the draft", async () => {
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    vi.stubGlobal("navigator", {});
    await click(screen.getByRole("button", { name: "Create list and add this title" }));
    expect(stored()).toEqual([]);
    expect(input.value).toBe("Friday night");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
  });

  it.each(["membership", "creation"])("keeps a %s change with the picker owner if the pointer changes after its guard", async (action) => {
    const locks = createProfileLockManager();
    let insideLock = false;
    vi.stubGlobal("navigator", { locks: {
      request<T>(name: string, options: LockOptions, operation: () => T | PromiseLike<T>) {
        return locks.request(name, options, () => {
          insideLock = true;
          try { return operation(); } finally { insideLock = false; }
        });
      },
    } });
    initializeProfileStorage();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    const bobCollections = [{ ...collection(), name: "Bob's list" }];
    const bobKey = profileStoreKey(COLLECTIONS_STORAGE_KEY, "bob");
    window.localStorage.setItem(bobKey, JSON.stringify(bobCollections));
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = getItem.call(this, key);
      if (insideLock && key === COLLECTIONS_STORAGE_KEY) setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      return value;
    });

    await click(screen.getByRole("button", {
      name: action === "membership" ? /Existing list/ : "Create list and add this title",
    }));

    expect(stored()[0].items).toEqual([item]);
    expect(stored()[0].name).toBe(action === "membership" ? "Existing list" : "Friday night");
    expect(JSON.parse(window.localStorage.getItem(bobKey)!)).toEqual(bobCollections);
  });

  it.each([false, true])("explains a full list without saving or claiming an add (filled in another tab: %s)", async (filledLater) => {
    const full = collection(Array.from({ length: MAX_COLLECTION_ITEMS }, (_, index) => ({
      ...item, id: index + 1, title: `Title ${index + 1}`,
    })));
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([
      filledLater ? collection(full.items.slice(0, -1)) : full,
    ]));
    await openPanel();
    if (filledLater) window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([full]));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await click(screen.getByRole("button", { name: /Existing list/ }));

    expect(stored()).toEqual([full]);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Existing list.*full/ }).getAttribute("aria-pressed"))
      .toBe("false");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      `"Existing list" is full (${MAX_COLLECTION_ITEMS} titles). Remove a title before adding another.`,
      "error",
    );
  });

  it("still removes a title from a full list", async () => {
    const full = collection([item, ...Array.from({ length: MAX_COLLECTION_ITEMS - 1 }, (_, index) => ({
      ...item, id: index + 1, title: `Title ${index + 1}`,
    }))]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([full]));
    await openPanel();

    await click(screen.getByRole("button", { name: /Existing list/ }));

    expect(stored()[0].items).toHaveLength(MAX_COLLECTION_ITEMS - 1);
    expect(stored()[0].items.some((entry) => entry.id === item.id)).toBe(false);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("keeps an intended add when a full list already gained that title in another tab", async () => {
    const others = Array.from({ length: MAX_COLLECTION_ITEMS - 1 }, (_, index) => ({
      ...item, id: index + 1, title: `Title ${index + 1}`,
    }));
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection(others)]));
    await openPanel();
    const full = collection([...others, item]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([full]));

    await click(screen.getByRole("button", { name: /Existing list/ }));

    expect(stored()).toEqual([full]);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("preserves another tab's newer list and titles before its storage event arrives", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    await openPanel();
    const otherTitle = { ...item, id: 949, title: "Heat" };
    const newer = [collection([otherTitle]), { ...collection(), id: "new-list", name: "Another tab's list" }];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(newer));

    await click(screen.getByRole("button", { name: /Existing list/ }));

    expect(stored()).toHaveLength(2);
    expect(stored()[0].items).toEqual([otherTitle, item]);
    expect(stored()[1]).toEqual(newer[1]);
  });

  it("preserves a concurrently created list when creating a new one", async () => {
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const newer = collection([{ ...item, id: 949, title: "Heat" }]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([newer]));

    await click(screen.getByRole("button", { name: "Create list and add this title" }));

    expect(stored()).toHaveLength(2);
    expect(stored()[0]).toMatchObject({ name: "Friday night", items: [item] });
    expect(stored()[1]).toEqual(newer);
  });

  it("keeps an intended add when another tab already added the same title", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    await openPanel();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection([item])]));

    await click(screen.getByRole("button", { name: /Existing list/ }));

    expect(stored()[0].items).toEqual([item]);
  });

  it.each(["membership", "creation"])("refuses an old profile's %s action before its storage event arrives", async (action) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    const incoming = { ...collection(), name: "Other profile's list" };
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([incoming]));
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other-profile");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await click(screen.getByRole("button", {
      name: action === "membership" ? /Existing list/ : "Create list and add this title",
    }));

    expect(stored()).toEqual([incoming]);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "New list name" })).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.stringContaining("active profile changed"), "info",
    );
  });

  it("closes the picker and discards the old draft after a profile event", async () => {
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Old profile draft" } });
    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other-profile");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });

    expect(screen.queryByRole("textbox", { name: "New list name" })).toBeNull();
    await click(screen.getByRole("button", { name: "Add to list" }));
    expect((screen.getByRole("textbox", { name: "New list name" }) as HTMLInputElement).value)
      .toBe("");
  });

  it("creates the list with its title and confirms the sanitized name", async () => {
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "  Friday\u200Bnight  " } });
    await click(screen.getByRole("button", { name: "Create list and add this title" }));

    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ name: "Friday night", items: [item] });
    expect(input.value).toBe("");
    expect(toast.showToast).toHaveBeenCalledWith('Added to "Friday night"', "success");
  });

  it("keeps the name and existing lists when creating a list cannot be saved", async () => {
    const existing = collection();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    const input = await openPanel();
    fireEvent.change(input, { target: { value: "Friday night" } });
    refuseWrites();
    await click(screen.getByRole("button", { name: "Create list and add this title" }));

    expect(stored()).toEqual([existing]);
    expect(input.value).toBe("Friday night");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
    expect(screen.getByRole("button", { name: "Add to list" })).not.toBeNull();
  });

  it.each([false, true])("rejects an invisible name without changing storage (existing list: %s)", async (hasExisting) => {
    const initial = hasExisting ? [collection()] : [];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(initial));
    const input = await openPanel();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    fireEvent.change(input, { target: { value: "\u200B" } });
    await click(screen.getByRole("button", { name: "Create list and add this title" }));

    expect(stored()).toEqual(initial);
    expect(setItem).not.toHaveBeenCalled();
    expect(input.value).toBe("\u200B");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Enter a list name with visible characters",
      "error",
    );
  });

  it.each([false, true])("reports a refused membership change (already a member: %s)", async (isMember) => {
    const existing = collection(isMember ? [item] : []);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    await openPanel();
    refuseWrites();
    await click(screen.getByRole("button", { name: /Existing list/ }));

    expect(stored()).toEqual([existing]);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
    expect(screen.getByRole("button", { name: isMember ? "On 1 list" : "Add to list" })).not.toBeNull();
  });
});
