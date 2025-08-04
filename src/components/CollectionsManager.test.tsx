// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  COLLECTIONS_STORAGE_KEY,
  MAX_COLLECTIONS,
  type Collection,
  type CollectionItem,
} from "@/lib/collections";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey } from "@/lib/profile-storage";
import { toast } from "./Toast";
import { CollectionsManager } from "./CollectionsManager";

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

describe("CollectionsManager", () => {
  it.each(["create", "rename", "delete", "remove"])("preserves all lists when the first read for %s fails and allows retry", async (action) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const otherTitle = { ...item, id: 949, title: "Heat" };
    const otherList = { ...collection(), id: "other", name: "Other list" };
    const initial = [collection([item, otherTitle]), otherList];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(initial));
    render(<CollectionsManager />);
    if (action === "create") {
      fireEvent.change(screen.getByRole("textbox", { name: "New list" }), { target: { value: "Friday night" } });
    } else if (action === "rename") {
      await click(screen.getByRole("button", { name: "Rename Existing list" }));
      fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Friday night" } });
    } else if (action === "delete") {
      await click(screen.getByRole("button", { name: "Delete Existing list" }));
    }
    const release = await holdProfileLock();
    const button = screen.getByRole("button", {
      name: action === "create" ? "Create" : action === "rename" ? "Save" : action === "delete" ? "Delete" : "Remove Fight Club from Existing list",
    });
    await click(button);
    refuseNextLocalStorageRead(COLLECTIONS_STORAGE_KEY);

    await release();

    expect(stored()).toEqual(initial);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
    if (action === "create" || action === "rename") {
      expect((screen.getByRole("textbox", { name: action === "create" ? "New list" : "List name" }) as HTMLInputElement).value).toBe("Friday night");
    }
    await click(button);
    if (action === "create") {
      expect(stored()[0].name).toBe("Friday night");
      expect(stored().slice(1)).toEqual(initial);
    } else if (action === "delete") {
      expect(stored()).toEqual([otherList]);
    } else {
      expect(stored()[0].name).toBe(action === "rename" ? "Friday night" : "Existing list");
      expect(stored()[0].items).toEqual(action === "remove" ? [otherTitle] : [item, otherTitle]);
      expect(stored()[1]).toEqual(otherList);
    }
  });

  it.each(["create", "rename", "delete", "remove"])("waits for the shared lock before reading and applying %s", async (action) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection([item])]));
    render(<CollectionsManager />);
    if (action === "create") {
      fireEvent.change(screen.getByRole("textbox", { name: "New list" }), { target: { value: "Friday night" } });
    } else if (action === "rename") {
      await click(screen.getByRole("button", { name: "Rename Existing list" }));
      fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Friday night" } });
    } else if (action === "delete") {
      await click(screen.getByRole("button", { name: "Delete Existing list" }));
    }
    const release = await holdProfileLock();
    const request = vi.spyOn(navigator.locks, "request");
    const label = action === "create" ? "Create" : action === "rename" ? "Save" : action === "delete" ? "Delete" : "Remove Fight Club from Existing list";
    const button = screen.getByRole("button", { name: label });
    await click(button);
    await click(button);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(PROFILE_ROSTER_LOCK);
    expect(button.getAttribute("disabled")).not.toBeNull();
    expect(stored()).toEqual([collection([item])]);

    const otherTitle = { ...item, id: 949, title: "Heat" };
    const current = { ...collection([item, otherTitle]), name: "Renamed elsewhere" };
    const other = { ...collection(), id: "other", name: "Other tab" };
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([current, other]));
    await release();
    if (action === "create") {
      expect(stored()[0].name).toBe("Friday night");
      expect(stored().slice(1)).toEqual([current, other]);
    } else if (action === "delete") {
      expect(stored()).toEqual([other]);
    } else {
      expect(stored()[0].name).toBe(action === "rename" ? "Friday night" : current.name);
      expect(stored()[0].items).toEqual(action === "rename" ? [item, otherTitle] : [otherTitle]);
      expect(stored()[1]).toEqual(other);
    }
  });

  it.each(["rename", "delete", "remove"])("does not recreate a list removed by a restore before queued %s", async (action) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection([item])]));
    render(<CollectionsManager />);
    if (action === "rename") {
      await click(screen.getByRole("button", { name: "Rename Existing list" }));
      fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Friday night" } });
    } else if (action === "delete") await click(screen.getByRole("button", { name: "Delete Existing list" }));
    const release = await holdProfileLock();
    const label = action === "rename" ? "Save" : action === "delete" ? "Delete" : "Remove Fight Club from Existing list";
    await click(screen.getByRole("button", { name: label }));
    const restored = [{ ...collection(), id: "restored", name: "Restored list" }];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(restored));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await release();
    expect(stored()).toEqual(restored);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["pointer", "event", "unmount"])("cancels queued creation after a profile %s", async (change) => {
    render(<CollectionsManager />);
    fireEvent.change(screen.getByRole("textbox", { name: "New list" }), { target: { value: "Friday night" } });
    const release = await holdProfileLock();
    await click(screen.getByRole("button", { name: "Create" }));
    if (change === "unmount") cleanup();
    else {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      if (change === "event") act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      });
    }
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await release();
    expect(stored()).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("keeps a draft when the browser cannot acquire a lock", async () => {
    render(<CollectionsManager />);
    const input = screen.getByRole("textbox", { name: "New list" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Friday night" } });
    vi.stubGlobal("navigator", {});
    await click(screen.getByRole("button", { name: "Create" }));
    expect(stored()).toEqual([]);
    expect(input.value).toBe("Friday night");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
  });

  it("keeps a rename with its displayed owner when the active pointer changes after the guard", async () => {
    initializeProfileStorage();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    const bobCollections = [{ ...collection(), name: "Bob's list" }];
    const bobKey = profileStoreKey(COLLECTIONS_STORAGE_KEY, "bob");
    window.localStorage.setItem(bobKey, JSON.stringify(bobCollections));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), { target: { value: "Friday night" } });
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = getItem.call(this, key);
      if (key === COLLECTIONS_STORAGE_KEY) setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      return value;
    });

    await click(screen.getByRole("button", { name: "Save" }));

    expect(stored()[0].name).toBe("Friday night");
    expect(JSON.parse(window.localStorage.getItem(bobKey)!)).toEqual(bobCollections);
  });

  it("clears a new-list draft when another tab changes the active profile without changing collections", async () => {
    render(<CollectionsManager />);
    fireEvent.change(screen.getByRole("textbox", { name: "New list" }), {
      target: { value: "My private draft" },
    });

    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });

    expect((screen.getByRole("textbox", { name: "New list" }) as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "New list" }), {
      target: { value: "Bob's picks" },
    });
    await click(screen.getByRole("button", { name: "Create" }));
    expect(stored().map((entry) => entry.name)).toEqual(["Bob's picks"]);
  });

  it("refuses a new list for a different profile before its storage event arrives", async () => {
    render(<CollectionsManager />);
    fireEvent.change(screen.getByRole("textbox", { name: "New list" }), {
      target: { value: "My private draft" },
    });
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", { name: "Create" }));

    expect(stored()).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Your active profile changed. Review the current list and try again.",
      "info",
    );
  });

  it.each(["rename", "delete", "share"])("dismisses an open %s when profiles contain identical lists", async (action) => {
    const existing = collection([item]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    if (action === "rename") {
      await click(screen.getByRole("button", { name: "Rename Existing list" }));
      fireEvent.change(screen.getByRole("textbox", { name: "List name" }), {
        target: { value: "My private draft" },
      });
    } else if (action === "delete") {
      await click(screen.getByRole("button", { name: "Delete Existing list" }));
    } else {
      await click(screen.getByRole("button", { name: "Share" }));
    }

    act(() => {
      // Importing one backup into multiple profiles can retain identical list IDs
      // and bytes. Only the active-profile key produces a storage event.
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });

    expect(stored()).toEqual([existing]);
    expect(screen.queryByRole("textbox", { name: "List name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Share link" })).toBeNull();
  });

  it.each(["rename", "delete", "remove"])("refuses %s on another profile's same-ID list before its storage event arrives", async (action) => {
    const existing = collection([item]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    if (action === "rename") {
      await click(screen.getByRole("button", { name: "Rename Existing list" }));
      fireEvent.change(screen.getByRole("textbox", { name: "List name" }), {
        target: { value: "My private draft" },
      });
    } else if (action === "delete") {
      await click(screen.getByRole("button", { name: "Delete Existing list" }));
    }
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const label = action === "rename" ? "Save" : action === "delete" ? "Delete" : "Remove Fight Club from Existing list";
    await click(screen.getByRole("button", { name: label }));

    expect(stored()).toEqual([existing]);
    expect(setItem).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Your active profile changed. Review the current list and try again.",
      "info",
    );
  });

  it.each([false, true])("opens a rename with the latest name from another tab (storage event delivered: %s)", async (eventDelivered) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    render(<CollectionsManager />);
    const updated = { ...collection(), name: "Renamed elsewhere" };
    act(() => {
      window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([updated]));
      if (eventDelivered) {
        window.dispatchEvent(new StorageEvent("storage", { key: COLLECTIONS_STORAGE_KEY }));
      }
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", {
      name: eventDelivered ? "Rename Renamed elsewhere" : "Rename Existing list",
    }));

    expect((screen.getByRole("textbox", { name: "List name" }) as HTMLInputElement).value)
      .toBe("Renamed elsewhere");
    await click(screen.getByRole("button", { name: "Save" }));
    expect(stored()).toEqual([updated]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("shares the current name after renaming a list in the same tab", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection([item])]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), {
      target: { value: "Friday night" },
    });
    await click(screen.getByRole("button", { name: "Save" }));
    await click(screen.getByRole("button", { name: "Share" }));

    expect((screen.getByRole("textbox", { name: "Name it (optional)" }) as HTMLInputElement).value)
      .toBe("Friday night");
    const url = (screen.getByRole("textbox", { name: "Share link" }) as HTMLInputElement).value;
    expect(new URL(url).searchParams.get("t")).toBe("Friday night");
  });

  it("preserves lists saved in another tab before its storage event arrives", async () => {
    const existing = collection();
    render(<CollectionsManager />);
    fireEvent.change(screen.getByRole("textbox", { name: "New list" }), {
      target: { value: "Friday night" },
    });
    // A different tab has written the store, but this tab has not received the
    // storage event yet. Its rendered list is still empty.
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    await click(screen.getByRole("button", { name: "Create" }));

    expect(stored()).toHaveLength(2);
    expect(stored()[0].name).toBe("Friday night");
    expect(stored()[1]).toEqual(existing);
  });

  it("checks the current list limit before creating a list", async () => {
    render(<CollectionsManager />);
    fireEvent.change(screen.getByRole("textbox", { name: "New list" }), {
      target: { value: "Friday night" },
    });
    const latest = Array.from({ length: MAX_COLLECTIONS }, (_, index) => ({
      ...collection(),
      id: `list-${index}`,
    }));
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(latest));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", { name: "Create" }));

    expect(stored()).toEqual(latest);
    expect(setItem).not.toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "That is the most lists one browser can hold",
      "error",
    );
  });

  it("preserves concurrent titles and other lists when renaming", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), {
      target: { value: "Friday night" },
    });
    const concurrent = { ...collection(), id: "other-list", name: "Other list" };
    window.localStorage.setItem(
      COLLECTIONS_STORAGE_KEY,
      JSON.stringify([collection([item]), concurrent]),
    );
    await click(screen.getByRole("button", { name: "Save" }));

    expect(stored()[0].name).toBe("Friday night");
    expect(stored()[0].items).toEqual([item]);
    expect(stored()[1]).toEqual(concurrent);
  });

  it("does not recreate a list deleted in another tab while renaming", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), {
      target: { value: "Friday night" },
    });
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, "[]");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", { name: "Save" }));

    expect(stored()).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "No lists yet" })).not.toBeNull();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "That list is no longer available",
      "info",
    );
  });

  it("finishes an unchanged rename without rewriting current data", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    fireEvent.change(screen.getByRole("textbox", { name: "List name" }), {
      target: { value: "  Existing list  " },
    });
    const latest = collection([item]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([latest]));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", { name: "Save" }));

    expect(stored()).toEqual([latest]);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "List name" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fight Club" })).not.toBeNull();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("preserves other lists changed after delete confirmation opened", async () => {
    const existing = collection();
    const other = { ...collection(), id: "other-list", name: "Other list" };
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing, other]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Delete Existing list" }));
    const updatedOther = { ...other, items: [item] };
    window.localStorage.setItem(
      COLLECTIONS_STORAGE_KEY,
      JSON.stringify([existing, updatedOther]),
    );
    await click(screen.getByRole("button", { name: "Delete" }));

    expect(stored()).toEqual([updatedOther]);
  });

  it("does not rewrite storage when a confirmed list has already been deleted", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection()]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Delete Existing list" }));
    const latest = [{ ...collection(), id: "other-list", name: "Other list", items: [item] }];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(latest));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", { name: "Delete" }));

    expect(stored()).toEqual(latest);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Existing list" })).toBeNull();
  });

  it("removes only the clicked title while retaining concurrent changes", async () => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection([item])]));
    render(<CollectionsManager />);
    const concurrentItem = { ...item, id: 11, title: "Star Wars" };
    const latest = { ...collection([item, concurrentItem]), name: "Renamed elsewhere" };
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([latest]));
    await click(screen.getByRole("button", { name: "Remove Fight Club from Existing list" }));

    expect(stored()[0].name).toBe("Renamed elsewhere");
    expect(stored()[0].items).toEqual([concurrentItem]);
  });

  it.each([false, true])("does not rewrite storage when the clicked title is gone (list still exists: %s)", async (listExists) => {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([collection([item])]));
    render(<CollectionsManager />);
    const latest = listExists ? [collection()] : [];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(latest));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await click(screen.getByRole("button", { name: "Remove Fight Club from Existing list" }));

    expect(stored()).toEqual(latest);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Fight Club" })).toBeNull();
  });

  it("creates a list and confirms its sanitized name", async () => {
    render(<CollectionsManager />);
    const input = screen.getByRole("textbox", { name: "New list" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Friday\u200Bnight  " } });
    await click(screen.getByRole("button", { name: "Create" }));

    expect(stored()).toHaveLength(1);
    expect(stored()[0].name).toBe("Friday night");
    expect(input.value).toBe("");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Created "Friday night"', "success");
  });

  it("keeps the entered name and existing lists when creating a list cannot be saved", async () => {
    const existing = collection();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    const input = screen.getByRole("textbox", { name: "New list" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Friday night" } });
    refuseWrites();
    await click(screen.getByRole("button", { name: "Create" }));

    expect(stored()).toEqual([existing]);
    expect(input.value).toBe("Friday night");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
    expect(screen.queryByRole("heading", { name: "Friday night" })).toBeNull();
  });

  it.each([false, true])("rejects an invisible list name (existing list: %s)", async (hasExisting) => {
    const initial = hasExisting ? [collection()] : [];
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(initial));
    render(<CollectionsManager />);
    const input = screen.getByRole("textbox", { name: "New list" }) as HTMLInputElement;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    fireEvent.change(input, { target: { value: "\u200B" } });
    await click(screen.getByRole("button", { name: "Create" }));

    expect(stored()).toEqual(initial);
    expect(setItem).not.toHaveBeenCalled();
    expect(input.value).toBe("\u200B");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Enter a list name with visible characters",
      "error",
    );
  });

  it("keeps an unsaved rename available to retry", async () => {
    const existing = collection();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    const input = screen.getByRole("textbox", { name: "List name" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Friday night" } });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await click(screen.getByRole("button", { name: "Save" }));

    expect(stored()).toEqual([existing]);
    expect(input.value).toBe("Friday night");
    expect(screen.getByRole("textbox", { name: "List name" })).toBe(input);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");

    setItem.mockRestore();
    await click(screen.getByRole("button", { name: "Save" }));
    expect(stored()[0].name).toBe("Friday night");
    expect(screen.queryByRole("textbox", { name: "List name" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Friday night" })).not.toBeNull();
  });

  it("keeps an invalid rename open without writing an unchanged list", async () => {
    const existing = collection();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Rename Existing list" }));
    const input = screen.getByRole("textbox", { name: "List name" }) as HTMLInputElement;
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    fireEvent.change(input, { target: { value: "\u200B" } });
    await click(screen.getByRole("button", { name: "Save" }));

    expect(stored()).toEqual([existing]);
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "List name" })).toBe(input);
    expect(input.value).toBe("\u200B");
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Enter a list name with visible characters",
      "error",
    );
  });

  it("reports a refused list deletion and retains its confirmation", async () => {
    const existing = collection();
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    await click(screen.getByRole("button", { name: "Delete Existing list" }));
    refuseWrites();
    await click(screen.getByRole("button", { name: "Delete" }));

    expect(stored()).toEqual([existing]);
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeNull();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
  });

  it("reports a refused title removal and keeps the title on its list", async () => {
    const existing = collection([item]);
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify([existing]));
    render(<CollectionsManager />);
    refuseWrites();
    await click(screen.getByRole("button", { name: "Remove Fight Club from Existing list" }));

    expect(stored()).toEqual([existing]);
    expect(screen.getByRole("link", { name: "Fight Club" })).not.toBeNull();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(STORAGE_REFUSED_MESSAGE, "error");
  });
});
