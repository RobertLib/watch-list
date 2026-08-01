import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // The `server-only` package throws unless it is resolved by a bundler that
      // understands React Server Components. The modules under test are pure
      // functions that merely sit in the same file as server code, so the guard
      // is stubbed out here rather than the code being restructured around it.
      "server-only": fromRoot("./src/test/server-only-stub.ts"),
    },
  },
});
