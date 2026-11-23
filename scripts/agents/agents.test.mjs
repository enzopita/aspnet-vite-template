// Tests for agent task tooling, worktree roles, unified hooks, and adapters (ADR 0008). Run: node --test scripts/agents/
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";
import { GENERATED, PROTECTED, frozenBody, globToRegExp, parseTask, readRole, writeState, sha256 } from "./lib.mjs";
import { PATTERNS, check } from "./task.mjs";

const repo = resolve(import.meta.dirname, "..", "..");
const hookScript = join(repo, "scripts", "agents", "agent-hook.mjs");
const taskScript = join(repo, "scripts", "agents", "task.mjs");
const pluginUrl = pathToFileURL(join(repo, ".opencode", "plugins", "app-guard.mjs")).href;

function runHookCli(harness, event, payload, cwd) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [hookScript, harness, event], {
    input,
    cwd,
    encoding: "utf8",
  });
  return { status: r.status, json: JSON.parse(r.stdout || "{}"), stderr: r.stderr };
}

function createTempWorkspace() {
  const parent = mkdtempSync(join(tmpdir(), "app-roles-"));
  const mainDir = join(parent, "app-repo");
  mkdirSync(mainDir, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: mainDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const put = (relPath, content) => {
    const full = join(mainDir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };

  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "core.hooksPath", "/dev/null");

  const spec = `---
id: "0001"
title: Example task
status: ready
scope: orders
allow:
  - src/Modules/Orders/**
  - web/src/features/orders/**
unlock: []
verify: []
---
# 0001 · Example task

## Acceptance criteria

- [ ] it works

## Executor log

## Review
`;
  put("docs/tasks/0001-example.md", spec);
  put("lefthook.yml", "min_version: 2.2.0\n");
  put("src/AGENTS.md", "# Backend Area Rules\nUse TimeProvider.\n");
  put("web/AGENTS.md", "# Frontend Area Rules\nUse Lingui Trans.\n");
  put("web/.oxlintrc.json", `${JSON.stringify({ rules: { "no-debugger": "error" } })}\n`);
  put("src/Modules/Orders/App.Orders/Persistence/Migrations/1_Init.cs", "// init\n");
  put(".github/workflows/fence.yml", "name: fence\n");
  git("add", "-A");
  git("commit", "-qm", "init");

  return {
    parent,
    mainDir,
    taskDir: join(parent, `${basename(mainDir)}-task-0001`),
    reviewDir: join(parent, `${basename(mainDir)}-review-0001`),
    cleanup: () => {
      try {
        execFileSync("git", ["worktree", "prune"], { cwd: mainDir, stdio: "ignore" });
      } catch {}
      rmSync(parent, { recursive: true, force: true });
    },
  };
}

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

  test("frozen body ignores executor log and optionally review section", () => {
    const { body } = parseTask(text);
    const edited = body.replace("- [ ] criterion", "- [x] criterion").replace("(empty)", "did things\n\nmore");
    assert.equal(frozenBody(edited), frozenBody(body));
    assert.notEqual(frozenBody(body.replace("criterion", "other")), frozenBody(body));
    assert.notEqual(frozenBody(body.replace("## Review\n", "## Review\napproved\n")), frozenBody(body));
    assert.equal(frozenBody(body.replace("## Review\n", "## Review\napproved\n"), { allowReview: true }), frozenBody(body, { allowReview: true }));
  });
});

