import { defineConfig, configDefaults } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  // Use the automatic JSX runtime (matches Next) so .tsx components render in
  // tests without importing React explicitly.
  esbuild: { jsx: "automatic" },
  define: {
    // Set UPDATE_GOLDENS=1 to (re)write golden PNGs instead of diffing against them.
    __UPDATE_GOLDENS__: JSON.stringify(process.env.UPDATE_GOLDENS === "1"),
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
