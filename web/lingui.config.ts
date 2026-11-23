import { defineConfig } from "@lingui/conf";

/** pt-BR is the source and default locale; en is always kept complete (ADR 0006). */
export default defineConfig({
  sourceLocale: "pt-BR",
  locales: ["pt-BR", "en"],
  fallbackLocales: { default: "pt-BR" },
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      exclude: ["**/node_modules/**", "<rootDir>/src/lib/api/gen/**"],
    },
  ],
});
