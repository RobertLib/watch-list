import { webManifest } from "@/lib/web-manifest";

/** The Czech site's manifest – see `app/(en)/manifest.webmanifest/route.ts`. */
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(webManifest("cs")), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
