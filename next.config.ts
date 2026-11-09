import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { encodePrerenderedIds } from "./src/lib/prerendered-titles";

/**
 * The titles `scripts/prebuild.mjs` chose to prerender, as the compact id list
 * the bundle carries (`src/lib/prerendered-titles.ts`). Empty when there is no
 * list – `next dev`, a build without a TMDB token, or `next build` run without
 * `npm run build` – and then every title link stays on its query-string page.
 */
function prerenderedTitleIds(): string {
  try {
    const list = JSON.parse(
      readFileSync(".next/cache/prerendered-titles.json", "utf8"),
    ) as Record<"movie" | "tv" | "person", { id: number }[]>;
    return encodePrerenderedIds({
      movie: list.movie.map((title) => title.id),
      tv: list.tv.map((title) => title.id),
      person: list.person.map((title) => title.id),
    });
  } catch {
    return "";
  }
}

/**
 * The app is a static export: `next build` writes plain HTML, CSS and JS to
 * `out/`, and there is no server component of the deployment at all. Every page
 * renders a Client Component that talks to TMDB from the browser, which is what
 * makes that possible – and what makes a crawl cost nothing but bandwidth.
 *
 * The trade this locks in: no request-time rendering, no route handlers that
 * read the request, no redirects or rewrites, and no image optimisation. Dynamic
 * routes do work, but only for parameters `generateStaticParams` lists at build
 * time (with `dynamicParams = false`) – which is how the genres, the genre
 * landings per platform, the moods and the best-known titles and people get a
 * path and an HTML file each, with a build-time snapshot of their content in
 * it. What the build cannot list – the rest of TMDB's catalogue – is addressed
 * by query string instead (see `src/lib/routes.ts`).
 */
const nextConfig: NextConfig = {
  output: "export",
  env: {
    PRERENDERED_TITLE_IDS: prerenderedTitleIds(),
  },
  images: {
    // No optimiser exists in a static export, so next/image serves TMDB URLs
    // as-is. `src/lib/tmdb-image.ts` therefore has to name the right size at the
    // call site: whatever it asks for is what the browser downloads.
    unoptimized: true,
  },
};

export default nextConfig;
