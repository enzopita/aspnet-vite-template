// Tests for scripts/lint-extra.mjs and Oxlint negative fixtures (Step 2). Run: node --test scripts/lint-extra.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { RULES, checkFiles } from "./lint-extra.mjs";

const repo = resolve(import.meta.dirname, "..");

function put(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe("lint-extra rules", () => {
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "app-lint-extra-"));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("every rule states when it can be removed", () => {
    const source = readFileSync(join(repo, "scripts", "lint-extra.mjs"), "utf8");
    const markers = source.match(/^\s*\/\/ remover quando:/gm) ?? [];
    assert.equal(markers.length, RULES.length);
  });

  test("flags oxlint-disable in web code and skips mockServiceWorker", () => {
    put(dir, "web/src/a.ts", "// oxlint-" + "disable-next-line no-explicit-any\nexport const x = 1;\n");
    put(dir, "web/src/test/public/mockServiceWorker.js", "// oxlint-" + "disable\n");
    const res = checkFiles(dir, ["web/src/a.ts", "web/src/test/public/mockServiceWorker.js"]);
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /no-oxlint-disable/);
  });

  test("flags vitest skipIf and runIf", () => {
    put(dir, "web/src/a.test.ts", 'it.skipIf(true)("x", () => {});\ndescribe.runIf(false)("y", () => {});\n');
    const res = checkFiles(dir, ["web/src/a.test.ts"]);
    assert.equal(res.errors.length, 2);
    for (const e of res.errors) assert.match(e, /no-conditional-test-skip/);
  });

  test("flags raw Tailwind palette classes outside styles/", () => {
    put(dir, "web/src/a.tsx", 'export const A = () => <div className="bg-red-500 text-slate-900" />;\n');
    put(dir, "web/src/styles/tokens.css", ".ok { @apply bg-slate-900; }\n");
    const res = checkFiles(dir, ["web/src/a.tsx", "web/src/styles/tokens.css"]);
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /no-raw-tailwind-palette/);
  });

  test("flags arbitrary colors outside styles/", () => {
    put(dir, "web/src/colors.tsx", 'export const C = () => <div className="bg-[#ff00ff] border-[rgb(1,2,3)]" />;\n');
    put(dir, "web/src/tokens-hex.ts", 'export const hex = "#fff000";\n');
    put(dir, "web/src/radius.tsx", 'export const R = () => <div className="rounded-[var(--radius)]" />;\n');
    put(dir, "web/src/styles/palette.css", ":root { --x: #123456; }\n");
    const res = checkFiles(dir, [
      "web/src/colors.tsx",
      "web/src/tokens-hex.ts",
      "web/src/radius.tsx",
      "web/src/styles/palette.css",
    ]);
    assert.equal(res.errors.length, 2);
    for (const e of res.errors) assert.match(e, /no-arbitrary-color/);
  });

  test("flags magic duration and delay tokens outside styles/", () => {
    put(dir, "web/src/motion.tsx", 'export const M = () => <div className="duration-300 delay-[150ms]" />;\n');
    put(dir, "web/src/motion-ok.tsx", 'export const Ok = () => <div className="duration-fast" />;\n');
    put(dir, "web/src/styles/motion.css", ".a { @apply duration-300; }\n");
    const res = checkFiles(dir, ["web/src/motion.tsx", "web/src/motion-ok.tsx", "web/src/styles/motion.css"]);
    assert.equal(res.errors.length, 1);
    assert.match(res.errors[0], /no-magic-duration/);
  });

  test("warns on literal UI text while allowing Trans and test files", () => {
    put(
      dir,
      "web/src/ui.tsx",
      [
        'export const Bad = () => <span>Save changes</span>;',
        'export const Good = () => <Trans>Salvar</Trans>;',
        'export const Multi = () => (',
        '  <Trans id="k">',
        "    Save changes",
        "  </Trans>",
        ");",
      ].join("\n"),
    );
    put(dir, "web/src/ui.test.tsx", 'export const Test = () => <span>Fixture label</span>;\n');
    const res = checkFiles(dir, ["web/src/ui.tsx", "web/src/ui.test.tsx"]);
    assert.equal(res.errors.length, 0);
    assert.equal(res.warnings.length, 1);
    assert.match(res.warnings[0], /ui\.tsx:1:.*literal-ui-text/);
  });

  test("warns on TODO/FIXME/HACK/XXX markers in non-test source files", () => {
    put(dir, "web/src/todo.ts", "// TO" + "DO: replace stub\n");
    put(dir, "src/App.Api/Todo.cs", "// FIX" + "ME: check null\n");
    put(dir, "web/src/todo.test.ts", "// TO" + "DO: test note\n");
    const res = checkFiles(dir, ["web/src/todo.ts", "src/App.Api/Todo.cs", "web/src/todo.test.ts"]);
    assert.equal(res.errors.length, 0);
    assert.equal(res.warnings.length, 2);
    for (const w of res.warnings) assert.match(w, /unfinished-work-marker/);
  });

  test("CLI fails with --deny-warnings when warnings exist", () => {
    const cliDir = mkdtempSync(join(tmpdir(), "app-lint-cli-"));
    try {
      execGitInit(cliDir);
      put(cliDir, "web/src/bad.tsx", "export const Bad = () => <span>Unlocalized text</span>;\n");
      const warnOk = spawnSync(process.execPath, [join(repo, "scripts", "lint-extra.mjs"), "web/src/bad.tsx"], {
        cwd: cliDir,
        encoding: "utf8",
      });
      assert.equal(warnOk.status, 0);
      assert.match(warnOk.stderr + warnOk.stdout, /literal-ui-text/);

      const denied = spawnSync(
        process.execPath,
        [join(repo, "scripts", "lint-extra.mjs"), "--deny-warnings", "web/src/bad.tsx"],
        { cwd: cliDir, encoding: "utf8" },
      );
      assert.notEqual(denied.status, 0);
    } finally {
      rmSync(cliDir, { recursive: true, force: true });
    }
  });
});

