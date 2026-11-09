import { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/routes";

// A static export has no runtime, so this file is written once at build time.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing is disallowed, and the personal pages – /profile, /watchlist,
        // /stats and the rest – are deliberately not listed here. They are
        // personal rather than secret, and they keep themselves out of the index
        // with `noindex` instead (see `pageMetadata`). That is the stronger of
        // the two: a Disallow would stop a crawler fetching the page, and a page
        // it never fetches is a page whose noindex it never reads – which is how
        // a disallowed URL still ends up listed, on anchor text alone.
        disallow: [],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
