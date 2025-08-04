import type { NextConfig } from "next";

/**
 * The app is a static export: `next build` writes plain HTML, CSS and JS to
 * `out/`, and there is no server component of the deployment at all. Every page
 * is a Client Component that talks to TMDB from the browser, which is what makes
 * that possible – and what makes a crawl cost nothing but bandwidth.
 *
 * The trade this locks in: no dynamic routes, no route handlers, no redirects or
 * rewrites, and no image optimisation. Anything the TMDB catalogue names is
 * addressed by query string instead of by path (see `src/lib/routes.ts`).
 */
const nextConfig: NextConfig = {
  output: "export",
  images: {
    // No optimiser exists in a static export, so next/image serves TMDB URLs
    // as-is. `src/lib/tmdb-image.ts` therefore has to name the right size at the
    // call site: whatever it asks for is what the browser downloads.
    unoptimized: true,
  },
};

export default nextConfig;
