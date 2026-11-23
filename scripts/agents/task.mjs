#!/usr/bin/env node
// Task tooling for planner → executor → reviewer work (ADR 0008). Usage: node scripts/agents/task.mjs help
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ALWAYS_ALLOWED,
  BRANCH_PREFIX,
  EXECUTOR_STATUSES,
  GENERATED,
  MAIN_BRANCH,
  MIGRATIONS,
  MIGRATION_SNAPSHOT,
  PROTECTED,
  STATUSES,
  TASKS_DIR,
  currentBranch,
  findTaskFile,
  frozenBody,
  git,
  list,
  matchesAny,
  parseTask,
  readState,
  readTask,
  repoRoot,
  sha256,
  taskFiles,
  taskIdFromBranch,
  tryGit,
  writeState,
} from "./lib.mjs";

const HELP = `App task tooling (ADR 0008)

  list                         tasks and their status
  new <slug> --title "<t>"     create docs/tasks/NNNN-<slug>.md from the template (planner)
  start <id> [--worktree]      create/checkout the task branch (or a sibling worktree) and mark it in-progress
  brief <id>                   print the prompt to paste into the executor agent
  check [--staged|--ref <r>]   scope fence: paths, protected files, task file, forbidden patterns
        [--task <id>] [--json] [--hook]
  verify [--task <id>]         check + the quality gates for the touched areas + the task's own verify commands

The fence is off outside task/* branches. Reviewers and humans may bypass it with APP_TASK_FENCE=off;
executor agents are blocked from doing so by their harness adapters.`;

// ---------------------------------------------------------------------------------------------------------------
// forbidden patterns in added lines

const CODE = ["**/*.cs", "**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.css"];
const WEB_UI = ["web/src/**/*.tsx", "web/src/**/*.ts", "web/src/**/*.css"];
const TESTS = ["tests/**", "web/src/**/*.test.ts", "web/src/**/*.test.tsx"];
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";

