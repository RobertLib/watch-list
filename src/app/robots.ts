import { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/routes";

// A static export has no runtime, so this file is written once at build time.
export const dynamic = "force-static";

/**
 * Backlink and SEO-audit crawlers, turned away from the whole site.
 *
 * They index the web for their own subscribers, not for anyone searching, so
 * they send no visitors – and they are not a small share of the traffic: on the
 * previous host, AhrefsBot alone was a third of all requests on a day the site
 * served about 36,000. GitHub Pages does not charge by the request, but every
 * page they fetch is still bandwidth against its monthly allowance, spent on
 * nobody. All of these honour robots.txt; search engines and everything else
 * stay under the `*` group below.
 */
const SEO_CRAWLERS = [
  "AhrefsBot",
  "AhrefsSiteAudit",
  "SemrushBot",
  "SiteAuditBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "Barkrowler",
  "serpstatbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: SEO_CRAWLERS, disallow: "/" },
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
