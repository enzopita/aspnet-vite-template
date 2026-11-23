import path from "node:path";

import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Under Aspire the API address is injected; standalone `pnpm dev` falls back to the API's launch profile.
const apiTarget =
  process.env.API_HTTPS ??
  process.env.API_HTTP ??
  process.env.services__api__https__0 ??
  process.env.services__api__http__0 ??
  "https://localhost:7180";

export default defineConfig({
  plugins: [
    // Must come before react(): it generates the typed route tree from src/routes.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/app/route-tree.gen.ts",
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    lingui({ macroTransform: true }),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    // Same-origin in development too, exactly like production (cookie auth, no CORS).
    proxy: {
      "/api": { target: apiTarget, secure: false },
      "/openapi": { target: apiTarget, secure: false },
    },
  },
  build: {
    target: "es2024",
    sourcemap: true,
  },
});