/** @type {{ files: string[], except?: string[], re: RegExp, level: "error" | "warning", message: string }[]} */
const PATTERNS = [
  {
    files: ["**/*.cs"],
    except: [MIGRATIONS], // `dotnet ef` emits `#pragma warning disable 612, 618` in every generated migration
    re: /#pragma\s+warning\s+disable/,
    level: "error",
    message: "warning suppressed — fix the cause",
  },
  { files: ["**/*.cs"], re: /SuppressMessage\s*\(/, level: "error", message: "analyzer suppressed — fix the cause" },
  {
    files: ["**/*.csproj", "**/*.props"],
    re: /<NoWarn>|<TreatWarningsAsErrors>\s*false|<Nullable>\s*(disable|annotations)|<WarningsNotAsErrors>/i,
    level: "error",
    message: "build strictness lowered",
  },
  { files: ["**/*.cs"], re: /\b(Skip\s*=\s*"|\[Ignore)/, level: "error", message: "test skipped" },
  {
    files: ["tests/**/*.cs"],
    re: /\?\.[\w.]*\bShould\w*\s*\(/,
    level: "error",
    message: "assertion behind `?.` is skipped when the value is null — assert it with ShouldNotBeNull() first",
  },
  {
    files: ["tests/**/*.cs"],
    re: /\bStatusCode\.ShouldNotBe\s*\(/,
    level: "error",
    message: "negative status assertion passes for any other status — assert the exact expected status",
  },
  {
    files: ["tests/**/*.cs"],
    re: /[)\]]\s*!(?!=)/,
    level: "error",
    message: "null-forgiving `!` hides a null — assert ShouldNotBeNull() or use a non-null API (e.g. StringValues.ToString())",
  },
  {
    files: ["src/**/*.cs"],
    re: /\bDateTime(Offset)?\.(Now|UtcNow|Today)\b/,
    level: "error",
    message: "ambient clock — inject TimeProvider (instants are DateTimeOffset in UTC)",
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs"],
    re: /@ts-(ignore|nocheck|expect-error)|(oxlint|eslint)-disable/,
    level: "error",
    message: "type/lint check suppressed — fix the cause",
  },
  { files: ["**/*.ts", "**/*.tsx"], re: /\bas\s+any\b|:\s*any\b|<any>|\bas\s+unknown\s+as\b/, level: "error", message: "`any` / double cast" },
  { files: ["**/*.ts", "**/*.tsx"], re: /\b(it|test|describe)\.(only|skip)\s*\(/, level: "error", message: "focused or skipped test" },
  {
    files: WEB_UI,
    except: ["web/src/styles/**"],
    re: new RegExp(`\\b(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|shadow|accent|caret|decoration)-(${PALETTE})(-\\d{2,3})?(\\/\\d+)?\\b`),
    level: "error",
    message: "raw palette color — use design tokens (bg-surface, text-positive…)",
  },
  {
    files: WEB_UI,
    except: ["web/src/styles/**"],
    re: /-\[(#|rgb|hsl|oklch)|(["'`\s(:])#[0-9a-fA-F]{3,8}\b(?!-)/,
    level: "error",
    message: "raw color value — use design tokens",
  },
  {
    files: WEB_UI,
    except: ["web/src/styles/**"],
    re: /\b(duration|delay)-(\d+|\[)/,
    level: "error",
    message: "magic duration — use motion tokens (duration-fast…)",
  },
  { files: ["web/src/**/*.tsx"], re: />\s*[A-Za-z][A-Za-z ,.'!?:-]{3,}\s*</, level: "warning", message: "literal UI text? wrap it in <Trans>" },
  { files: ["web/src/**"], re: /\bconsole\.(log|debug)\b/, level: "warning", message: "console logging left in" },
  { files: CODE, re: /\b(TODO|FIXME|HACK|XXX)\b/, level: "warning", message: "unfinished-work marker" },
];

// ---------------------------------------------------------------------------------------------------------------
// change collection

function collect(root, mode, ref) {
  const target = mode === "ref" ? ref : "HEAD";
  const base = tryGit(["merge-base", MAIN_BRANCH, target], { cwd: root });
  if (!base) throw new Error(`no merge-base between ${MAIN_BRANCH} and ${target}`);

  const range = mode === "ref" ? [base, ref] : mode === "staged" ? ["--cached", base] : [base];
  const files = [];
  for (const line of git(["diff", "--name-status", "-M", ...range], { cwd: root }).split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    files.push({ status: status[0], path: paths.at(-1), from: paths.length > 1 ? paths[0] : undefined });
  }
  let patch = git(["diff", "-U0", "--no-color", "--no-ext-diff", ...range], { cwd: root });

  if (mode === "worktree") {
    for (const path of git(["ls-files", "--others", "--exclude-standard"], { cwd: root }).split("\n").filter(Boolean)) {
      files.push({ status: "A", path });
      let content = "";
      try {
        content = readFileSync(join(root, path), "utf8");
      } catch {}
      if (!content.includes("\0")) patch += `\n+++ b/${path}\n${content.split(/\r?\n/).map((l, i) => `@@ -0,0 +${i + 1} @@\n+${l}`).join("\n")}`;
    }
  }

  const read = (path) =>
    mode === "worktree"
      ? existsSync(join(root, path))
        ? readFileSync(join(root, path), "utf8")
        : undefined
      : tryGit(["show", `${mode === "staged" ? "" : ref}:${path}`], { cwd: root });

  return { base, files, patch, read, readBase: (path) => tryGit(["show", `${base}:${path}`], { cwd: root }) };
}

function addedLines(patch) {
  const out = [];
  let file;
  let line = 0;
  for (const l of patch.split("\n")) {
    if (l.startsWith("+++ ")) file = l.replace(/^\+\+\+ (b\/)?/, "").trim();
    else if (l.startsWith("@@")) line = Number(/\+(\d+)/.exec(l)?.[1] ?? 0);
    else if (l.startsWith("+") && file && file !== "/dev/null") out.push({ file, line: line++, text: l.slice(1) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// check

function resolveTask(root, opts, ref) {
  const id = opts.task ?? taskIdFromBranch(opts.mode === "ref" ? ref : currentBranch(root));
  if (!id) return undefined;
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`task ${id}: no ${TASKS_DIR}/${id}-*.md`);
  return { id, file };
}

export function check(root, opts = {}) {
  const errors = [];
  const warnings = [];
  const task = resolveTask(root, opts, opts.ref);
  if (!task) return { skipped: true, errors, warnings };

  const ch = collect(root, opts.mode ?? "worktree", opts.ref);
  const baseText = ch.readBase(task.file);
  if (!baseText) {
    errors.push(`${task.file}: not on ${MAIN_BRANCH} — the planner commits the spec to ${MAIN_BRANCH} before work starts`);
    return { task, errors, warnings, files: ch.files };
  }
  const base = parseTask(baseText);
  const nowText = ch.read(task.file);
  if (!nowText) {
    errors.push(`${task.file}: deleted`);
    return { task, errors, warnings, files: ch.files };
  }
  let now;
  try {
    now = parseTask(nowText);
  } catch (e) {
    errors.push(`${task.file}: ${e.message}`);
    return { task, errors, warnings, files: ch.files };
  }

  // The spec is the contract: the executor only moves `status` and writes the "Executor log" section.
  for (const key of new Set([...Object.keys(base.meta), ...Object.keys(now.meta)])) {
    if (key === "status") continue;
    if (JSON.stringify(base.meta[key]) !== JSON.stringify(now.meta[key]))
      errors.push(`${task.file}: frontmatter \`${key}\` changed — only \`status\` is the executor's`);
  }
  if (!STATUSES.includes(now.meta.status)) errors.push(`${task.file}: unknown status \`${now.meta.status}\``);
  else if (now.meta.status !== base.meta.status && !EXECUTOR_STATUSES.includes(now.meta.status))
    errors.push(`${task.file}: status \`${now.meta.status}\` is set by the reviewer; use ${EXECUTOR_STATUSES.join(" | ")}`);
  if (frozenBody(base.body) !== frozenBody(now.body))
    errors.push(`${task.file}: spec text changed — write only under "## Executor log" (ticking checkboxes is fine)`);

  const allow = list(base.meta.allow);
  const unlock = list(base.meta.unlock);
  for (const f of ch.files) {
    for (const path of [f.path, f.from].filter(Boolean)) {
      if (path === task.file) continue;
      if (matchesAny(path, unlock)) continue;
      if (matchesAny(path, [...GENERATED, ...ALWAYS_ALLOWED])) continue;
      if (matchesAny(path, [MIGRATIONS]) && f.status !== "A" && !matchesAny(path, [MIGRATION_SNAPSHOT])) {
        errors.push(`${path}: existing migration changed — migrations are append-only; add a new one`);
      } else if (matchesAny(path, PROTECTED)) {
        errors.push(`${path}: protected file (rules, gates or dependencies) — stop and report in the Executor log`);
      } else if (!matchesAny(path, allow)) {
        errors.push(`${path}: outside the task's \`allow\` paths`);
      }
    }
  }

  for (const { file, line, text } of addedLines(ch.patch)) {
    if (file.startsWith(`${TASKS_DIR}/`) || matchesAny(file, GENERATED)) continue;
    for (const p of PATTERNS) {
      if (!matchesAny(file, p.files) || (p.except && matchesAny(file, p.except))) continue;
      if (p.level === "warning" && matchesAny(file, TESTS)) continue;
      if (p.re.test(text)) (p.level === "error" ? errors : warnings).push(`${file}:${line}: ${p.message}  ⟶  ${text.trim().slice(0, 100)}`);
    }
  }

  return { task, status: now.meta.status, base: ch.base, errors, warnings, files: ch.files };
}

function printCheck(result) {
  if (result.skipped) {
    console.log("· not on a task branch — fence skipped");
    return;
  }
  for (const w of result.warnings) console.log(`⚠ ${w}`);
  for (const e of result.errors) console.error(`✖ ${e}`);
  if (result.errors.length === 0)
    console.log(`✔ task ${result.task.id}: fence passed (${result.files?.length ?? 0} file(s) changed, ${result.warnings.length} warning(s))`);
  else console.error(`\n✖ task ${result.task.id}: ${result.errors.length} fence violation(s). See AGENTS.md → "Executor agents".`);
}

// ---------------------------------------------------------------------------------------------------------------
// verify

/** Identity of the tree's changes vs `base` (task files excluded), the same whether committed, staged or not. */
export function fingerprint(root, base) {
  const scope = ["--", ".", `:(exclude)${TASKS_DIR}`];
  const paths = new Set(
    [
      ...git(["diff", "--name-only", "--no-renames", base, ...scope], { cwd: root }).split("\n"),
      ...git(["ls-files", "--others", "--exclude-standard", ...scope], { cwd: root }).split("\n"),
    ].filter(Boolean),
  );
  const entries = [...paths].sort().map((p) => {
    try {
      return `${p}:${sha256(readFileSync(join(root, p)))}`;
    } catch {
      return `${p}:deleted`;
    }
  });
  return sha256(entries.join("\n"));
}

/** Race tests pass by luck often enough that one green run proves little; verify repeats each changed class. */
export const CONCURRENCY_RUNS = 10;
const CONCURRENCY_TEST = /^tests\/([^/]+)\/(?:.+\/)?(\w+ConcurrencyTests)\.cs$/;

export function gatesFor(files, task) {
  const paths = files.flatMap((f) => [f.path, f.from].filter(Boolean));
  const dotnet = paths.some((p) => /\.(cs|csproj|props|slnx)$/.test(p) || /^(src|tests)\//.test(p));
  const web = paths.some((p) => p.startsWith("web/"));
  const routes = paths.some((p) => p.startsWith("web/src/routes/"));
  const gates = [];
  if (dotnet) gates.push("dotnet build App.slnx --nologo -v quiet");
  if (dotnet && existsSync("web/node_modules")) gates.push("pnpm --dir web run --silent api:generate");
  if (routes) gates.push("pnpm --dir web run --silent build");
  if (web || dotnet) {
    gates.push("pnpm --dir web run --silent check");
    gates.push("pnpm --dir web run --silent test");
  }
  if (web) gates.push("pnpm --dir web run --silent i18n:extract", "node scripts/check-i18n.mjs");
  // Same command as the pre-push hook, so an executor sees React Doctor warnings before it commits, not after.
  const ui = paths.some((p) => p.startsWith("web/src/") && p.endsWith(".tsx"));
  if (ui) gates.push("pnpm --dir web exec react-doctor . --yes --no-score --blocking warning");
  if (dotnet) {
    gates.push("dotnet format App.slnx --verify-no-changes --no-restore");
    gates.push("dotnet test --project tests/App.ArchitectureTests --no-build");
  }
  const races = files
    .filter((f) => f.status !== "D")
    .map((f) => CONCURRENCY_TEST.exec(f.path))
    .filter(Boolean)
    .map(([, project, cls]) => `dotnet test --project tests/${project} --no-build -- --filter-class "*.${cls}"`);
  const repeated = races.flatMap((cmd) => Array.from({ length: CONCURRENCY_RUNS }, () => cmd));
  return [...gates, ...list(task.meta.verify), ...repeated];
}

function verify(root, opts) {
  process.chdir(root);
  const result = check(root, { ...opts, mode: "worktree" });
  printCheck(result);
  if (result.skipped) {
    console.error("✖ verify needs a task: run it on a task/* branch or pass --task <id>");
    return 1;
  }
  // Reviewers polish task branches outside `allow` (docs/tasks/README.md); executor harnesses block this variable.
  const reviewer = process.env.APP_TASK_FENCE === "off";
  if (result.errors.length && !reviewer) return 1;
  if (result.errors.length) console.log("⚠ APP_TASK_FENCE=off: fence violations ignored, running the gates anyway");

  const task = readTask(root, result.task.file);
  const gates = gatesFor(result.files, task);
  const ran = [];
  for (const cmd of gates) {
    console.log(`\n▶ ${cmd}`);
    const started = Date.now();
    const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: root });
    const ok = r.status === 0;
    ran.push({ cmd, ok, seconds: Math.round((Date.now() - started) / 1000) });
    if (!ok) {
      console.error(`\n✖ verify failed at: ${cmd}\n  Fix the cause (never weaken the gate) and run verify again.`);
      writeState(root, `verify-${result.task.id}.json`, { ok: false, at: new Date().toISOString(), ran });
      return 1;
    }
  }

  // Gates may regenerate files (API client, catalogs): re-run the fence on the final tree before recording success.
  const after = check(root, { ...opts, mode: "worktree" });
  if (reviewer) {
    console.log(`
✔ task ${result.task.id}: all ${gates.length} gate(s) passed (fence bypassed, nothing recorded).`);
    return 0;
  }
  if (after.errors.length) {
    printCheck(after);
    return 1;
  }
  const fp = fingerprint(root, after.base);
  writeState(root, `verify-${result.task.id}.json`, { ok: true, at: new Date().toISOString(), fingerprint: fp, ran });
  console.log(`\n✔ task ${result.task.id}: all ${gates.length} gate(s) passed. Commit, then set status: review.`);
  return 0;
}

export function isVerified(root, id, base) {
  const state = readState(root, `verify-${id}.json`);
  return Boolean(state?.ok && state.fingerprint === fingerprint(root, base));
}

// ---------------------------------------------------------------------------------------------------------------
// planner / workflow commands

function setStatus(path, status) {
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace(/^(---\r?\n[\s\S]*?^status:\s*)[^\r\n#]*?(\s*(#.*)?)$/m, `$1${status}$2`));
}

function branchFor(task) {
  return task.meta.branch || `${BRANCH_PREFIX}${task.file.replace(`${TASKS_DIR}/`, "").replace(/\.md$/, "")}`;
}

function cmdList(root) {
  const rows = taskFiles(root).map((f) => {
    const t = readTask(root, f);
    return [t.meta.id, t.meta.status, t.meta.executor ?? "any", t.meta.title];
  });
  if (!rows.length) return console.log("no tasks yet — the planner creates them with `new`");
  for (const r of rows) console.log(`${r[0]}  ${String(r[1]).padEnd(18)} ${String(r[2]).padEnd(9)} ${r[3]}`);
}

function cmdNew(root, slug, title) {
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("usage: new <kebab-slug> --title \"<title>\"");
  const last = taskFiles(root).map((f) => Number(/(\d{4})-/.exec(f)[1])).sort((a, b) => b - a)[0] ?? 0;
  const id = String(last + 1).padStart(4, "0");
  const file = `${TASKS_DIR}/${id}-${slug}.md`;
  const template = readFileSync(join(root, TASKS_DIR, "_template.md"), "utf8");
  writeFileSync(
    join(root, file),
    template.replaceAll("{{id}}", id).replaceAll("{{slug}}", slug).replaceAll("{{title}}", title ?? slug.replace(/-/g, " ")),
  );
  console.log(file);
}

function cmdStart(root, id, worktree) {
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`no task ${id}`);
  const task = readTask(root, file);
  if (!["ready", "changes-requested", "in-progress"].includes(task.meta.status))
    throw new Error(`task ${id} is \`${task.meta.status}\`; only ready / changes-requested tasks start`);
  if (tryGit(["cat-file", "-e", `${MAIN_BRANCH}:${file}`], { cwd: root }) === undefined)
    throw new Error(`${file} is not committed on ${MAIN_BRANCH} yet — commit the spec first`);
  const branch = branchFor(task);
  const exists = tryGit(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root });

  let dir = root;
  if (worktree) {
    dir = resolve(root, "..", `${root.split(/[\\/]/).pop()}-task-${task.meta.id}`);
    if (!existsSync(dir)) git(["worktree", "add", dir, ...(exists ? [branch] : ["-b", branch, MAIN_BRANCH])], { cwd: root });
  } else {
    if (git(["status", "--porcelain", "--untracked-files=no"], { cwd: root })) throw new Error("working tree has changes — commit or stash first");
    git(["switch", ...(exists ? [branch] : ["-c", branch, MAIN_BRANCH])], { cwd: root });
  }
  if (task.meta.status !== "in-progress") setStatus(join(dir, file), "in-progress");
  console.log(`✔ task ${task.meta.id} on ${branch}${worktree ? ` in ${dir}` : ""}\n`);
  cmdBrief(dir, id);
}

function cmdBrief(root, id) {
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`no task ${id}`);
  const task = readTask(root, file);
  console.log(`----- paste into the executor (Antigravity / OpenCode) -----
You are the EXECUTOR for task ${task.meta.id} ("${task.meta.title}") in the App repository.

1. Read AGENTS.md completely, then ${file} completely, then every file the task lists under "Context" and
   "Reference implementation". Do not start editing before you have read them.
2. Follow the execute-task skill (.agents/skills/execute-task/SKILL.md) step by step.
3. Change only the paths in the task's \`allow\` list. Copy the structure of the reference implementation;
   do not invent new patterns, libraries or folders.
4. Run \`node scripts/agents/task.mjs check\` after each step and \`node scripts/agents/task.mjs verify\` at the end.
   Done means verify passed, the work is committed (Conventional Commits, English, scope \`${task.meta.scope ?? "<scope>"}\`),
   the Executor log is filled in and status is \`review\`.
5. If anything in the spec is impossible or contradicts the code, set status \`blocked\`, explain why in the
   Executor log, and stop. Never work around a gate.
------------------------------------------------------------`);
}

// ---------------------------------------------------------------------------------------------------------------
// main

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--staged") opts.mode = "staged";
    else if (a === "--ref") (opts.mode = "ref"), (opts.ref = argv[++i]);
    else if (a === "--task") opts.task = argv[++i]?.padStart(4, "0");
    else if (a === "--title") opts.title = argv[++i];
    else if (a.startsWith("--")) opts[a.slice(2)] = true;
    else opts._.push(a);
  }
  return opts;
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  const root = repoRoot();
  switch (cmd) {
    case "list":
      return cmdList(root), 0;
    case "new":
      return cmdNew(root, opts._[0], opts.title), 0;
    case "start":
      return cmdStart(root, opts._[0], opts.worktree), 0;
    case "brief":
      return cmdBrief(root, opts._[0]), 0;
    case "check": {
      if (opts.hook && process.env.APP_TASK_FENCE === "off") return 0;
      const result = check(root, opts);
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else if (!(opts.hook && result.skipped)) printCheck(result);
      return result.errors.length ? 1 : 0;
    }
    case "verify":
      return verify(root, opts);
    default:
      console.log(HELP);
      return cmd && cmd !== "help" ? 1 : 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  }
}
