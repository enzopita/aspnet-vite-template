// Tests for scripts/verify.mjs — single source of truth for quality gates (Step 3). Run: node --test scripts/verify.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { CONCURRENCY_RUNS, planGates } from "./verify.mjs";

const repo = resolve(import.meta.dirname, "..");

describe("verify planGates (task mode parity)", () => {
  const emptyTask = { meta: { verify: [] } };

  test("1. only .cs diff selects dotnet build, api:generate, web check/test, format, and architecture tests", () => {
    const files = [{ status: "M", path: "src/Modules/Catalog/App.Catalog/Domain/Product.cs" }];
    assert.deepEqual(planGates("task", { files, task: emptyTask, hasWebNodeModules: true }), [
      "dotnet build App.slnx --nologo -v quiet",
      "pnpm --dir web run --silent api:generate",
      "pnpm --dir web run --silent check",
      "pnpm --dir web run --silent test",
      "dotnet format App.slnx --verify-no-changes --no-restore",
      "dotnet test --project tests/App.ArchitectureTests --no-build",
    ]);

    assert.deepEqual(planGates("task", { files, task: emptyTask, hasWebNodeModules: false }), [
      "dotnet build App.slnx --nologo -v quiet",
      "pnpm --dir web run --silent check",
      "pnpm --dir web run --silent test",
      "dotnet format App.slnx --verify-no-changes --no-restore",
      "dotnet test --project tests/App.ArchitectureTests --no-build",
    ]);
  });

  test("2. only web/ diff skips dotnet gates and adds react-doctor only for .tsx", () => {
    assert.deepEqual(
      planGates("task", {
        files: [{ status: "M", path: "web/src/features/catalog/api/list-products.ts" }],
        task: emptyTask,
        hasWebNodeModules: true,
      }),
      [
        "pnpm --dir web run --silent check",
        "pnpm --dir web run --silent test",
        "pnpm --dir web run --silent i18n:extract",
        "node scripts/check-i18n.mjs",
      ],
    );

    assert.deepEqual(
      planGates("task", {
        files: [{ status: "M", path: "web/src/features/catalog/components/catalog-page.tsx" }],
        task: emptyTask,
        hasWebNodeModules: true,
      }),
      [
        "pnpm --dir web run --silent check",
        "pnpm --dir web run --silent test",
        "pnpm --dir web run --silent i18n:extract",
        "node scripts/check-i18n.mjs",
        "pnpm --dir web exec react-doctor . --yes --no-score --blocking warning",
      ],
    );
  });

  test("3. route + .cs + *ConcurrencyTests runs full coupled gates plus task verify and 10x race loop", () => {
    const raceCmd = 'dotnet test --project tests/App.Api.IntegrationTests --no-build -- --filter-class "*.CatalogConcurrencyTests"';
    const task = { meta: { verify: ["dotnet test --project tests/App.Api.IntegrationTests --no-build"] } };
    const files = [
      { status: "M", path: "web/src/routes/catalog.tsx" },
      { status: "M", path: "src/Modules/Catalog/App.Catalog/Features/AdjustStock.cs" },
      { status: "A", path: "tests/App.Api.IntegrationTests/Catalog/CatalogConcurrencyTests.cs" },
    ];

    const gates = planGates("task", { files, task, hasWebNodeModules: true });
    assert.deepEqual(gates, [
      "dotnet build App.slnx --nologo -v quiet",
      "pnpm --dir web run --silent api:generate",
      "pnpm --dir web run --silent build",
      "pnpm --dir web run --silent check",
      "pnpm --dir web run --silent test",
      "pnpm --dir web run --silent i18n:extract",
      "node scripts/check-i18n.mjs",
      "pnpm --dir web exec react-doctor . --yes --no-score --blocking warning",
      "dotnet format App.slnx --verify-no-changes --no-restore",
      "dotnet test --project tests/App.ArchitectureTests --no-build",
      "dotnet test --project tests/App.Api.IntegrationTests --no-build",
      ...Array.from({ length: CONCURRENCY_RUNS }, () => raceCmd),
    ]);
  });

  test("ignores ordinary and deleted concurrency test files, and treats governance/targets edits as dotnet", () => {
    const ordinary = planGates("task", {
      files: [
        { status: "M", path: "tests/App.Api.IntegrationTests/Catalog/CatalogTests.cs" },
        { status: "D", path: "tests/App.Api.IntegrationTests/Catalog/CatalogConcurrencyTests.cs" },
      ],
      task: emptyTask,
      hasWebNodeModules: true,
    });
    assert.ok(!ordinary.some((g) => g.includes("--filter-class")));
    assert.ok(ordinary.includes("dotnet build App.slnx --nologo -v quiet"));

    const gov = planGates("task", {
      files: [{ status: "M", path: "governance/nowarn.json" }],
      task: emptyTask,
      hasWebNodeModules: true,
    });
    assert.ok(gov.includes("dotnet test --project tests/App.ArchitectureTests --no-build"));
  });
});

