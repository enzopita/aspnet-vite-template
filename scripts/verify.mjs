#!/usr/bin/env node
// Single source of truth for quality gates across task verification, lefthook pre-push, and CI workflows (ADR 0008 / 0009).
// Usage: node scripts/verify.mjs --mode task|pre-push|ci [--area all|backend|web] [--task <id>] [--dry-run] [--json]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAIN_BRANCH,
  currentBranch,
  findTaskFile,
  git,
  list,
  readTask,
  repoRoot,
  taskIdFromBranch,
  tryGit,
} from "./agents/lib.mjs";

const HELP = `App gate runner

  node scripts/verify.mjs --mode task [--task <id>] [--dry-run] [--json]
  node scripts/verify.mjs --mode pre-push [--dry-run] [--json]
  node scripts/verify.mjs --mode ci [--area all|backend|web] [--dry-run] [--json]`;

/** Race tests pass by luck often enough that one green run proves little; verify repeats each changed class. */
export const CONCURRENCY_RUNS = 10;
export const CONCURRENCY_TEST = /^tests\/([^/]+)\/(?:.+\/)?(\w+ConcurrencyTests)\.cs$/;

const PRE_PUSH_GATES = [
  "dotnet build App.slnx --nologo -v quiet",
  "dotnet format App.slnx --verify-no-changes --no-restore",
  "pnpm --dir web run --silent api:generate",
  "pnpm --dir web run --silent build",
  "node scripts/check-generated.mjs",
  "dotnet test --solution App.slnx --no-build",
  "pnpm --dir web run --silent check",
  "pnpm --dir web run --silent test",
  "node --test scripts/",
  "pnpm --dir web run --silent i18n:extract",
  "node scripts/check-i18n.mjs",
  "pnpm --dir web exec react-doctor . --yes --no-score --blocking warning",
];

const CI_BACKEND_GATES = [
  "dotnet build App.slnx --configuration Release --nologo",
  "git diff --exit-code -- web/openapi",
  "dotnet format App.slnx --verify-no-changes --no-restore",
  "dotnet test --solution App.slnx --no-build --configuration Release",
];

const CI_WEB_GATES = [
  "pnpm --dir web run --silent api:generate",
  "pnpm --dir web run --silent build",
  "node scripts/check-generated.mjs",
  "pnpm --dir web run --silent check",
  "pnpm --dir web run --silent test",
  "node --test scripts/",
  "pnpm --dir web run --silent i18n:extract",
  "node scripts/check-i18n.mjs",
  "pnpm --dir web exec react-doctor . --yes --no-score --blocking warning",
];

export function collectWorktreeChanges(root) {
  const base = tryGit(["merge-base", MAIN_BRANCH, "HEAD"], { cwd: root });
  if (!base) throw new Error(`no merge-base between ${MAIN_BRANCH} and HEAD`);

  const files = [];
  for (const line of git(["diff", "--name-status", "-M", base], { cwd: root }).split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    files.push({ status: status[0], path: paths.at(-1), from: paths.length > 1 ? paths[0] : undefined });
  }

  for (const path of git(["ls-files", "--others", "--exclude-standard"], { cwd: root }).split("\n").filter(Boolean)) {
    files.push({ status: "A", path });
  }

  return { base, files };
}

