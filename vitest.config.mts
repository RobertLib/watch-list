import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // JSX has to be compiled before a `.test.tsx` file can run at all, and
  // `next build` is what does that everywhere else in this project – nothing in
  // a bare vitest run knows about the `react-jsx` transform `tsconfig.json`
  // names.
  plugins: [react()],
  test: {
    // Node stays the default: the great majority of the suite is pure functions
    // over dates, storage shapes and scoring, and those run measurably faster
    // without a DOM standing behind them. The files that need one opt in with a
    // `@vitest-environment jsdom` docblock on their first line, so the cost is
    // paid only where it buys something.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": fromRoot("./src"),
    },
  },
});