describe("verify planGates (pre-push and ci modes)", () => {
  test("pre-push runs full suite plus check-generated", () => {
    const gates = planGates("pre-push");
    assert.ok(gates.includes("node scripts/check-generated.mjs"));
    assert.ok(gates.includes("dotnet test --solution App.slnx --no-build"));
    assert.ok(gates.includes("node --test scripts/"));
  });

  test("ci splits backend and web cleanly and all combines both", () => {
    const backend = planGates("ci", { area: "backend" });
    const web = planGates("ci", { area: "web" });
    const all = planGates("ci");
    assert.ok(backend.includes("dotnet build App.slnx --configuration Release --nologo"));
    assert.ok(backend.includes("git diff --exit-code -- web/openapi"));
    assert.ok(web.includes("node scripts/check-generated.mjs"));
    assert.ok(web.includes("node --test scripts/"));
    assert.deepEqual(all, [...backend, ...web]);
  });

  test("rejects unknown mode or ci area", () => {
    assert.throws(() => planGates("bogus"), /unknown verify mode/);
    assert.throws(() => planGates("ci", { area: "mobile" }), /unknown CI area/);
  });
});

describe("verify CLI end-to-end (--mode task --dry-run --json)", () => {
  const runDry = (cwd) => {
    const r = spawnSync(process.execPath, [join(repo, "scripts", "verify.mjs"), "--mode", "task", "--dry-run", "--json"], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).gates;
  };

  test("resolves merge-base diff + untracked files for all 3 example diffs", () => {
    const dir = mkdtempSync(join(tmpdir(), "app-verify-cli-"));
    try {
      const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const put = (rel, content) => {
        const full = join(dir, rel);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      };

      git("init", "-q", "-b", "main");
      git("config", "user.email", "test@example.com");
      git("config", "user.name", "test");
      git("config", "core.hooksPath", "/dev/null");
      put("README.md", "base\n");
      git("add", "-A");
      git("commit", "-qm", "base");
      git("switch", "-qc", "feature/example");
      mkdirSync(join(dir, "web", "node_modules"), { recursive: true });

      // 1. Only untracked .cs
      put("src/Domain/Item.cs", "namespace X;\n");
      assert.deepEqual(runDry(dir), planGates("task", { files: [{ status: "A", path: "src/Domain/Item.cs" }], hasWebNodeModules: true }));

      // 2. Only web/ (clean .cs, modify web .tsx)
      rmSync(join(dir, "src"), { recursive: true, force: true });
      put("web/src/components/Card.tsx", "export const Card = () => null;\n");
      assert.deepEqual(runDry(dir), planGates("task", { files: [{ status: "A", path: "web/src/components/Card.tsx" }], hasWebNodeModules: true }));

      // 3. Committed .cs + untracked route + untracked *ConcurrencyTests
      put("src/App.Catalog/AdjustStock.cs", "namespace App.Catalog;\n");
      put("web/src/routes/catalog.tsx", "export const Route = {};\n");
      put("tests/App.Api.IntegrationTests/Catalog/CatalogConcurrencyTests.cs", "class CatalogConcurrencyTests {}\n");
      rmSync(join(dir, "web/src/components"), { recursive: true, force: true });
      git("add", "src/");
      git("commit", "-qm", "cs change");
      assert.deepEqual(
        runDry(dir),
        planGates("task", {
          files: [
            { status: "A", path: "src/App.Catalog/AdjustStock.cs" },
            { status: "A", path: "tests/App.Api.IntegrationTests/Catalog/CatalogConcurrencyTests.cs" },
            { status: "A", path: "web/src/routes/catalog.tsx" },
          ],
          hasWebNodeModules: true,
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CLI exits non-zero without valid --mode", () => {
    const r = spawnSync(process.execPath, [join(repo, "scripts", "verify.mjs"), "--mode", "invalid"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0);
  });
});

describe("verify wiring and gatesFor removal", () => {
  test("lefthook pre-push, backend.yml, and web.yml delegate to verify.mjs", () => {
    const lefthook = readFileSync(join(repo, "lefthook.yml"), "utf8");
    const backendYml = readFileSync(join(repo, ".github", "workflows", "backend.yml"), "utf8");
    const webYml = readFileSync(join(repo, ".github", "workflows", "web.yml"), "utf8");
    const taskMjs = readFileSync(join(repo, "scripts", "agents", "task.mjs"), "utf8");

    assert.match(lefthook, /node scripts\/verify\.mjs --mode pre-push/);
    assert.match(backendYml, /fetch-depth:\s*0/);
    assert.match(backendYml, /node scripts\/verify\.mjs --mode ci --area backend/);
    assert.match(webYml, /fetch-depth:\s*0/);
    assert.match(webYml, /node scripts\/verify\.mjs --mode ci --area web/);
    assert.doesNotMatch(taskMjs, /\bgatesFor\b/);
  });
});
