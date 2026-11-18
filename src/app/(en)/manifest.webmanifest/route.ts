import { webManifest } from "@/lib/web-manifest";

/**
 * The English site's web app manifest. A route rather than `app/manifest.ts`:
 * that file convention puts one manifest on every page of both trees, and the
 * Czech tree needs its own (`app/cs/manifest.webmanifest`) so installing it
 * from a Czech page opens the Czech site. Each root layout links its own.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(webManifest("en")), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