function execGitInit(cwd) {
  const r = spawnSync("git", ["init", "-q"], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git init failed: ${r.stderr}`);
}

describe("oxlint negative fixtures", () => {
  const oxlintEntry = join(repo, "web", "node_modules", "oxlint", "bin", "oxlint");
  const binDir = join(repo, "web", "node_modules", ".bin");
  let dir;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "app-oxlint-"));
    copyFileSync(join(repo, "web", ".oxlintrc.json"), join(dir, ".oxlintrc.json"));
    put(
      dir,
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2024",
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            strict: true,
            paths: { "@/*": ["./src/*"] },
          },
          include: ["src"],
        },
        null,
        2,
      ),
    );
    put(dir, "src/features/other/internal.ts", "export const secret = 1;\n");
    put(
      dir,
      "node_modules/vitest/index.d.ts",
      [
        "export interface TestFn {",
        "  (name: string, fn: () => void): void;",
        "  only: (name: string, fn: () => void) => void;",
        "  skip: (name: string, fn: () => void) => void;",
        "  todo: (name: string) => void;",
        "}",
        "export declare const it: TestFn;",
        "export declare const xit: (name: string, fn: () => void) => void;",
      ].join("\n"),
    );
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function runOxlint(relPath, content) {
    put(dir, relPath, content);
    try {
      return spawnSync(
        process.execPath,
        [
          oxlintEntry,
          "--type-aware",
          "--config",
          join(dir, ".oxlintrc.json"),
          "--tsconfig",
          join(dir, "tsconfig.json"),
          join(dir, relPath),
        ],
        {
          cwd: dir,
          encoding: "utf8",
          env: { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` },
        },
      );
    } finally {
      rmSync(join(dir, relPath), { force: true });
    }
  }

  const failures = [
    ["ts-ignore", "src/ban-ignore.ts", "// @ts-" + "ignore\nexport const a: number = 1;\n"],
    ["ts-nocheck", "src/ban-nocheck.ts", "// @ts-" + "nocheck\nexport const b = 1;\n"],
    ["ts-expect-error", "src/ban-expect.ts", "// @ts-" + "expect-error reason\nexport const c: number = 'x';\n"],
    ["explicit any type", "src/explicit-any.ts", "export function f(x: any): number {\n  return Number(x);\n}\n"],
    ["as any cast", "src/as-any.ts", "export const v = ('x' as any) as number;\n"],
    ["unsafe double cast", "src/double-cast.ts", "export const n = ('x' as unknown) as number;\n"],
    [
      "vitest it.only",
      "src/focused.test.ts",
      'import { it } from "vitest";\nit.only("x", () => {});\n',
    ],
    [
      "vitest it.skip",
      "src/skipped.test.ts",
      'import { it } from "vitest";\nit.skip("x", () => {});\n',
    ],
    [
      "vitest xit",
      "src/xit.test.ts",
      'import { xit } from "vitest";\nxit("x", () => {});\n',
    ],
    [
      "vitest it.todo",
      "src/todo.test.ts",
      'import { it } from "vitest";\nit.todo("x");\n',
    ],
    ["console.log", "src/console-log.ts", 'console.log("debug");\n'],
    [
      "eslint-disable ignored when suppressing console.log",
      "src/eslint-disable.ts",
      "// eslint-" + 'disable-next-line no-console\nconsole.log("still fails");\n',
    ],
    [
      "relative parent import crossing features",
      "src/features/a/sub/file.ts",
      'import { secret } from "../../other/internal";\nexport const used = secret;\n',
    ],
  ];

  for (const [name, file, content] of failures) {
    test(`rejects ${name}`, () => {
      const res = runOxlint(file, content);
      assert.notEqual(res.status, 0, `Expected oxlint to fail for ${name}, got output:\n${res.stdout}\n${res.stderr}`);
    });
  }

  test("allows console.warn, console.error, and clean typed code", () => {
    const res = runOxlint("src/clean.ts", 'export function logError(msg: string): void {\n  console.warn(msg);\n  console.error(msg);\n}\n');
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  });
});
