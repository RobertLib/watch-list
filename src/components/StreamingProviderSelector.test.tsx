// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StreamingProviderSelector } from "./StreamingProviderSelector";
import { ProfileSettings } from "./ProfileSettings";
import { tmdbFetchJson } from "@/lib/tmdb-cache";
import type { StreamingProvider } from "@/lib/streaming-providers";
import { useSettings, useSettingsActions } from "@/hooks/useSettings";
import { getSettings, refreshSettings, REGION_KEY, SELECTED_PROVIDERS_KEY, WATCH_PROVIDER_FILTER_KEY } from "@/lib/settings";
import { buildBackup, EMPTY_STORES } from "@/lib/portable-data";
import { restoreBackup } from "@/lib/restore-backup";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";

// Exercise the real provider loader so its display limit cannot accidentally
// become the list used to decide which saved platforms still exist.
vi.mock("@/lib/tmdb-cache", () => ({
  TMDB_CONFIG: { BASE_URL: "https://api.themoviedb.org/3" },
  TTL: { DAY: 86400 },
  tmdbFetchJson: vi.fn(),
}));

vi.mock("next/image", () => ({ default: () => null }));

function provider(id: number, priority: number): StreamingProvider {
  return {
    provider_id: id,
    provider_name: `Platform ${id}`,
    logo_path: "",
    display_priority: priority,
  };
}

const commonProviders = Array.from({ length: 30 }, (_, index) =>
  provider(1000 + index, index),
);

function answerRegions(catalogues: Record<string, StreamingProvider[]>) {
  vi.mocked(tmdbFetchJson).mockImplementation(async (url) => ({
    results: catalogues[new URL(url).searchParams.get("watch_region")!],
  }));
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  refreshSettings();
  vi.mocked(tmdbFetchJson).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  refreshSettings();
});

/** A stale rendered selection models a tab waiting for its storage events. */
function StoredSelection({ region, selected }: { region: string; selected: number[] }) {
  const { updateSelectedProviderIds } = useSettingsActions();
  return <StreamingProviderSelector
    region={region}
    selectedProviderIds={selected}
    onUpdate={updateSelectedProviderIds}
  />;
}

function LiveStoredSelection() {
  const { region, selectedProviderIds } = useSettings();
  return <StoredSelection region={region} selected={selectedProviderIds} />;
}

