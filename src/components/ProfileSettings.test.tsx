// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "@/components/Toast";
import {
  getSettings,
  refreshSettings,
  REGION_KEY,
  SELECTED_PROVIDERS_KEY,
  setWatchProviderFilter,
  WATCH_PROVIDER_FILTER_KEY,
} from "@/lib/settings";
import { ProfileSettings } from "./ProfileSettings";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";

vi.mock("@/components/Toast", () => ({
  toast: { showToast: vi.fn() },
}));

vi.mock("@/components/StreamingProviderSelector", () => ({
  StreamingProviderSelector: ({
    selectedProviderIds,
    onUpdate,
    region,
    disabled,
  }: {
    selectedProviderIds: number[];
    onUpdate: (update: (ids: number[]) => number[], expectedRegion: string) => void;
    region: string;
    disabled?: boolean;
  }) => (
    <button onClick={() => onUpdate((current) => current.includes(8)
      ? current.filter((id) => id !== 8)
      : [...current, 8], region)} disabled={disabled}>
      {selectedProviderIds.includes(8) ? "Platform selected" : "Select platform"}
    </button>
  ),
}));

function refuseWritesTo(key: string) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    writtenKey,
    value,
  ) {
    if (writtenKey === key) throw new DOMException("Quota exceeded", "QuotaExceededError");
    original.call(this, writtenKey, value);
  });
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  refreshSettings();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  refreshSettings();
});

describe("settings save feedback", () => {
  const changes = [
    { kind: "region", key: REGION_KEY, value: "CZ", error: "Could not save your region. Please try again." },
    { kind: "filter", key: WATCH_PROVIDER_FILTER_KEY, value: "streaming-only", error: "Could not save what to show. Please try again." },
    { kind: "platforms", key: SELECTED_PROVIDERS_KEY, value: "8", error: "Could not save your platforms. Please try again." },
  ];

  function prepareChange(kind: string) {
    if (kind === "platforms") setWatchProviderFilter("streaming-only");
    render(<ProfileSettings />);
  }

  function makeChange(kind: string) {
    if (kind === "region") {
      fireEvent.change(screen.getByLabelText("Country or region"), { target: { value: "CZ" } });
    } else if (kind === "filter") {
      fireEvent.click(screen.getByRole("radio", { name: /^Only my platforms/ }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Select platform" }));
    }
  }

  it.each(changes)("waits for the shared lock before saving $kind and disables the settings controls", async ({ kind, key, value }) => {
    prepareChange(kind);
    const previous = getSettings();
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    const requests = vi.spyOn(navigator.locks, "request");
    const writes = vi.spyOn(Storage.prototype, "setItem");

    act(() => { makeChange(kind); });

    expect(requests).toHaveBeenCalledExactlyOnceWith(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, expect.any(Function));
    expect(writes).not.toHaveBeenCalled();
    expect(getSettings()).toBe(previous);
    expect(screen.getByText("Saving changes…")).toBeTruthy();
    expect((screen.getByLabelText("Country or region") as HTMLSelectElement).disabled).toBe(true);
    for (const radio of screen.getAllByRole("radio")) {
      expect((radio as HTMLInputElement).disabled).toBe(true);
    }
    if (kind === "platforms") {
      expect((screen.getByRole("button", { name: "Select platform" }) as HTMLButtonElement).disabled).toBe(true);
    }

    await act(async () => { release(); await held; });

    expect(window.localStorage.getItem(key)).toBe(value);
    expect(screen.getByText("All changes saved")).toBeTruthy();
    expect((screen.getByLabelText("Country or region") as HTMLSelectElement).disabled).toBe(false);
    for (const radio of screen.getAllByRole("radio")) {
      expect((radio as HTMLInputElement).disabled).toBe(false);
    }
  });

  it.each(changes.flatMap((change) => [
    { ...change, failure: "unavailable" }, { ...change, failure: "refused" },
  ]))("keeps $kind unchanged when the shared lock is $failure", async ({ kind, error, failure }) => {
    prepareChange(kind);
    const previous = getSettings();
    if (failure === "unavailable") vi.stubGlobal("navigator", {});
    else vi.spyOn(navigator.locks, "request").mockRejectedValue(new DOMException("Lock denied", "SecurityError"));

    await act(async () => { makeChange(kind); });

    expect(getSettings()).toBe(previous);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(error, "error");
    expect(screen.getByText("Changes could not be saved. Please try again.")).toBeTruthy();
    expect(screen.queryByText("All changes saved")).toBeNull();
    expect((screen.getByLabelText("Country or region") as HTMLSelectElement).disabled).toBe(false);
  });

  it("reports a refused region write and keeps the saved selection", async () => {
    render(<ProfileSettings />);
    refuseWritesTo(REGION_KEY);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Country or region"), {
        target: { value: "CZ" },
      });
    });

    expect(getSettings().region).toBe("US");
    expect((screen.getByLabelText("Country or region") as HTMLSelectElement).value).toBe("US");
    expect(screen.queryByText("All changes saved")).toBeNull();
    expect(screen.getByText("Changes could not be saved. Please try again.")).toBeTruthy();
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not save your region. Please try again.",
      "error",
    );
  });

  it("reports a refused filter write and keeps the previous filter", async () => {
    render(<ProfileSettings />);
    refuseWritesTo(WATCH_PROVIDER_FILTER_KEY);

    await act(async () => { fireEvent.click(screen.getByRole("radio", { name: /^Only my platforms/ })); });

    expect(getSettings().watchProviderFilter).toBe("all");
    expect((screen.getByRole("radio", { name: /^Everything/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText("All changes saved")).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not save what to show. Please try again.",
      "error",
    );
  });

  it("reports a refused platform write and keeps the previous platforms", async () => {
    setWatchProviderFilter("streaming-only");
    render(<ProfileSettings />);
    refuseWritesTo(SELECTED_PROVIDERS_KEY);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Select platform" })); });

    expect(getSettings().selectedProviderIds).toEqual([]);
    expect(screen.getByRole("button", { name: "Select platform" })).toBeTruthy();
    expect(screen.queryByText("All changes saved")).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not save your platforms. Please try again.",
      "error",
    );
  });

  it("replaces a previous success with the failure and allows retrying", async () => {
    render(<ProfileSettings />);
    const region = screen.getByLabelText("Country or region");
    await act(async () => { fireEvent.change(region, { target: { value: "GB" } }); });
    expect(screen.getByText("All changes saved")).toBeTruthy();

    const writes = refuseWritesTo(REGION_KEY);
    await act(async () => { fireEvent.change(region, { target: { value: "CZ" } }); });
    expect(screen.queryByText("All changes saved")).toBeNull();
    expect(screen.getByText("Changes could not be saved. Please try again.")).toBeTruthy();
    expect(getSettings().region).toBe("GB");

    writes.mockRestore();
    await act(async () => { fireEvent.change(region, { target: { value: "CZ" } }); });
    expect(screen.getByText("All changes saved")).toBeTruthy();
    expect(screen.queryByText("Changes could not be saved. Please try again.")).toBeNull();
    expect(getSettings().region).toBe("CZ");
  });
});
