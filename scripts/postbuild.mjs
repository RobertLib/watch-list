/**
 * Run by npm after every `npm run build` (the `postbuild` script).
 *
 * Fails the build when `out/` is close to GitHub Pages' limit of 1 GB for a
 * published site. Nearly all of it is the prerendered title pages, whose number
 * `scripts/prebuild.mjs` sets – and a site that grew past the limit would build,
 * pass, and then be refused at deploy time, with the reason buried in the
 * Pages action's log. Here it is one line, with the size and what to change.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LIMIT_BYTES = 900 * 1024 * 1024;
const out = fileURLToPath(new URL("../out", import.meta.url));

function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(path) : statSync(path).size;
  }
  return total;
}

const bytes = sizeOf(out);
const mb = (n) => `${Math.round(n / 1024 / 1024)} MB`;

if (bytes > LIMIT_BYTES) {
  console.error(
    `postbuild: out/ is ${mb(bytes)}, past the ${mb(LIMIT_BYTES)} this build allows itself under GitHub Pages' 1 GB. ` +
      "Prerender fewer titles (LIMITS in scripts/prebuild.mjs) or cut their snapshots (src/lib/title-details.ts).",
  );
  process.exit(1);
}

console.log(`postbuild: out/ is ${mb(bytes)}.`);
