import path from "node:path";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Two projects (ADR 0005):
 * - `unit`: `*.test.ts`, plain logic in Node.
 * - `browser`: `*.test.tsx`, components and routes rendered in headless Chromium with the app's Vite plugins
 *   (Lingui macros, React Compiler, router) and the API mocked by MSW (`src/test/setup.ts`).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    projects: [
      {
        extends: "./vite.config.ts",
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: "./vite.config.ts",
        // MSW's service worker is served only to tests, so it never ships in the production build.
        publicDir: "src/test/public",
        // Pre-bundled up front: discovering them mid-run makes Vite reload the page and fail the test in flight.
        // Add a `@base-ui/react/*` module here when a new UI primitive imports it.
        optimizeDeps: {
          include: [
            "sonner",
            "@base-ui/react/alert-dialog",
            "@base-ui/react/button",
            "@base-ui/react/checkbox",
            "@base-ui/react/dialog",
            "@base-ui/react/input",
            "@base-ui/react/menu",
            "@base-ui/react/merge-props",
            "@base-ui/react/select",
            "@base-ui/react/separator",
            "@base-ui/react/tooltip",
            "@base-ui/react/use-render",
          ],
        },
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            // Desktop size, so layouts render their desktop form (the sidebar, not its mobile drawer).
            viewport: { width: 1280, height: 800 },
          },
        },
      },
    ],
  },
});