describe("worktrees, roles, and review branches", () => {
  let ws;

  before(() => {
    ws = createTempWorkspace();
  });
  after(() => ws.cleanup());

  test("task.mjs start and review create sibling worktrees with agent-role and single-rule fence", () => {
    assert.equal(readRole(ws.mainDir), "orchestrator");

    const start = spawnSync(process.execPath, [taskScript, "start", "0001"], { cwd: ws.mainDir, encoding: "utf8" });
    assert.equal(start.status, 0, start.stderr);
    assert.ok(existsSync(ws.taskDir));
    assert.equal(readRole(ws.taskDir), "executor");

    const allowedFile = join(ws.taskDir, "src", "Modules", "Orders", "App.Orders", "Domain", "Order.cs");
    mkdirSync(dirname(allowedFile), { recursive: true });
    writeFileSync(allowedFile, "namespace App.Orders;\n");
    execFileSync("git", ["add", "-A"], { cwd: ws.taskDir });
    execFileSync("git", ["commit", "-qm", "feat(orders): add entity"], { cwd: ws.taskDir });

    const review = spawnSync(process.execPath, [taskScript, "review", "0001"], { cwd: ws.mainDir, encoding: "utf8" });
    assert.equal(review.status, 0, review.stderr);
    assert.ok(existsSync(ws.reviewDir));
    assert.equal(readRole(ws.reviewDir), "reviewer");

    // Reviewer can write ## Review and transition status to done within allow.
    const specPath = join(ws.reviewDir, "docs", "tasks", "0001-example.md");
    const specDone = readFileSync(specPath, "utf8")
      .replace("status: in-progress", "status: done")
      .replace("## Review\n", "## Review\n\nLooks solid.\n");
    writeFileSync(specPath, specDone);
    const reviewClean = check(ws.reviewDir, { mode: "worktree" });
    assert.deepEqual(reviewClean.errors, []);

    // Reviewer is STILL bound by `allow`: edits outside `allow` or to PROTECTED fail the fence.
    writeFileSync(join(ws.reviewDir, "lefthook.yml"), "tampered: true\n");
    const reviewViol = check(ws.reviewDir, { mode: "worktree" });
    assert.match(reviewViol.errors.join("\n"), /lefthook\.yml: protected file/);
  });
});

describe("same harness, same model: orchestrator free vs executor blocked", () => {
  let ws;
  /** @type {Awaited<ReturnType<any>>} */
  let opencodeToolHook;
  let opencodeShellHook;

  before(async () => {
    ws = createTempWorkspace();
    const s = spawnSync(process.execPath, [taskScript, "start", "0001"], { cwd: ws.mainDir, encoding: "utf8" });
    assert.equal(s.status, 0, s.stderr);

    const mod = await import(pluginUrl);
    const mockPlugin = mod.default;
    assert.equal(mockPlugin.id, "app-guard");
    await mockPlugin.setup({
      directory: ws.taskDir,
      tool: {
        async hook(event, fn) {
          if (event === "execute.before") opencodeToolHook = fn;
        },
      },
      shell: {
        async hook(event, fn) {
          if (event === "create.before") opencodeShellHook = fn;
        },
      },
    });
  });
  after(() => ws.cleanup());

  test("Antigravity allows orchestrator in main checkout and blocks executor in task worktree", () => {
    const protectedWrite = { toolCall: { name: "write_file", args: { TargetFile: "lefthook.yml" } }, cwd: ws.mainDir };
    const protectedWriteTask = { toolCall: { name: "write_file", args: { TargetFile: "lefthook.yml" } }, cwd: ws.taskDir };
    assert.equal(runHookCli("antigravity", "pre-tool", protectedWrite, ws.mainDir).json.decision, "allow");
    assert.equal(runHookCli("antigravity", "pre-tool", protectedWriteTask, ws.taskDir).json.decision, "deny");

    const pushMain = { toolCall: { name: "run_command", args: { CommandLine: "git push origin setup/04-roles" } }, cwd: ws.mainDir };
    const pushTask = { toolCall: { name: "run_command", args: { CommandLine: "git push origin task/0001-example" } }, cwd: ws.taskDir };
    assert.equal(runHookCli("antigravity", "pre-tool", pushMain, ws.mainDir).json.decision, "allow");
    assert.equal(runHookCli("antigravity", "pre-tool", pushTask, ws.taskDir).json.decision, "deny");
  });

  test("Claude Code allows orchestrator in main checkout and blocks executor in task worktree", () => {
    const editMain = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: join(ws.mainDir, "lefthook.yml") }, cwd: ws.mainDir };
    const editTask = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, "lefthook.yml") }, cwd: ws.taskDir };
    assert.equal(runHookCli("claude", "pre-tool", editMain, ws.mainDir).json.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(runHookCli("claude", "pre-tool", editTask, ws.taskDir).json.hookSpecificOutput.permissionDecision, "deny");
  });

  test("OpenCode V2 plugin allows orchestrator in main checkout and blocks executor in task worktree", async () => {
    let mainToolHook;
    const mod = await import(pluginUrl);
    await mod.default.setup({
      directory: ws.mainDir,
      tool: {
        async hook(event, fn) {
          if (event === "execute.before") mainToolHook = fn;
        },
      },
    });

    await mainToolHook({ tool: "edit", args: { filePath: "lefthook.yml" } });
    await assert.rejects(() => opencodeToolHook({ tool: "edit", args: { filePath: "lefthook.yml" } }), /protected/);
    await assert.rejects(() => opencodeShellHook({ command: "git push origin task/0001-example" }), /never push/);
  });
});

