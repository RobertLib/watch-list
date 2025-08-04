import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // In a static export every prefetch is a HEAD on the page plus its
    // `__next._tree.txt`, and query-addressed hrefs (`/person?id=…`) never share
    // a cache entry – a cast list of twenty actors was forty CDN requests before
    // anyone clicked. Prefetching buys nothing here either: the payload is the
    // route's empty shell, and the data comes from TMDB after navigation anyway.
    // So every Link has to say what it wants, and the answer is almost always
    // `prefetch={false}`.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXOpeningElement[name.name="Link"]:not(:has(JSXAttribute[name.name="prefetch"]))',
          message:
            "Set prefetch on every <Link>: each prefetch costs CDN requests (see eslint.config.mjs).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
