// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WhereToWatch } from "./WhereToWatch";
import type { RegionWatchProviders } from "@/types/tmdb";

vi.mock("@/lib/tmdb", async () => ({
  tmdbApi: { getImageUrl: (await import("@/lib/tmdb-image")).getImageUrl },
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

const netflix = { provider_id: 8, provider_name: "Netflix", logo_path: "/n.jpg", display_priority: 1 };
const apple = { provider_id: 2, provider_name: "Apple TV Store", logo_path: "/a.jpg", display_priority: 2 };

function providers(parts: Partial<RegionWatchProviders> = {}): RegionWatchProviders {
  return { streaming: [], rent: [], buy: [], ...parts };
}

describe("WhereToWatch", () => {
  // The page's title ends "– Where to Watch", so the section that answers it
  // is a second-level heading that says which title, not a sidebar `h3`.
  it("heads the section with the title it is about", () => {
    render(
      <WhereToWatch
        title="Interstellar"
        providers={providers({ streaming: [netflix] })}
        regionName="Canada"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Where to watch Interstellar" }),
    ).toBeTruthy();
  });

  it("answers in a sentence before listing the services", () => {
    render(
      <WhereToWatch
        title="Interstellar"
        providers={providers({ streaming: [netflix], rent: [apple] })}
        regionName="Canada"
      />,
    );

    expect(
      screen.getByText(
        "Interstellar is streaming on Netflix. You can also rent it on Apple TV Store.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Streaming" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Rent" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Buy" })).toBeNull();
  });

  it("names the region and the day the providers were read", () => {
    render(
      <WhereToWatch
        title="Interstellar"
        providers={providers({ streaming: [netflix] })}
        regionName="Canada"
        checkedOn="2026-11-13"
      />,
    );

    expect(screen.getByText(/Region: Canada/).textContent).toBe(
      "Region: Canada · Checked November 13, 2026",
    );
  });

  // Before hydration the browser's day is not known; the line must not print
  // an empty date in the meantime.
  it("leaves the day out until there is one", () => {
    render(
      <WhereToWatch
        title="Interstellar"
        providers={providers({ streaming: [netflix] })}
        regionName="Canada"
        checkedOn=""
      />,
    );

    expect(screen.getByText(/Region: Canada/).textContent).toBe("Region: Canada");
  });

  // The section used to disappear for a title with no providers – on a page
  // whose title promises to say where to watch it.
  it("still answers for a title that is not available anywhere", () => {
    render(<WhereToWatch title="Heat" providers={providers()} regionName="Canada" />);

    expect(
      screen.getByText("Heat is not available to stream, rent or buy here right now."),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  // The build's snapshot knows one region. For a visitor in another, saying
  // "not available here" before their own providers load would be a claim
  // nothing supports – and it would stay on screen if that load failed.
  it("says it is still checking when the region's providers are not known", () => {
    render(
      <WhereToWatch title="Heat" providers={null} regionName="Czech Republic" checkedOn="2026-11-13" />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Where to watch Heat" })).toBeTruthy();
    expect(screen.getByText("Checking where it is available in your region…")).toBeTruthy();
    expect(screen.queryByText(/not available/)).toBeNull();
    // No date either: nothing was checked for this region.
    expect(screen.getByText(/Region: Czech Republic/).textContent).toBe("Region: Czech Republic");
  });
});
