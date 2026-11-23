#!/usr/bin/env node
// Fails when any non-source locale has untranslated messages (ADR 0006: `en` is always complete).
// Run after `pnpm i18n:extract` so catalogs reflect the current source.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const localesDir = join(import.meta.dirname, "..", "web", "src", "locales");
const sourceLocale = "pt-BR";

let failures = 0;

for (const locale of readdirSync(localesDir)) {
  if (locale === sourceLocale) continue;

  const catalog = readFileSync(join(localesDir, locale, "messages.po"), "utf8");
  const entries = catalog.split(/\r?\n\r?\n/);
  const missing = entries
    .map((entry) => {
      const id = /^msgid "(.*)"$/m.exec(entry)?.[1];
      const translation = /^msgstr "(.*)"$/m.exec(entry)?.[1];
      return id && translation === "" ? id : undefined;
    })
    .filter(Boolean);

  if (missing.length > 0) {
    failures += missing.length;
    console.error(`✖ ${locale}: ${missing.length} untranslated message(s) in src/locales/${locale}/messages.po`);
    for (const id of missing) console.error(`    - "${id}"`);
  }
}

if (failures > 0) {
  console.error(`\nTranslate them (msgstr) and stage the catalog. Source locale: ${sourceLocale}.`);
  process.exit(1);
}