describe("regional platform selection", () => {
  it("reconciles saved platforms after the region changes while the picker is hidden", async () => {
    answerRegions({ GB: [provider(223, 0)], CZ: [provider(8, 0)] });
    window.localStorage.setItem(REGION_KEY, "GB");
    window.localStorage.setItem(WATCH_PROVIDER_FILTER_KEY, "streaming-only");
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "223");
    refreshSettings();
    render(<ProfileSettings />);
    await screen.findByRole("checkbox", { name: "Platform 223" });

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /^Everything/ }));
    });
    expect(screen.queryByRole("checkbox", { name: "Platform 223" })).toBeNull();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Country or region"), { target: { value: "CZ" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /^Only my platforms/ }));
    });

    await screen.findByRole("checkbox", { name: "Platform 8" });
    await waitFor(() => expect(getSettings().selectedProviderIds).toEqual([]));
    expect(getSettings().watchProviderFilter).toBe("streaming-only");
    expect(screen.queryByRole("checkbox", { name: "Platform 223" })).toBeNull();
    expect(screen.getByText("Nothing picked yet, so everything is shown")).toBeTruthy();
  });

  it.each(["movie", "tv"] as const)("reconciles saved platforms when a reload recovers from the region's failed %s catalogue", async (failedType) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.localStorage.setItem(REGION_KEY, "GB");
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "223");
    refreshSettings();
    let failCatalogue = true;
    vi.mocked(tmdbFetchJson).mockImplementation(async (url) => {
      if (url.endsWith("watch_region=CZ") && url.includes(`/${failedType}?`) && failCatalogue) {
        throw new Error("TMDB API error: 500");
      }
      return { results: url.endsWith("watch_region=GB") ? [provider(223, 0)] : [provider(8, 0)] };
    });
    const view = render(<LiveStoredSelection />);
    await screen.findByRole("checkbox", { name: "Platform 223" });
    await act(async () => {
      window.localStorage.setItem(REGION_KEY, "CZ");
      refreshSettings();
    });
    await screen.findByText("Failed to load streaming platforms");
    expect(getSettings().selectedProviderIds).toEqual([223]);

    // Try Again reloads the page, so the successful catalogue starts a new mount.
    view.unmount();
    failCatalogue = false;
    render(<LiveStoredSelection />);

    await screen.findByRole("checkbox", { name: "Platform 8" });
    await waitFor(() => expect(getSettings().selectedProviderIds).toEqual([]));
    expect(screen.getByText("Nothing picked yet, so everything is shown")).toBeTruthy();
  });

  it.each(["platforms", "error"] as const)("hides the old region's %s on the first commit while the new catalogue is loading", async (previousResult) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolveCatalogue!: (value: { results: StreamingProvider[] }) => void;
    const nextCatalogue = new Promise<{ results: StreamingProvider[] }>((resolve) => {
      resolveCatalogue = resolve;
    });
    vi.mocked(tmdbFetchJson).mockImplementation(async (url) => {
      if (url.endsWith("watch_region=CZ")) return nextCatalogue;
      if (previousResult === "error") throw new Error("TMDB API error: 500");
      return { results: [provider(8, 0)] };
    });
    const onUpdate = vi.fn();
    const onCommit = vi.fn();
    function CatalogueAtCommit({ region }: { region: string }) {
      useLayoutEffect(() => {
        // Observe the DOM before the provider effect starts the next request.
        onCommit({
          previousPlatform: screen.queryByRole("checkbox", { name: "Platform 8" }),
          previousError: screen.queryByText("Failed to load streaming platforms"),
          loading: screen.queryByRole("status"),
        });
      }, [region]);
      return <StreamingProviderSelector region={region} selectedProviderIds={[]} onUpdate={onUpdate} />;
    }
    const view = render(<CatalogueAtCommit region="US" />);
    if (previousResult === "platforms") await screen.findByRole("checkbox", { name: "Platform 8" });
    else await screen.findByText("Failed to load streaming platforms");

    view.rerender(<CatalogueAtCommit region="CZ" />);

    expect(onCommit.mock.lastCall?.[0].previousPlatform).toBeNull();
    expect(onCommit.mock.lastCall?.[0].previousError).toBeNull();
    expect(onCommit.mock.lastCall?.[0].loading).not.toBeNull();
    await act(async () => { resolveCatalogue({ results: [provider(223, 0)] }); });
    expect(screen.getByRole("checkbox", { name: "Platform 223" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    { action: "addition", role: "checkbox", name: "Platform 8" },
    { action: "removal", role: "checkbox", name: "Platform 119" },
    { action: "popular selection", role: "button", name: "Popular" },
    { action: "select all", role: "button", name: "Select all" },
    { action: "clear", role: "button", name: "Clear" },
  ])("ignores a queued $action from the old region even when the restored catalogue fails", async ({ role, name }) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(tmdbFetchJson).mockImplementation(async (url) => {
      if (url.endsWith("watch_region=CZ")) throw new Error("TMDB API error: 500");
      return { results: [provider(8, 0), provider(119, 1)] };
    });
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "119");
    refreshSettings();
    render(<LiveStoredSelection />);
    await screen.findByRole("checkbox", { name: "Platform 8" });
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    const restoredSelection = [223, 119];
    const restoring = restoreBackup(buildBackup({
      stores: EMPTY_STORES,
      activeProfile: null,
      otherProfiles: [],
      exportedAt: "2026-01-01T00:00:00.000Z",
      settings: { region: "CZ", watchProviderFilter: "streaming-only", selectedProviderIds: restoredSelection },
    }));

    fireEvent.click(screen.getByRole(role, { name }));
    const settled = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => undefined);
    expect(window.localStorage.getItem(SELECTED_PROVIDERS_KEY)).toBe("119");
    await act(async () => {
      release();
      await held;
      expect((await restoring).ok).toBe(true);
      await settled;
    });

    await screen.findByText("Failed to load streaming platforms");
    expect(getSettings().region).toBe("CZ");
    expect(getSettings().selectedProviderIds).toEqual(restoredSelection);
  });

  it.each([
    { action: "different additions", selected: [], firstId: 8, secondId: 119, expected: [8, 119] },
    { action: "identical additions", selected: [], firstId: 8, secondId: 8, expected: [8] },
    { action: "different removals", selected: [8, 119], firstId: 8, secondId: 119, expected: [] },
    { action: "identical removals", selected: [8, 119], firstId: 8, secondId: 8, expected: [119] },
  ])("preserves $action from two tabs queued with the same rendered selection", async ({ selected, firstId, secondId, expected }) => {
    answerRegions({ US: [provider(8, 0), provider(119, 1)] });
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, selected.join(","));
    render(<>
      <section aria-label="First tab"><StoredSelection region="US" selected={selected} /></section>
      <section aria-label="Second tab"><StoredSelection region="US" selected={selected} /></section>
    </>);
    const first = within(screen.getByRole("region", { name: "First tab" }));
    const second = within(screen.getByRole("region", { name: "Second tab" }));
    await first.findByRole("checkbox", { name: "Platform 8" });
    await second.findByRole("checkbox", { name: "Platform 119" });
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();

    fireEvent.click(first.getByRole("checkbox", { name: `Platform ${firstId}` }));
    fireEvent.click(second.getByRole("checkbox", { name: `Platform ${secondId}` }));
    expect(window.localStorage.getItem(SELECTED_PROVIDERS_KEY)).toBe(selected.join(","));
    await act(async () => { release(); await held; });

    expect(getSettings().selectedProviderIds).toEqual(expected);
  });

  it.each([
    { restoredRegion: "US", restoredSelection: [999, 1001] },
    { restoredRegion: "CZ", restoredSelection: [223] },
  ])("preserves selections from a queued restore before cleanup for another catalogue ($restoredRegion)", async ({ restoredRegion, restoredSelection }) => {
    answerRegions({ GB: [provider(998, 0), provider(999, 1)], US: [...commonProviders, provider(999, 99)] });
    window.localStorage.setItem(SELECTED_PROVIDERS_KEY, "998,999");
    const view = render(<StoredSelection region="GB" selected={[998, 999]} />);
    await screen.findByRole("checkbox", { name: "Platform 998" });
    let release!: () => void;
    const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => new Promise<void>((resolve) => {
      release = resolve;
    }));
    await Promise.resolve();
    const restoring = restoreBackup(buildBackup({
      stores: EMPTY_STORES,
      activeProfile: null,
      otherProfiles: [],
      exportedAt: "2026-01-01T00:00:00.000Z",
      settings: { region: restoredRegion, watchProviderFilter: "streaming-only", selectedProviderIds: restoredSelection },
    }));
    view.rerender(<StoredSelection region="US" selected={[998, 999]} />);
    await screen.findByRole("checkbox", { name: "Platform 1000" });
    expect(window.localStorage.getItem(SELECTED_PROVIDERS_KEY)).toBe("998,999");

    await act(async () => { release(); await held; expect((await restoring).ok).toBe(true); });

    expect(getSettings().selectedProviderIds).toEqual(restoredSelection);
  });

  it("disables platform choices and quick actions while a settings write is pending", async () => {
    answerRegions({ US: [provider(8, 0)] });
    const onUpdate = vi.fn();
    const view = render(
      <StreamingProviderSelector region="US" selectedProviderIds={[8]} onUpdate={onUpdate} disabled />,
    );
    const selected = await screen.findByRole("checkbox", { name: "Platform 8" });
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "US");
    expect(onUpdate.mock.calls[0][0]([8])).toEqual([8]);
    onUpdate.mockClear();

    for (const button of [selected, ...screen.getAllByRole("button")]) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(onUpdate).not.toHaveBeenCalled();

    view.rerender(
      <StreamingProviderSelector region="US" selectedProviderIds={[8]} onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Platform 8" }));
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "US");
    expect(onUpdate.mock.calls[0][0]([8, 119])).toEqual([119]);
  });

  it("keeps a saved platform that remains available beyond the display cutoff", async () => {
    answerRegions({
      CZ: [provider(999, 0)],
      US: [...commonProviders, provider(999, 99)],
    });
    const onUpdate = vi.fn();
    const view = render(
      <StreamingProviderSelector region="CZ" selectedProviderIds={[999]} onUpdate={onUpdate} />,
    );
    await screen.findByRole("checkbox", { name: "Platform 999" });

    view.rerender(
      <StreamingProviderSelector region="US" selectedProviderIds={[999]} onUpdate={onUpdate} />,
    );
    await screen.findByRole("checkbox", { name: "Platform 1000" });

    const selected = screen.getByRole("checkbox", { name: "Platform 999" });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(selected);
    expect(onUpdate.mock.lastCall?.[0]([999, 8])).toEqual([8]);
  });

  it("drops only saved platforms that are absent from the full new regional list", async () => {
    answerRegions({
      CZ: [provider(998, 0), provider(999, 1)],
      US: [...commonProviders, provider(999, 99)],
    });
    const onUpdate = vi.fn();
    const view = render(
      <StreamingProviderSelector region="CZ" selectedProviderIds={[998, 999]} onUpdate={onUpdate} />,
    );
    await screen.findByRole("checkbox", { name: "Platform 998" });
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "CZ");
    expect(onUpdate.mock.calls[0][0]([998, 999])).toEqual([998, 999]);
    onUpdate.mockClear();

    view.rerender(
      <StreamingProviderSelector region="US" selectedProviderIds={[998, 999]} onUpdate={onUpdate} />,
    );

    await waitFor(() => expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "US"));
    expect(onUpdate.mock.calls[0][0]([998, 999, 1001])).toEqual([999, 1001]);
    expect(screen.queryByRole("checkbox", { name: "Platform 998" })).toBeNull();
  });

  it("keeps the unselected offer bounded and selects only the displayed platforms", async () => {
    vi.mocked(tmdbFetchJson).mockResolvedValue({
      results: [...commonProviders, provider(999, 99)],
    });
    const onUpdate = vi.fn();
    render(
      <StreamingProviderSelector region="US" selectedProviderIds={[]} onUpdate={onUpdate} />,
    );
    await screen.findByRole("checkbox", { name: "Platform 1000" });

    expect(screen.getAllByRole("checkbox")).toHaveLength(30);
    expect(screen.queryByRole("checkbox", { name: "Platform 999" })).toBeNull();
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "US");
    expect(onUpdate.mock.calls[0][0]([])).toEqual([]);
    onUpdate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "US");
    expect(onUpdate.mock.calls[0][0]([])).toEqual(commonProviders.map((entry) => entry.provider_id));
  });

  it("offers and preserves a saved TV-only platform when the region changes", async () => {
    const hayu = { ...provider(223, 1), provider_name: "Hayu" };
    vi.mocked(tmdbFetchJson).mockImplementation(async (url) => ({
      results: url.includes("/tv?") ? [hayu] : [provider(8, 0)],
    }));
    const onUpdate = vi.fn();
    const view = render(
      <StreamingProviderSelector region="GB" selectedProviderIds={[223]} onUpdate={onUpdate} />,
    );
    await screen.findByRole("checkbox", { name: "Hayu" });

    view.rerender(
      <StreamingProviderSelector region="CZ" selectedProviderIds={[223]} onUpdate={onUpdate} />,
    );

    const selected = await screen.findByRole("checkbox", { name: "Hayu" });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    expect(tmdbFetchJson).toHaveBeenCalledWith(
      "https://api.themoviedb.org/3/watch/providers/tv?watch_region=CZ",
      86400,
    );
  });

  it.each(["movie", "tv"] as const)("preserves saved platforms when the new region's %s endpoint fails", async (failedType) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(tmdbFetchJson).mockImplementation(async (url) => {
      if (url.endsWith("watch_region=CZ")) {
        if (url.includes(`/${failedType}?`)) throw new Error("TMDB API error: 500");
        return { results: [provider(8, 0)] };
      }
      return { results: [provider(223, 1)] };
    });
    const onUpdate = vi.fn();
    const view = render(
      <StreamingProviderSelector region="GB" selectedProviderIds={[223]} onUpdate={onUpdate} />,
    );
    await screen.findByRole("checkbox", { name: "Platform 223" });
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "GB");
    expect(onUpdate.mock.calls[0][0]([223])).toEqual([223]);
    onUpdate.mockClear();

    view.rerender(
      <StreamingProviderSelector region="CZ" selectedProviderIds={[223]} onUpdate={onUpdate} />,
    );

    await screen.findByText("Failed to load streaming platforms");
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
