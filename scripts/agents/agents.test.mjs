// Tests for the agent task tooling (ADR 0008). Run: node --test scripts/agents/
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { GENERATED, PROTECTED, frozenBody, globToRegExp, parseTask } from "./lib.mjs";
import { CONCURRENCY_RUNS, PATTERNS, check, gatesFor } from "./task.mjs";

const repo = resolve(import.meta.dirname, "..", "..");

describe("globs", () => {
  const cases = [
    ["scripts/**", "scripts", true],
    ["scripts/**", "scripts/agents/task.mjs", true],
    ["src/Modules/Orders/**", "src/Modules/Ordersx/a.cs", false],
    ["web/tsconfig*.json", "web/tsconfig.app.json", true],
    ["**/*.cs", "a.cs", true],
    ["**/*.cs", "src/a/b.cs", true],
    ["src/Modules/**/Persistence/Migrations/**", "src/Modules/Orders/App.Orders/Persistence/Migrations/1_Init.cs", true],
  ];
  for (const [glob, path, expected] of cases) test(`${glob} ~ ${path}`, () => assert.equal(globToRegExp(glob).test(path), expected));
});

describe("task files", () => {
  const text = `---
id: "0001"
status: ready # comment
allow:
  - src/**
  - web/src/features/x/**
unlock: []
---
# Title

- [ ] criterion

## Executor log

(empty)

## Review
`;
  test("parses scalars and lists", () => {
    const { meta } = parseTask(text);
    assert.equal(meta.id, "0001");
    assert.equal(meta.status, "ready");
    assert.deepEqual(meta.allow, ["src/**", "web/src/features/x/**"]);
    assert.deepEqual(meta.unlock, []);
  });
  test("frozen body ignores the executor log and ticked boxes", () => {
    const { body } = parseTask(text);
    const edited = body.replace("- [ ] criterion", "- [x] criterion").replace("(empty)", "did things\n\nmore");
    assert.equal(frozenBody(edited), frozenBody(body));
    assert.notEqual(frozenBody(body.replace("criterion", "other")), frozenBody(body));
    assert.notEqual(frozenBody(body.replace("## Review\n", "## Review\napproved\n")), frozenBody(body));
  });
});

describe("antigravity guard", () => {
  const run = (event, payload) => {
    const r = spawnSync(process.execPath, [join(import.meta.dirname, "antigravity-hook.mjs"), event], {
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
    return JSON.parse(r.stdout || "{}");
  };
  const cmd = (CommandLine) => run("pre-tool", { toolCall: { name: "run_command", args: { CommandLine } } }).decision;
  const write = (name, args) => run("pre-tool", { toolCall: { name, args } }).decision;

  const denied = [
    "git commit --no-verify -m x",
    "git commit -nm x",
    "LEFTHOOK=0 git commit -m x",
    "git config core.hooksPath /dev/null",
    "git push origin task/0001-x",
    "git reset --hard HEAD~1",
    "pnpm --dir web add lodash",
    "pnpm add -D vitest",
    "npm install left-pad",
    "dotnet add src/App.Api package Foo",
    "echo hi > AGENTS.md",
    "sed -i s/a/b/ lefthook.yml",
    "Remove-Item web/src/lib/api/gen/index.ts",
    "APP_TASK_FENCE=off git commit -m x",
  ];
  const allowed = [
    "node scripts/agents/task.mjs check 2>&1",
    'git commit -m "feat(orders): place an order"',
    "pnpm --dir web install",
    "pnpm --dir web run check",
    "dotnet test --project tests/App.ArchitectureTests",
    "cat AGENTS.md",
    "git diff main -- lefthook.yml > /tmp/x.diff",
  ];
  for (const c of denied) test(`denies: ${c}`, () => assert.equal(cmd(c), "deny"));
  for (const c of allowed) test(`allows: ${c}`, () => assert.equal(cmd(c), "allow"));

  test("denies editing a protected file by absolute path", () =>
    assert.equal(write("code_action", { TargetFile: join(repo, "lefthook.yml"), CodeContent: "x" }), "deny"));
  test("denies hand-editing generated code", () =>
    assert.equal(write("file_change", { TargetFile: join(repo, "web", "src", "lib", "api", "gen", "index.ts") }), "deny"));
  test("allows editing feature code", () =>
    assert.equal(write("code_action", { TargetFile: join(repo, "web", "src", "features", "x", "y.tsx") }), "allow"));
  test("allows reading protected files", () => assert.equal(write("view_file", { AbsolutePath: join(repo, "AGENTS.md") }), "allow"));
  // Antigravity reads a PreToolUse reply without `decision` as a deny with an empty reason.
  test("answers allow explicitly, even for an empty payload", () => {
    assert.equal(run("pre-tool", {}).decision, "allow");
    assert.equal(write("read_file", { path: join(repo, ".agents", "skills", "execute-task", "SKILL.md") }), "allow");
  });
  test("covers MCP edit tools", () =>
    assert.equal(write("mcp_tool", { name: "apply_edits", arguments: { path: "web/.oxlintrc.json" } }), "deny"));
});

describe("opencode adapter", () => {
  test("denies edits to every protected and generated path", () => {
    const text = readFileSync(join(repo, "opencode.jsonc"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[\]}])/g, "$1");
    const denied = new Set(
      JSON.parse(text)
        .permissions.filter((p) => p.action === "edit" && p.effect === "deny")
        .map((p) => p.resource),
    );
    const expected = [...PROTECTED.filter((p) => p !== "docs/tasks/**"), ...GENERATED].map((p) => p.replace(/\/\*\*$/, "/*"));
    assert.deepEqual(expected.filter((p) => !denied.has(p)), []);
  });
});

