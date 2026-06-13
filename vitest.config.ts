import { defineConfig, configDefaults } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    // Set UPDATE_GOLDENS=1 to (re)write golden PNGs instead of diffing against them.
    __UPDATE_GOLDENS__: JSON.stringify(process.env.UPDATE_GOLDENS === "1"),
    // Pixel goldens are machine-specific (font/AA rendering differs across OSes),
    // so skip the byte comparison in CI. GitHub Actions sets CI=true; locally the
    // full comparison still runs. SKIP_GOLDENS=1 forces it off manually.
    __SKIP_GOLDENS__: JSON.stringify(
      process.env.CI === "true" || process.env.SKIP_GOLDENS === "1",
    ),
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
