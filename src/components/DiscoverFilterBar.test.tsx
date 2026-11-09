// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiscoverFilterBar } from "./DiscoverFilterBar";
import { tmdbFetchJson } from "@/lib/tmdb-cache";
import { MAX_PROVIDERS_SHOWN, type StreamingProvider } from "@/lib/streaming-providers";
import { setRegion, setSelectedProviderIds, setWatchProviderFilter, subscribeSettings } from "@/lib/settings";
import { ANY_PROVIDERS, MY_PROVIDERS } from "@/lib/watch-provider-settings";

const push = vi.hoisted(() => vi.fn());
const location = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/movies",
  useSearchParams: () => new URLSearchParams(location.query),
  useRouter: () => ({ push }),
}));

// Keep the real regional loader and hook so the catalogue's display cutoff is
// exercised all the way through to the available filter choices.
vi.mock("@/lib/tmdb-cache", () => ({
  TMDB_CONFIG: { BASE_URL: "https://api.themoviedb.org/3" },
  TTL: { DAY: 86400 },
  tmdbFetchJson: vi.fn(),
}));

function resetSettings() {
  window.localStorage.clear();
  const unsubscribe = subscribeSettings(() => {});
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  unsubscribe();
}

beforeEach(() => {
  resetSettings();
  location.query = "";
  push.mockReset();
  vi.mocked(tmdbFetchJson).mockReset();
});

afterEach(() => {
  cleanup();
  resetSettings();
});

describe("saved platform discovery filters", () => {
  it.each(["movie", "tv"] as const)("offers the regional %s catalogue with only the matching saved platforms", async (mediaType) => {
    const netflix: StreamingProvider = {
      provider_id: 8, provider_name: "Netflix", logo_path: "", display_priority: 0,
    };
    const hayu: StreamingProvider = {
      provider_id: 223, provider_name: "Hayu", logo_path: "", display_priority: 1,
    };
    vi.mocked(tmdbFetchJson).mockImplementation(async (url) => ({
      results: url.includes("/tv?") ? [hayu] : [netflix],
    }));
    setRegion("CZ");
    setSelectedProviderIds([8, 223]);

    render(<DiscoverFilterBar type={mediaType} genres={[]} />);

    await screen.findByRole("option", { name: "My Platforms (1)" });
    expect(screen.getByRole("option", { name: mediaType === "tv" ? "Hayu" : "Netflix" })).toBeDefined();
    expect(screen.queryByRole("option", { name: mediaType === "tv" ? "Netflix" : "Hayu" })).toBeNull();
    expect(tmdbFetchJson).toHaveBeenCalledExactlyOnceWith(
      `https://api.themoviedb.org/3/watch/providers/${mediaType}?watch_region=CZ`,
      86400,
    );
  });

  it("offers Any Platform as an explicit override and keeps it in subsequent filter changes", async () => {
    vi.mocked(tmdbFetchJson).mockResolvedValue({ results: [{
      provider_id: 8,
      provider_name: "Netflix",
      logo_path: "",
      display_priority: 1,
    }] });
    setSelectedProviderIds([8]);
    setWatchProviderFilter("streaming-only");
    const { rerender } = render(<DiscoverFilterBar type="movie" genres={[]} />);
    await screen.findByRole("option", { name: "My Platforms (1)" });
    const select = screen.getByRole("combobox", { name: "Filter by streaming platform" });
    expect((select as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("option", { name: "Use profile setting" })).toBeDefined();

    fireEvent.change(select, { target: { value: ANY_PROVIDERS } });
    expect(push).toHaveBeenLastCalledWith(`/movies?provider=${ANY_PROVIDERS}`, { scroll: false });

    location.query = `provider=${ANY_PROVIDERS}`;
    rerender(<DiscoverFilterBar type="movie" genres={[]} />);
    expect((select as HTMLSelectElement).value).toBe(ANY_PROVIDERS);
    expect(screen.queryByRole("option", { name: "Platform #any" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by release year" }), {
      target: { value: "1999" },
    });
    expect(push).toHaveBeenLastCalledWith(`/movies?year=1999&provider=${ANY_PROVIDERS}`, { scroll: false });

    fireEvent.click(screen.getByRole("button", { name: /Platform: Any platform/ }));
    expect(push).toHaveBeenLastCalledWith("/movies", { scroll: false });
  });

  it("offers the saved platform and My Platforms when the only saved provider is past the cutoff", async () => {
    const catalogue: StreamingProvider[] = Array.from(
      { length: MAX_PROVIDERS_SHOWN + 1 },
      (_, index) => ({
        provider_id: 1000 + index,
        provider_name: `Platform ${index + 1}`,
        logo_path: "",
        display_priority: index,
      }),
    );
    const saved = catalogue[MAX_PROVIDERS_SHOWN];
    vi.mocked(tmdbFetchJson).mockResolvedValue({ results: catalogue });
    setRegion("US");
    setSelectedProviderIds([saved.provider_id]);

    render(<DiscoverFilterBar type="movie" genres={[]} />);

    await screen.findByRole("option", { name: "My Platforms (1)" });
    expect(screen.getAllByRole("option", { name: saved.provider_name })).toHaveLength(1);
    const select = screen.getByRole("combobox", { name: "Filter by streaming platform" });

    fireEvent.change(select, { target: { value: MY_PROVIDERS } });
    expect(push).toHaveBeenLastCalledWith(
      `/movies?provider=${MY_PROVIDERS}`,
      { scroll: false },
    );

    fireEvent.change(select, { target: { value: String(saved.provider_id) } });
    expect(push).toHaveBeenLastCalledWith(
      `/movies?provider=${saved.provider_id}`,
      { scroll: false },
    );
  });
});

// The bar's own transition ends when the URL changes – before the listing has
// even asked for the new results – so the listing tells it when they are still
// on their way. The count's live region has to stay mounted throughout: one
// that appears with its text in it announces nothing.
describe("result count while the listing reloads", () => {
  it("says the results are updating until the listing has them", () => {
    vi.mocked(tmdbFetchJson).mockResolvedValue({ results: [] });
    const { rerender } = render(
      <DiscoverFilterBar type="movie" genres={[]} totalResults={120} />,
    );
    const status = screen.getByText("120 movies");

    rerender(<DiscoverFilterBar type="movie" genres={[]} resultsPending />);
    expect(status.textContent).toBe("Updating results…");
    expect(status.isConnected).toBe(true);
    expect(status.getAttribute("aria-live")).toBe("polite");

    rerender(<DiscoverFilterBar type="movie" genres={[]} totalResults={7} />);
    expect(status.textContent).toBe("7 movies");
    expect(status.isConnected).toBe(true);
  });

  it("shows no count at all for a listing that does not report one", () => {
    vi.mocked(tmdbFetchJson).mockResolvedValue({ results: [] });
    render(<DiscoverFilterBar type="movie" genres={[]} />);

    expect(screen.queryByText("Updating results…")).toBeNull();
  });
});