describe("Claude Code and Antigravity tool guards (Bash, Edit, NotebookEdit, mcp__*, .git, worktree escape)", () => {
  let ws;

  before(() => {
    ws = createTempWorkspace();
    const s = spawnSync(process.execPath, [taskScript, "start", "0001"], { cwd: ws.mainDir, encoding: "utf8" });
    assert.equal(s.status, 0, s.stderr);
  });
  after(() => ws.cleanup());

  test("Claude Code blocks Bash, Edit, NotebookEdit, and mcp__* violations in task worktree", () => {
    const denyCases = [
      ["Bash --no-verify", { tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" } }],
      ["Bash push", { tool_name: "Bash", tool_input: { command: "git push origin task/0001-example" } }],
      ["Bash outside redirect", { tool_name: "Bash", tool_input: { command: "echo hi > ../outside.txt" } }],
      ["Bash write .git agent-role", { tool_name: "Bash", tool_input: { command: "echo orchestrator > .git" } }],
      ["Edit protected", { tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, "Directory.Build.targets") } }],
      ["Edit generated", { tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, "web/src/lib/api/gen/index.ts") } }],
      ["Edit outside worktree", { tool_name: "Edit", tool_input: { file_path: join(ws.parent, "escape.cs") } }],
      ["Edit .git internals", { tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, ".git") } }],
      ["NotebookEdit protected", { tool_name: "NotebookEdit", tool_input: { notebook_path: join(ws.taskDir, "docs/adr/0001.ipynb") } }],
      ["NotebookEdit outside worktree", { tool_name: "NotebookEdit", tool_input: { notebook_path: join(ws.parent, "evil.ipynb") } }],
      ["mcp__* write", { tool_name: "mcp__filesystem__write_file", tool_input: { path: join(ws.taskDir, "web/.oxlintrc.json") } }],
      ["mcp__* shell exec", { tool_name: "mcp__terminal__run_command", tool_input: { command: "pnpm add lodash" } }],
    ];

    for (const [label, payload] of denyCases) {
      const res = runHookCli("claude", "pre-tool", { ...payload, cwd: ws.taskDir }, ws.taskDir);
      assert.equal(res.json.hookSpecificOutput?.permissionDecision, "deny", `Expected deny for ${label}`);
    }

    const allowCases = [
      { tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, "src/Modules/Orders/App.Orders/Order.cs") } },
      { tool_name: "Bash", tool_input: { command: "dotnet test --project tests/App.ArchitectureTests > /dev/null" } },
      { tool_name: "Read", tool_input: { file_path: join(ws.taskDir, "AGENTS.md") } },
      { tool_name: "mcp__microsoft_docs__search", tool_input: { query: "TimeProvider .NET 11" } },
    ];
    for (const payload of allowCases) {
      const res = runHookCli("claude", "pre-tool", { ...payload, cwd: ws.taskDir }, ws.taskDir);
      assert.equal(res.json.hookSpecificOutput?.permissionDecision, "allow");
    }
  });

  test("Antigravity covers NotebookEdit, mcp__*, outside worktree, and fails closed on invalid JSON", () => {
    assert.equal(
      runHookCli("antigravity", "pre-tool", { toolCall: { name: "edit_notebook", args: { AbsolutePath: "../escape.ipynb" } }, cwd: ws.taskDir }, ws.taskDir).json.decision,
      "deny",
    );
    assert.equal(
      runHookCli("antigravity", "pre-tool", { toolCall: { name: "mcp__t3__apply_patch", args: { path: "web/.oxlintrc.json" } }, cwd: ws.taskDir }, ws.taskDir).json.decision,
      "deny",
    );
    assert.equal(
      runHookCli("antigravity", "pre-tool", "{broken json", ws.taskDir).json.decision,
      "deny",
    );
    assert.equal(
      runHookCli("claude", "pre-tool", "{broken json", ws.taskDir).json.hookSpecificOutput.permissionDecision,
      "deny",
    );
    // Empty valid payload on main checkout explicitly returns allow (Antigravity requirement).
    assert.equal(runHookCli("antigravity", "pre-tool", {}, ws.mainDir).json.decision, "allow");
  });
});

