import type { NextConfig } from "next";
import { encodePrerenderedTitles } from "./src/lib/prerendered-titles";
import { prerenderedTitles } from "./src/lib/prerendered-titles-server";

/**
 * The titles `scripts/prebuild.mjs` chose to prerender, as the compact id and
 * slug-hash list the bundle carries (`src/lib/prerendered-titles.ts`). Read
 * through `prerenderedTitles`, the same function `generateStaticParams` and the
 * sitemap use, so the slugs hashed here are the slugs the pages are written
 * under.
 *
 * Empty when there is no list – a build without a TMDB token, or a `next build`
 * run without `npm run build`'s prebuild – and then every title link stays on
 * its query-string page. `next dev` reads whatever list the last
 * `npm run build` left in `.next/cache`, if any; the server and the browser
 * read the same one, so the links still agree with each other.
 */
function prerenderedTitleIds(): string {
  return encodePrerenderedTitles({
    movie: prerenderedTitles("movie"),
    tv: prerenderedTitles("tv"),
    person: prerenderedTitles("person"),
  });
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