describe("fence", () => {
  let dir;
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (path, content) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  const spec = (status = "ready") => `---
id: "0001"
title: Example
status: ${status}
scope: orders
allow:
  - src/Modules/Orders/**
unlock: []
verify: []
---
# 0001 · Example

## Acceptance criteria

- [ ] it works

## Executor log

## Review
`;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "app-fence-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    git("config", "core.hooksPath", "/dev/null");
    put("docs/tasks/0001-example.md", spec());
    put("lefthook.yml", "x: 1\n");
    put(".github/workflows/fence.yml", "name: fence\n");
    put("src/Modules/Orders/App.Orders/Persistence/Migrations/1_Init.cs", "// init\n");
    git("add", "-A");
    git("commit", "-qm", "init");
    git("switch", "-qc", "task/0001-example");
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  const errorsAfter = (fn) => {
    git("reset", "-q", "--hard");
    git("clean", "-qfd");
    fn();
    return check(dir, { mode: "worktree" }).errors;
  };

  test("is skipped off task branches", () => {
    git("switch", "-q", "main");
    assert.equal(check(dir, {}).skipped, true);
    git("switch", "-q", "task/0001-example");
  });
  test("passes for allowed work and executor-owned task edits", () =>
    assert.deepEqual(
      errorsAfter(() => {
        put("src/Modules/Orders/App.Orders/Domain/Entry.cs", "namespace X;\n");
        put("docs/tasks/0001-example.md", spec("review").replace("- [ ] it works", "- [x] it works").replace("## Executor log\n", "## Executor log\n\nDone.\n"));
      }),
      [],
    ));
  test("flags paths outside allow", () =>
    assert.match(errorsAfter(() => put("src/Other/A.cs", "x\n")).join("\n"), /outside the task's `allow`/));
  test("flags protected files", () => assert.match(errorsAfter(() => put("lefthook.yml", "x: 2\n")).join("\n"), /protected file/));
  test("flags edits to existing migrations", () =>
    assert.match(errorsAfter(() => put("src/Modules/Orders/App.Orders/Persistence/Migrations/1_Init.cs", "// changed\n")).join("\n"), /append-only/));
  test("flags spec changes", () =>
    assert.match(errorsAfter(() => put("docs/tasks/0001-example.md", spec().replace("src/Modules/Orders/**", "**"))).join("\n"), /frontmatter `allow` changed/));
  test("flags reviewer-only statuses", () =>
    assert.match(errorsAfter(() => put("docs/tasks/0001-example.md", spec("done"))).join("\n"), /set by the reviewer/));
  test("has no code patterns left in PATTERNS", () => assert.deepEqual(PATTERNS, []));
  test("verify runs the gates past fence violations only for reviewers", () => {
    errorsAfter(() => put("docs/elsewhere.md", "x\n"));
    const verify = (env) =>
      spawnSync(process.execPath, [join(repo, "scripts", "agents", "task.mjs"), "verify", "--task", "0001"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, APP_TASK_FENCE: env },
      }).status;
    assert.equal(verify(""), 1);
    assert.equal(verify("off"), 0);
  });
  test("checks PR head as data from main and catches tampered fence workflow", () => {
    git("reset", "-q", "--hard");
    git("clean", "-qfd");
    git("switch", "-qc", "pr-tamper", "main");
    try {
      put(".github/workflows/fence.yml", "name: tampered\n");
      git("add", "-A");
      git("commit", "-qm", "tamper fence");
      const headSha = git("rev-parse", "HEAD").trim();
      git("switch", "-q", "main");
      const res = check(dir, { mode: "ref", ref: headSha, task: "0001" });
      assert.match(res.errors.join("\n"), /\.github\/workflows\/fence\.yml: protected file/);
      assert.throws(() => check(dir, { mode: "ref", ref: headSha, task: "9999" }), /no docs\/tasks\/9999-\*\.md/);
    } finally {
      git("switch", "-q", "task/0001-example");
      git("branch", "-qD", "pr-tamper");
    }
  });
});

describe("gatesFor", () => {
  const task = { meta: { verify: [] } };
  const race = 'dotnet test --project tests/App.Api.IntegrationTests --no-build -- --filter-class "*.StockConcurrencyTests"';
  test("repeats each changed concurrency test class", () => {
    const gates = gatesFor([{ status: "A", path: "tests/App.Api.IntegrationTests/Orders/StockConcurrencyTests.cs" }], task);
    assert.equal(gates.filter((g) => g === race).length, CONCURRENCY_RUNS);
  });
  test("ignores ordinary and deleted test files", () => {
    const gates = gatesFor(
      [
        { status: "M", path: "tests/App.Api.IntegrationTests/Orders/OrdersTests.cs" },
        { status: "D", path: "tests/App.Api.IntegrationTests/Orders/StockConcurrencyTests.cs" },
      ],
      task,
    );
    assert.ok(!gates.some((g) => g.includes("--filter-class")));
  });
});