describe("SessionStart area AGENTS.md, PostToolUse, and Stop background check", () => {
  let ws;

  before(() => {
    ws = createTempWorkspace();
    const s = spawnSync(process.execPath, [taskScript, "start", "0001"], { cwd: ws.mainDir, encoding: "utf8" });
    assert.equal(s.status, 0, s.stderr);
  });
  after(() => ws.cleanup());

  test("SessionStart injects area AGENTS.md files deduced from task allow", () => {
    const claudeRes = runHookCli("claude", "session-start", { cwd: ws.taskDir }, ws.taskDir);
    const ctx = claudeRes.json.hookSpecificOutput?.additionalContext ?? "";
    assert.match(ctx, /Backend Area Rules/);
    assert.match(ctx, /Frontend Area Rules/);

    const agyRes = runHookCli("antigravity", "session-start", { cwd: ws.taskDir }, ws.taskDir);
    const msg = agyRes.json.injectSteps?.[0]?.systemMessage?.systemMessage ?? "";
    assert.match(msg, /Backend Area Rules/);
    assert.match(msg, /Frontend Area Rules/);
  });

  test("PostToolUse runs oxlint on edited web TS files for Claude Code", () => {
    mkdirSync(join(ws.taskDir, "web/src/features/orders"), { recursive: true });
    writeFileSync(join(ws.taskDir, "web/src/features/orders/bad.ts"), "debugger;\nexport const x = 1;\n");

    const res = runHookCli(
      "claude",
      "post-tool",
      { tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, "web/src/features/orders/bad.ts") }, cwd: ws.taskDir },
      ws.taskDir,
    );
    assert.match(res.json.hookSpecificOutput?.additionalContext ?? "", /no-debugger|debugger/i);

    writeFileSync(join(ws.taskDir, "web/src/features/orders/good.ts"), "export const x = 1;\n");
    const cleanRes = runHookCli(
      "claude",
      "post-tool",
      { tool_name: "Edit", tool_input: { file_path: join(ws.taskDir, "web/src/features/orders/good.ts") }, cwd: ws.taskDir },
      ws.taskDir,
    );
    assert.deepEqual(cleanRes.json, {});
  });

  test("Stop refuses while background work is running and enforces verify fingerprint + 3-failure guidance", () => {
    // Antigravity: fullyIdle: false blocks Stop.
    const agyBusy = runHookCli("antigravity", "stop", { fullyIdle: false, cwd: ws.taskDir }, ws.taskDir);
    assert.equal(agyBusy.json.decision, "continue");
    assert.match(agyBusy.json.reason, /Background work/);

    // Claude Code: background_tasks_running: true blocks Stop.
    const claudeBusy = runHookCli("claude", "stop", { background_tasks_running: true, cwd: ws.taskDir }, ws.taskDir);
    assert.equal(claudeBusy.json.decision, "block");
    assert.match(claudeBusy.json.reason, /Background work/);

    // Make an allowed edit and trigger 3 identical unverified Stop failures.
    const target = join(ws.taskDir, "src/Modules/Orders/App.Orders/Item.cs");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "namespace App.Orders;\n");

    const specPath = join(ws.taskDir, "docs/tasks/0001-example.md");
    const specContent = readFileSync(specPath, "utf8").replace("status: in-progress", "status: review");
    writeFileSync(specPath, specContent);

    execFileSync("git", ["add", "-A"], { cwd: ws.taskDir });
    execFileSync("git", ["commit", "-qm", "feat(orders): add item"], { cwd: ws.taskDir });

    const s1 = runHookCli("claude", "stop", { cwd: ws.taskDir }, ws.taskDir);
    const s2 = runHookCli("claude", "stop", { cwd: ws.taskDir }, ws.taskDir);
    const s3 = runHookCli("claude", "stop", { cwd: ws.taskDir }, ws.taskDir);
    assert.equal(s1.json.decision, "block");
    assert.match(s1.json.reason, /task\.mjs verify/);
    assert.equal(s2.json.decision, "block");
    assert.equal(s3.json.decision, "block");
    assert.match(s3.json.reason, /Repeated failure \(3x/);

    // Write matching fingerprint and confirm Stop allows completion.
    const base = execFileSync("git", ["merge-base", "main", "HEAD"], { cwd: ws.taskDir, encoding: "utf8" }).trim();
    const diffNames = execFileSync("git", ["diff", "--name-only", "--no-renames", base, "--", ".", ":(exclude)docs/tasks"], {
      cwd: ws.taskDir,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean)
      .sort();
    const fp = sha256(diffNames.map((p) => `${p}:${sha256(readFileSync(join(ws.taskDir, p)))}`).join("\n"));
    writeState(ws.taskDir, "verify-0001.json", { ok: true, fingerprint: fp, ran: [] });

    const okStop = runHookCli("claude", "stop", { cwd: ws.taskDir }, ws.taskDir);
    assert.deepEqual(okStop.json, {});

    // Stop in main checkout (orchestrator) never blocks.
    assert.deepEqual(runHookCli("antigravity", "stop", { fullyIdle: false, cwd: ws.mainDir }, ws.mainDir).json, {});
  });
});