function taskGates({ files = [], task, root = process.cwd(), hasWebNodeModules }) {
  const paths = files.flatMap((f) => [f.path, f.from].filter(Boolean));
  const dotnet = paths.some((p) => /\.(cs|csproj|props|targets|slnx)$/.test(p) || /^(src|tests|governance)\//.test(p));
  const web = paths.some((p) => p.startsWith("web/"));
  const routes = paths.some((p) => p.startsWith("web/src/routes/"));
  const ui = paths.some((p) => p.startsWith("web/src/") && p.endsWith(".tsx"));
  const webModulesPresent = hasWebNodeModules ?? existsSync(join(root, "web", "node_modules"));

  const gates = [];
  if (dotnet) gates.push("dotnet build App.slnx --nologo -v quiet");
  if (dotnet && webModulesPresent) gates.push("pnpm --dir web run --silent api:generate");
  if (routes) gates.push("pnpm --dir web run --silent build");
  if (web || dotnet) gates.push("pnpm --dir web run --silent check", "pnpm --dir web run --silent test");
  if (web) gates.push("pnpm --dir web run --silent i18n:extract", "node scripts/check-i18n.mjs");
  // Same command as pre-push / CI, so UI issues surface before commit or push.
  if (ui) gates.push("pnpm --dir web exec react-doctor . --yes --no-score --blocking warning");
  if (dotnet) {
    gates.push(
      "dotnet format App.slnx --verify-no-changes --no-restore",
      "dotnet test --project tests/App.ArchitectureTests --no-build",
    );
  }

  const races = files
    .filter((f) => f.status !== "D")
    .map((f) => CONCURRENCY_TEST.exec(f.path))
    .filter(Boolean)
    .map(([, project, cls]) => `dotnet test --project tests/${project} --no-build -- --filter-class "*.${cls}"`);
  const repeated = races.flatMap((cmd) => Array.from({ length: CONCURRENCY_RUNS }, () => cmd));

  return [...gates, ...list(task?.meta?.verify), ...repeated];
}

export function planGates(mode, options = {}) {
  switch (mode) {
    case "task":
      return taskGates(options);
    case "pre-push":
      return [...PRE_PUSH_GATES];
    case "ci": {
      const area = options.area ?? "all";
      if (area === "backend") return [...CI_BACKEND_GATES];
      if (area === "web") return [...CI_WEB_GATES];
      if (area === "all") return [...CI_BACKEND_GATES, ...CI_WEB_GATES];
      throw new Error(`unknown CI area: ${area} (expected all | backend | web)`);
    }
    default:
      throw new Error(`unknown verify mode: ${mode} (expected task | pre-push | ci)`);
  }
}

export function runVerify(root, options = {}) {
  const mode = options.mode;
  let files = options.files;
  let task = options.task;

  if (mode === "task") {
    if (!files) files = collectWorktreeChanges(root).files;
    if (!task) {
      const id = options.taskId ?? taskIdFromBranch(currentBranch(root));
      const file = id && findTaskFile(root, id);
      if (file) task = readTask(root, file);
    }
  }

  const gates = planGates(mode, { ...options, root, files, task });
  if (options.dryRun) return { ok: true, mode, area: options.area ?? "all", gates, ran: [] };

  const ran = [];
  for (const cmd of gates) {
    console.log(`\n▶ ${cmd}`);
    const started = Date.now();
    const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: root });
    const ok = r.status === 0;
    ran.push({ cmd, ok, seconds: Math.round((Date.now() - started) / 1000) });
    if (!ok) return { ok: false, mode, area: options.area ?? "all", gates, ran, failedCmd: cmd };
  }

  return { ok: true, mode, area: options.area ?? "all", gates, ran };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") opts.mode = argv[++i];
    else if (a === "--area") opts.area = argv[++i];
    else if (a === "--task") opts.task = argv[++i]?.padStart(4, "0");
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h" || a === "help") opts.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.mode) {
    console.log(HELP);
    return opts.help ? 0 : 1;
  }

  const root = repoRoot();
  const res = runVerify(root, {
    mode: opts.mode,
    area: opts.area,
    taskId: opts.task,
    dryRun: opts.dryRun,
  });

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify({ mode: res.mode, area: res.area, gates: res.gates }, null, 2));
    else for (const g of res.gates) console.log(g);
    return 0;
  }

  if (!res.ok) {
    console.error(`\n✖ verify (${res.mode}) failed at: ${res.failedCmd}`);
    return 1;
  }

  console.log(`\n✔ verify (${res.mode}): all ${res.gates.length} gate(s) passed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  }
}
