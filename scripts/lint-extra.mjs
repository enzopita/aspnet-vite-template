#!/usr/bin/env node
// Residual code rules that cannot yet live cleanly in Oxlint or .NET analyzers (Step 2).
// Every rule states when it can be retired (`// remover quando: ...`).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GENERATED, MIGRATIONS, matchesAny, repoRoot, toRepoPath } from "./agents/lib.mjs";

const WEB_GENERATED = [...GENERATED, "web/dist/**", "web/src/test/public/**", "web/src/locales/**"];
const WEB_STYLES = "web/src/styles/**";
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";

/** Replace `<Trans ...>...</Trans>` spans with spaces while preserving line breaks so line numbers stay accurate. */
function stripTransElements(content) {
  return content.replace(/<Trans\b[^>]*>[\s\S]*?<\/Trans>/g, (match) => match.replace(/[^\n]/g, " "));
}

/** @type {{ id: string, files: string[], except?: string[], re: RegExp, level: "error" | "warning", message: string, preprocess?: (content: string) => string }[]} */
export const RULES = [
  // remover quando: o Oxlint ganhar noInlineConfig
  {
    id: "no-oxlint-disable",
    files: ["web/**/*.ts", "web/**/*.tsx", "web/**/*.mjs"],
    except: WEB_GENERATED,
    re: /\boxlint-disable\b/,
    level: "error",
    message: "lint check suppressed via oxlint-disable — fix the underlying issue",
  },
  // remover quando: existir regra Oxlint que os cubra
  {
    id: "no-conditional-test-skip",
    files: ["web/**/*.ts", "web/**/*.tsx"],
    except: WEB_GENERATED,
    re: /\b(it|test|describe)\.(skipIf|runIf)\s*\(/,
    level: "error",
    message: "conditionally skipped/guarded test via skipIf/runIf — fix or remove the test",
  },
  // remover quando: o better-tailwindcss rodar estável via JS plugins
  {
    id: "no-raw-tailwind-palette",
    files: ["web/src/**/*.ts", "web/src/**/*.tsx", "web/src/**/*.css"],
    except: [WEB_STYLES, ...WEB_GENERATED],
    re: new RegExp(
      `\\b(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|shadow|accent|caret|decoration)-(${PALETTE})(-\\d{2,3})?(\\/\\d+)?\\b`,
    ),
    level: "error",
    message: "raw palette color — use semantic design tokens (bg-surface, text-positive…)",
  },
  // remover quando: o better-tailwindcss rodar estável via JS plugins
  {
    id: "no-arbitrary-color",
    files: ["web/src/**/*.ts", "web/src/**/*.tsx", "web/src/**/*.css"],
    except: [WEB_STYLES, ...WEB_GENERATED],
    re: /-\[(#|rgb|hsl|oklch)|(["'`\s(:])#[0-9a-fA-F]{3,8}\b(?!-)/,
    level: "error",
    message: "raw color value — use semantic design tokens",
  },
  // remover quando: o better-tailwindcss rodar estável via JS plugins
  {
    id: "no-magic-duration",
    files: ["web/src/**/*.ts", "web/src/**/*.tsx", "web/src/**/*.css"],
    except: [WEB_STYLES, ...WEB_GENERATED],
    re: /\b(duration|delay)-(\d+|\[)/,
    level: "error",
    message: "magic duration/delay — use motion tokens",
  },
  // remover quando: o eslint-plugin-lingui rodar estável via JS plugins
  {
    id: "literal-ui-text",
    files: ["web/src/**/*.tsx"],
    except: ["web/src/**/*.test.tsx", ...WEB_GENERATED],
    preprocess: stripTransElements,
    re: />\s*[A-Za-z][A-Za-z ,.'!?:-]{3,}\s*</,
    level: "warning",
    message: "literal UI text? wrap it in <Trans>",
  },
  // remover quando: linter nativo de comentários de pendência entrar na cadeia
  {
    id: "unfinished-work-marker",
    files: ["web/src/**/*.ts", "web/src/**/*.tsx", "web/src/**/*.css", "src/**/*.cs"],
    except: ["web/src/**/*.test.ts", "web/src/**/*.test.tsx", ...WEB_GENERATED, MIGRATIONS, "src/**/obj/**", "src/**/bin/**"],
    re: /\b(TODO|FIXME|HACK|XXX)\b/,
    level: "warning",
    message: "unfinished-work marker",
  },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "bin", "obj", "dist"]);
const RELEVANT_EXTS = /\.(ts|tsx|mjs|css|cs)$/i;

function walk(root, relDir, out) {
  const fullDir = relDir ? resolve(root, relDir) : root;
  if (!existsSync(fullDir)) return;
  for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(root, relPath, out);
    } else if (entry.isFile() && RELEVANT_EXTS.test(entry.name)) {
      out.push(relPath);
    }
  }
}

export function collectDefaultFiles(root) {
  const out = [];
  walk(root, "web", out);
  walk(root, "src", out);
  return out;
}

export function checkFiles(root, files) {
  const errors = [];
  const warnings = [];
  const list = files?.length ? files : collectDefaultFiles(root);

  for (const relPath of list) {
    const fileRules = RULES.filter(
      (r) => matchesAny(relPath, r.files) && !(r.except && matchesAny(relPath, r.except)),
    );
    if (!fileRules.length) continue;

    const abs = resolve(root, relPath);
    if (!existsSync(abs)) continue;
    const raw = readFileSync(abs, "utf8");

    for (const rule of fileRules) {
      const text = rule.preprocess ? rule.preprocess(raw) : raw;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (rule.re.test(lines[i])) {
          const finding = `${relPath}:${i + 1}: [${rule.id}] ${rule.message}  ⟶  ${lines[i].trim().slice(0, 100)}`;
          (rule.level === "error" ? errors : warnings).push(finding);
        }
      }
    }
  }

  return { errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  const denyWarnings = args.includes("--deny-warnings");
  const fileArgs = args.filter((a) => !a.startsWith("-"));
  const root = repoRoot();

  const files = fileArgs.length
    ? fileArgs.map((p) => toRepoPath(root, resolve(process.cwd(), p))).filter(Boolean)
    : collectDefaultFiles(root);

  const { errors, warnings } = checkFiles(root, files);
  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✖ ${e}`);

  if (errors.length > 0 || (denyWarnings && warnings.length > 0)) return 1;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`✖ lint-extra: ${e.message}`);
    process.exitCode = 1;
  }
}
