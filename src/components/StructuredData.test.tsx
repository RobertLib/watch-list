// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StructuredData } from "./StructuredData";
import { SITE_URL } from "@/lib/routes";
import { slugHash } from "@/lib/prerendered-titles";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function jsonLd(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.innerHTML ?? "null");
}

describe("TitleList", () => {
  it("lists each title's own page, in the page's order", () => {
    // Fight Club has a prerendered page under this slug; Heat has none.
    vi.stubEnv("PRERENDERED_TITLE_IDS", `${(550).toString(36)}${slugHash("fight-club-550")}||`);

    const { container } = render(
      <StructuredData
        type="TitleList"
        data={{
          name: "Drama Movies",
          url: `${SITE_URL}/genres/movie/drama-18`,
          titles: [
            { id: 550, title: "Fight Club", mediaType: "movie" },
            { id: 949, title: "Heat", mediaType: "movie" },
          ],
        }}
      />,
    );

    expect(jsonLd(container)).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Drama Movies",
      url: `${SITE_URL}/genres/movie/drama-18`,
      numberOfItems: 2,
      // Position and URL only: the summary-page shape, where each film's own
      // markup lives on the page the URL names.
      itemListElement: [
        { "@type": "ListItem", position: 1, url: `${SITE_URL}/movie/fight-club-550` },
        { "@type": "ListItem", position: 2, url: `${SITE_URL}/movie?id=heat-949` },
      ],
    });
  });

  it("addresses a series as a series", () => {
    const { container } = render(
      <StructuredData
        type="TitleList"
        data={{
          name: "Comedy TV Shows",
          url: `${SITE_URL}/genres/tv/comedy-35`,
          titles: [{ id: 1396, title: "Breaking Bad", mediaType: "tv" }],
        }}
      />,
    );

    expect(jsonLd(container).itemListElement[0].url).toBe(
      `${SITE_URL}/tv?id=breaking-bad-1396`,
    );
  });
});