describe("opencode adapter, bypass removal, and empty PATTERNS", () => {
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

  test("legacy fence bypass var is completely removed, PATTERNS is empty, and lefthook drops emergency skip tip", () => {
    assert.deepEqual(PATTERNS, []);
    const bypassRe = new RegExp("APP_" + "TASK_FENCE");
    const files = [
      "scripts/agents/task.mjs",
      "scripts/agents/agent-hook.mjs",
      "opencode.jsonc",
      "docs/tasks/README.md",
      "docs/adr/0008-agent-task-workflow.md",
      ".agents/skills/review-task/SKILL.md",
    ];
    for (const rel of files) {
      assert.doesNotMatch(readFileSync(join(repo, rel), "utf8"), bypassRe);
    }
    assert.doesNotMatch(readFileSync(join(repo, "lefthook.yml"), "utf8"), new RegExp("LEFTHOOK" + "=0"));
  });
});

describe("frozen tests, spec test divergence, area AGENTS.md split, and knowledge/MCP step 6 guards", () => {
  test("frozen: blocks executor edits both when committed on main and after initial task commit", () => {
    const ws = createTempWorkspace();
    try {
      const frozenMain = join(ws.mainDir, "tests/ContractTests.cs");
      mkdirSync(dirname(frozenMain), { recursive: true });
      writeFileSync(frozenMain, "// existing contract test\n");
      writeFileSync(
        join(ws.mainDir, "docs/tasks/0002-frozen.md"),
        `---
id: "0002"
title: Frozen contract
status: ready
scope: orders
allow:
  - src/Modules/Orders/**
  - tests/App.Api.IntegrationTests/Orders/**
unlock: []
frozen:
  - tests/ContractTests.cs
  - tests/NewContractTests.cs
verify: []
---
# 0002 · Frozen contract

## Steps
1. Implement

## Acceptance criteria
- [ ] works

## Executor log
`,
      );
      execFileSync("git", ["add", "-A"], { cwd: ws.mainDir });
      execFileSync("git", ["commit", "-qm", "chore: add frozen spec"], { cwd: ws.mainDir });

      const startRes = spawnSync(process.execPath, [taskScript, "start", "0002"], { cwd: ws.mainDir, encoding: "utf8" });
      assert.equal(startRes.status, 0, startRes.stderr);

      const task2Dir = join(ws.parent, `${basename(ws.mainDir)}-task-0002`);
      // PreToolUse denies editing a frozen file in executor worktree, allows in main checkout.
      assert.equal(
        runHookCli(
          "claude",
          "pre-tool",
          { tool_name: "Edit", tool_input: { file_path: join(task2Dir, "tests/ContractTests.cs") }, cwd: task2Dir },
          task2Dir,
        ).json.hookSpecificOutput.permissionDecision,
        "deny",
      );
      assert.equal(
        runHookCli(
          "antigravity",
          "pre-tool",
          { toolCall: { name: "edit_file", args: { Path: join(task2Dir, "tests/ContractTests.cs") } }, cwd: task2Dir },
          task2Dir,
        ).json.decision,
        "deny",
      );
      assert.equal(
        runHookCli(
          "claude",
          "pre-tool",
          { tool_name: "Edit", tool_input: { file_path: join(ws.mainDir, "tests/ContractTests.cs") }, cwd: ws.mainDir },
          ws.mainDir,
        ).json.hookSpecificOutput.permissionDecision,
        "allow",
      );

      // Editing a frozen file from main fails task.mjs check().
      writeFileSync(join(task2Dir, "tests/ContractTests.cs"), "// weakened\n");
      const mainFrozenCheck = check(task2Dir, { mode: "worktree" });
      assert.ok(mainFrozenCheck.errors.some((e) => /tests\/ContractTests\.cs: frozen file/.test(e)));
      writeFileSync(join(task2Dir, "tests/ContractTests.cs"), "// existing contract test\n");

      // Frozen file added in first commit on task/* stays frozen in later commits.
      const newFrozen = join(task2Dir, "tests/NewContractTests.cs");
      writeFileSync(newFrozen, "// committed in first task commit\n");
      execFileSync("git", ["add", "tests/NewContractTests.cs"], { cwd: task2Dir });
      execFileSync("git", ["commit", "-qm", "test(orders): add frozen black-box tests"], { cwd: task2Dir });
      assert.deepEqual(check(task2Dir, { mode: "worktree" }).errors, []);

      // Modifying a separate allowed file passes cleanly.
      const impl = join(task2Dir, "src/Modules/Orders/App.Orders/Impl.cs");
      mkdirSync(dirname(impl), { recursive: true });
      writeFileSync(impl, "namespace App.Orders;\n");
      execFileSync("git", ["add", "-A"], { cwd: task2Dir });
      execFileSync("git", ["commit", "-qm", "feat(orders): implement slice"], { cwd: task2Dir });
      assert.deepEqual(check(task2Dir, { mode: "worktree" }).errors, []);

      // Modifying NewContractTests.cs in commit #2 triggers a frozen error.
      writeFileSync(newFrozen, "// altered later\n");
      const secondFrozenCheck = check(task2Dir, { mode: "worktree" });
      assert.ok(secondFrozenCheck.errors.some((e) => /tests\/NewContractTests\.cs: frozen file/.test(e)));
    } finally {
      ws.cleanup();
    }
  });

  test("spec-copied test divergence emits warning when altered and passes cleanly when matching", () => {
    const ws = createTempWorkspace();
    try {
      writeFileSync(
        join(ws.mainDir, "docs/tasks/0002-contract.md"),
        `---
id: "0002"
title: Contract snippet
status: ready
scope: orders
allow:
  - tests/App.Api.IntegrationTests/Orders/**
unlock: []
frozen: []
verify: []
---
# 0002 · Contract snippet

## Contract tests
\`\`\`csharp tests/App.Api.IntegrationTests/Orders/ExampleTests.cs
[Fact]
public void Must_pass() { Assert.True(true); }
\`\`\`

## Executor log
`,
      );
      execFileSync("git", ["add", "-A"], { cwd: ws.mainDir });
      execFileSync("git", ["commit", "-qm", "docs: add spec with contract test"], { cwd: ws.mainDir });
      assert.equal(spawnSync(process.execPath, [taskScript, "start", "0002"], { cwd: ws.mainDir, encoding: "utf8" }).status, 0);

      const task2Dir = join(ws.parent, `${basename(ws.mainDir)}-task-0002`);
      const targetTest = join(task2Dir, "tests/App.Api.IntegrationTests/Orders/ExampleTests.cs");
      mkdirSync(dirname(targetTest), { recursive: true });
      writeFileSync(targetTest, "namespace App.Api.IntegrationTests.Orders;\n\n[Fact]\npublic void Must_pass() { Assert.True(true); }\n");

      const clean = check(task2Dir, { mode: "worktree" });
      assert.deepEqual(clean.errors, []);
      assert.deepEqual(clean.warnings, []);

      writeFileSync(targetTest, "namespace App.Api.IntegrationTests.Orders;\n\n[Fact]\npublic void Changed_name() {}\n");
      const diverged = check(task2Dir, { mode: "worktree" });
      assert.deepEqual(diverged.errors, []);
      assert.equal(diverged.warnings.length, 1);
      assert.match(diverged.warnings[0], /diverges from the snippet/);
    } finally {
      ws.cleanup();
    }
  });

  test("SessionStart injects only the area AGENTS.md matching task allow globs", () => {
    const ws = createTempWorkspace();
    try {
      const addTask = (id, slug, allowLine) =>
        writeFileSync(
          join(ws.mainDir, `docs/tasks/${id}-${slug}.md`),
          `---\nid: "${id}"\ntitle: ${slug}\nstatus: ready\nscope: orders\nallow:\n  - ${allowLine}\nunlock: []\nverify: []\n---\n# ${slug}\n\n## Executor log\n`,
        );
      addTask("0002", "backend-only", "src/Modules/Orders/**");
      addTask("0003", "frontend-only", "web/src/features/orders/**");
      execFileSync("git", ["add", "-A"], { cwd: ws.mainDir });
      execFileSync("git", ["commit", "-qm", "docs: add area specs"], { cwd: ws.mainDir });

      assert.equal(spawnSync(process.execPath, [taskScript, "start", "0002"], { cwd: ws.mainDir, encoding: "utf8" }).status, 0);
      assert.equal(spawnSync(process.execPath, [taskScript, "start", "0003"], { cwd: ws.mainDir, encoding: "utf8" }).status, 0);

      const beDir = join(ws.parent, `${basename(ws.mainDir)}-task-0002`);
      const feDir = join(ws.parent, `${basename(ws.mainDir)}-task-0003`);

      const beCtx = runHookCli("claude", "session-start", { cwd: beDir }, beDir).json.hookSpecificOutput?.additionalContext ?? "";
      assert.match(beCtx, /Backend Area Rules/);
      assert.doesNotMatch(beCtx, /Frontend Area Rules/);

      const feMsg = runHookCli("antigravity", "session-start", { cwd: feDir }, feDir).json.injectSteps?.[0]?.systemMessage?.systemMessage ?? "";
      assert.match(feMsg, /Frontend Area Rules/);
      assert.doesNotMatch(feMsg, /Backend Area Rules/);
    } finally {
      ws.cleanup();
    }
  });

  test("knowledge artifacts, skills, MCP configs, and planner-only NuGet guard are properly wired", async () => {
    // findings.jsonl exists and any non-empty line is valid JSON with expected fields
    const findingsPath = join(repo, "docs/agents/findings.jsonl");
    assert.ok(existsSync(findingsPath));
    for (const line of readFileSync(findingsPath, "utf8").split(/\r?\n/).filter(Boolean)) {
      const obj = JSON.parse(line);
      for (const key of ["task", "model", "origin", "category", "file", "guard_created"]) assert.ok(key in obj);
    }

    // _template.md has Verified facts, frozen:, named test criterion guidance, and Contract tests
    const tpl = readFileSync(join(repo, "docs/tasks/_template.md"), "utf8");
    assert.match(tpl, /^frozen:/m);
    assert.match(tpl, /^## Verified facts/m);
    assert.match(tpl, /^## Contract tests/m);
    assert.match(tpl, /named test/i);

    // Skills exist in .agents/skills and resolve through .claude/skills symlink
    for (const skill of ["plan-task", "execute-task", "review-task", "diff-audit", "look-it-up"]) {
      assert.ok(existsSync(join(repo, `.agents/skills/${skill}/SKILL.md`)), `missing .agents skill ${skill}`);
      assert.ok(existsSync(join(repo, `.claude/skills/${skill}/SKILL.md`)), `missing .claude skill ${skill}`);
    }
    assert.match(readFileSync(join(repo, ".agents/skills/review-task/SKILL.md"), "utf8"), /docs\/agents\/findings\.jsonl/);

    // MCP configs across Antigravity, Claude Code, and OpenCode
    const claudeMcp = JSON.parse(readFileSync(join(repo, ".mcp.json"), "utf8")).mcpServers;
    assert.equal(claudeMcp["microsoft-learn"].url, "https://learn.microsoft.com/api/mcp");
    assert.equal(claudeMcp.context7.url, "https://mcp.context7.com/mcp");
    assert.equal(claudeMcp.nuget.command, "dnx");

    const agyPlugin = JSON.parse(readFileSync(join(repo, ".agents/plugins/app-knowledge/plugin.json"), "utf8"));
    assert.equal(agyPlugin.name, "app-knowledge");
    const agyMcp = JSON.parse(readFileSync(join(repo, ".agents/plugins/app-knowledge/mcp_config.json"), "utf8")).mcpServers;
    assert.equal(agyMcp["microsoft-learn"].url, "https://learn.microsoft.com/api/mcp");
    assert.equal(agyMcp.context7.url, "https://mcp.context7.com/mcp");
    assert.equal(agyMcp.nuget.command, "dnx");

    const ocRaw = readFileSync(join(repo, "opencode.jsonc"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[\]}])/g, "$1");
    const ocServers = JSON.parse(ocRaw).mcp.servers;
    assert.equal(ocServers["microsoft-learn"].type, "remote");
    assert.equal(ocServers["microsoft-learn"].url, "https://learn.microsoft.com/api/mcp");
    assert.equal(ocServers.context7.type, "remote");
    assert.equal(ocServers.context7.url, "https://mcp.context7.com/mcp");
    assert.equal(ocServers.nuget.type, "local");
    assert.ok(Array.isArray(ocServers.nuget.command) && ocServers.nuget.command[0] === "dnx");
    assert.equal("enabled" in ocServers.context7, false);

    // Runtime MCP guard: NuGet MCP blocked for executor/reviewer, allowed for orchestrator; docs MCPs allowed everywhere
    const ws = createTempWorkspace();
    try {
      assert.equal(spawnSync(process.execPath, [taskScript, "start", "0001"], { cwd: ws.mainDir, encoding: "utf8" }).status, 0);
      assert.equal(spawnSync(process.execPath, [taskScript, "review", "0001"], { cwd: ws.mainDir, encoding: "utf8" }).status, 0);

      for (const dir of [ws.taskDir, ws.reviewDir]) {
        assert.equal(
          runHookCli("claude", "pre-tool", { tool_name: "mcp__nuget__update_package", tool_input: { packageId: "Foo" }, cwd: dir }, dir).json
            .hookSpecificOutput.permissionDecision,
          "deny",
        );
        assert.equal(
          runHookCli("antigravity", "pre-tool", { toolCall: { name: "mcp__nuget__search_packages", args: { query: "Kubb" } }, cwd: dir }, dir)
            .json.decision,
          "deny",
        );
        assert.equal(
          runHookCli(
            "claude",
            "pre-tool",
            { tool_name: "mcp__microsoft-learn__microsoft_docs_search", tool_input: { query: "OpenApi3_1" }, cwd: dir },
            dir,
          ).json.hookSpecificOutput.permissionDecision,
          "allow",
        );
        assert.equal(
          runHookCli("antigravity", "pre-tool", { toolCall: { name: "mcp__context7__query-docs", args: { query: "tanstack" } }, cwd: dir }, dir)
            .json.decision,
          "allow",
        );
      }

      const mod = await import(`${pluginUrl}?v=${Date.now()}`);
      const hooks = {};
      await mod.default.setup({
        directory: ws.taskDir,
        tool: {
          hook: (n, fn) => {
            hooks[n] = fn;
          },
        },
      });
      await assert.rejects(() => hooks["execute.before"]({ tool: "mcp__nuget__update_package", args: {} }), /NuGet MCP/i);
      await assert.doesNotReject(() => hooks["execute.before"]({ tool: "mcp__context7__query-docs", args: {} }));

      assert.equal(
        runHookCli("claude", "pre-tool", { tool_name: "mcp__nuget__update_package", tool_input: {}, cwd: ws.mainDir }, ws.mainDir).json
          .hookSpecificOutput.permissionDecision,
        "allow",
      );
    } finally {
      ws.cleanup();
    }
  });
});
