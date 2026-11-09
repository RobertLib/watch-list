// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getMoviePresets } from "@/lib/filter-presets";
import { FilterPresets } from "./FilterPresets";

/**
 * The quick-filter buttons, as a screen reader and a voice user meet them.
 *
 * Each carried an `aria-label` ("Apply Hidden Gems filter preset") that replaced
 * everything on it – the description was never read, and saying what the
 * button shows matched nothing – and its name was an `<h4>`, a heading inside a
 * button, which is invalid and announced as neither.
 */

const push = vi.fn();
let query = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/movies",
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("./AdvancedFiltersPanel", () => ({ AdvancedFiltersPanel: () => null }));

const presets = getMoviePresets("2026-11-09");

afterEach(() => {
  cleanup();
  push.mockReset();
  query = "";
});

describe("a quick filter", () => {
  it("is named by what it shows, and described by its description", () => {
    render(<FilterPresets type="movie" presets={presets} />);

    for (const preset of presets) {
      const button = screen.getByRole("button", { name: preset.name });
      expect(button.hasAttribute("aria-label")).toBe(false);
      const description = document.getElementById(button.getAttribute("aria-describedby")!);
      expect(description?.textContent).toBe(preset.description);
      expect(button.contains(description)).toBe(true);
    }
  });

  it("holds no heading", () => {
    render(<FilterPresets type="movie" presets={presets} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    }
  });

  it("says whether it is applied, and toggles", () => {
    query = `preset=${presets[1].id}`;
    render(<FilterPresets type="movie" presets={presets} />);

    const active = screen.getByRole("button", { name: presets[1].name });
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: presets[0].name }).getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(active);
    expect(push).toHaveBeenLastCalledWith("/movies", { scroll: false });
  });
});
