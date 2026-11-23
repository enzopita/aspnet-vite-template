#!/usr/bin/env node
// Task tooling for planner → executor → reviewer work (ADR 0008). Usage: node scripts/agents/task.mjs help
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runVerify } from "../verify.mjs";
import {
  ALWAYS_ALLOWED,
  BRANCH_PREFIX,
  EXECUTOR_STATUSES,
  GENERATED,
  MAIN_BRANCH,
  MIGRATIONS,
  MIGRATION_SNAPSHOT,
  PROTECTED,
  REVIEW_BRANCH_PREFIX,
  REVIEWER_STATUSES,
  STATUSES,
  TASKS_DIR,
  currentBranch,
  findTaskFile,
  frozenBody,
  git,
  isReviewBranch,
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
  writeRole,
  writeState,
} from "./lib.mjs";

const HELP = `App task tooling (ADR 0008)

  list                         tasks and their status
  new <slug> --title "<t>"     create docs/tasks/NNNN-<slug>.md from the template (planner)
  start <id>                   create executor worktree (../<repo>-task-NNNN on task/NNNN-*) and mark in-progress
  review <id>                  create reviewer worktree (../<repo>-review-NNNN on review/NNNN-*) from task/* head
  brief <id>                   print the prompt to paste into the executor agent
  check [--staged|--ref <r>]   scope fence: paths, protected files, task file
        [--branch <b>] [--task <id>] [--json] [--hook]
  verify [--task <id>]         check + the quality gates for the touched areas + the task's own verify commands

Roles come from location (worktree .git/worktrees/<name>/agent-role), while the git/CI fence applies one rule per branch.`;

// ---------------------------------------------------------------------------------------------------------------
// code rules live in native analyzers, GovernanceTests, Oxlint, and scripts/lint-extra.mjs (PATTERNS is empty)

/** @type {never[]} */
export const PATTERNS = [];

// ---------------------------------------------------------------------------------------------------------------
// change collection

function collect(root, mode, ref) {
  const target = mode === "ref" ? ref : "HEAD";
  const base = tryGit(["merge-base", MAIN_BRANCH, target], { cwd: root });
  if (!base) throw new Error(`no merge-base between ${MAIN_BRANCH} and ${target}`);
  const firstCommit = tryGit(["rev-list", "--reverse", `${base}..${target}`], { cwd: root })
    ?.split("\n")
    .find(Boolean);

  const range = mode === "ref" ? [base, ref] : mode === "staged" ? ["--cached", base] : [base];
  const files = [];
  for (const line of git(["diff", "--name-status", "-M", ...range], { cwd: root }).split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    files.push({ status: status[0], path: paths.at(-1), from: paths.length > 1 ? paths[0] : undefined });
  }

  if (mode === "worktree") {
    for (const path of git(["ls-files", "--others", "--exclude-standard"], { cwd: root }).split("\n").filter(Boolean)) {
      files.push({ status: "A", path });
    }
  }

  const read = (path) =>
    mode === "worktree"
      ? existsSync(join(root, path))
        ? readFileSync(join(root, path), "utf8")
        : undefined
      : tryGit(["show", `${mode === "staged" ? "" : ref}:${path}`], { cwd: root });

  const currentSha = (path) =>
    mode === "worktree"
      ? existsSync(join(root, path))
        ? tryGit(["hash-object", "--", path], { cwd: root })
        : undefined
      : tryGit(["rev-parse", "--verify", `${mode === "staged" ? "" : ref}:${path}`], { cwd: root });

  return {
    base,
    firstCommit,
    files,
    read,
    currentSha,
    readBase: (path) => tryGit(["show", `${base}:${path}`], { cwd: root }),
    firstSha: (path) => (firstCommit ? tryGit(["rev-parse", "--verify", `${firstCommit}:${path}`], { cwd: root }) : undefined),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// check

function resolveTask(root, opts, branchName) {
  const id = opts.task ?? taskIdFromBranch(branchName);
  if (!id) return undefined;
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`task ${id}: no ${TASKS_DIR}/${id}-*.md`);
  return { id, file };
}

export function check(root, opts = {}) {
  const errors = [];
  const warnings = [];
  const branchName = opts.branch ?? (opts.mode === "ref" ? opts.ref : currentBranch(root));
  const task = resolveTask(root, opts, branchName);
  if (!task) return { skipped: true, errors, warnings };

  const review = isReviewBranch(branchName);
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

  // The spec is the contract: executors move `status` and "## Executor log"; reviewers may also update `status` and "## Review".
  for (const key of new Set([...Object.keys(base.meta), ...Object.keys(now.meta)])) {
    if (key === "status") continue;
    if (JSON.stringify(base.meta[key]) !== JSON.stringify(now.meta[key]))
      errors.push(`${task.file}: frontmatter \`${key}\` changed — only \`status\` is editable`);
  }
  const allowedStatuses = review ? REVIEWER_STATUSES : EXECUTOR_STATUSES;
  if (!STATUSES.includes(now.meta.status)) errors.push(`${task.file}: unknown status \`${now.meta.status}\``);
  else if (now.meta.status !== base.meta.status && !allowedStatuses.includes(now.meta.status))
    errors.push(`${task.file}: status \`${now.meta.status}\` is set by the reviewer; use ${allowedStatuses.join(" | ")}`);
  if (frozenBody(base.body, { allowReview: review }) !== frozenBody(now.body, { allowReview: review }))
    errors.push(
      `${task.file}: spec text changed — write only under "## Executor log"${review ? ' / "## Review"' : ""} (ticking checkboxes is fine)`,
    );

  const allow = list(base.meta.allow);
  const unlock = list(base.meta.unlock);
  const frozen = list(base.meta.frozen);
  for (const f of ch.files) {
    for (const path of [f.path, f.from].filter(Boolean)) {
      if (path === task.file) continue;
      if (matchesAny(path, frozen)) {
        const baseContent = ch.readBase(path);
        if (baseContent !== undefined) {
          errors.push(`${path}: frozen file (black-box contract test) — never modify frozen tests; if wrong, set status: blocked`);
          continue;
        }
        if (ch.firstCommit) {
          const firstBlob = ch.firstSha(path);
          if (firstBlob === undefined || ch.currentSha(path) !== firstBlob) {
            errors.push(
              `${path}: frozen file (black-box contract test) — never modify frozen tests after the initial task commit; if wrong, set status: blocked`,
            );
          }
          continue;
        }
        if (f.status !== "A") {
          errors.push(`${path}: frozen file (black-box contract test) — never modify frozen tests; if wrong, set status: blocked`);
        }
        continue;
      }
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

  const norm = (s) => s.replace(/\r\n/g, "\n").trim();
  const normalizedSpec = frozenBody(base.body).replace(/\r\n/g, "\n");
  for (const match of normalizedSpec.matchAll(/^```[a-z0-9_-]+[ \t]+([^\s`]+)[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)) {
    const specTestPath = match[1];
    const snippet = norm(match[2]);
    if (!snippet || /[<>]/.test(specTestPath) || !/(?:Tests\.cs|\.test\.[cm]?[jt]sx?)$/i.test(specTestPath)) continue;
    const actual = ch.read(specTestPath);
    if (!actual || !norm(actual).includes(snippet)) {
      warnings.push(`${specTestPath}: test diverges from the snippet in ${task.file} — justify the divergence in "## Executor log"`);
    }
  }

  return { task, status: now.meta.status, review, base: ch.base, errors, warnings, files: ch.files };
}

function printCheck(result) {
  if (result.skipped) {
    console.log("· not on a task/* or review/* branch — fence skipped");
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

function verify(root, opts) {
  process.chdir(root);
  const result = check(root, { ...opts, mode: "worktree" });
  printCheck(result);
  if (result.skipped) {
    console.error("✖ verify needs a task: run it on a task/* or review/* branch, or pass --task <id>");
    return 1;
  }
  if (result.errors.length) return 1;

  const task = readTask(root, result.task.file);
  const res = runVerify(root, { mode: "task", files: result.files, task });
  if (!res.ok) {
    console.error(`\n✖ verify failed at: ${res.failedCmd}\n  Fix the cause (never weaken the gate) and run verify again.`);
    writeState(root, `verify-${result.task.id}.json`, { ok: false, at: new Date().toISOString(), ran: res.ran });
    return 1;
  }

  // Gates may regenerate files (API client, catalogs): re-run the fence on the final tree before recording success.
  const after = check(root, { ...opts, mode: "worktree" });
  if (after.errors.length) {
    printCheck(after);
    return 1;
  }
  const fp = fingerprint(root, after.base);
  writeState(root, `verify-${result.task.id}.json`, { ok: true, at: new Date().toISOString(), fingerprint: fp, ran: res.ran });
  console.log(`\n✔ task ${result.task.id}: all ${res.gates.length} gate(s) passed.`);
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

function reviewBranchFor(task) {
  const suffix = task.file.replace(`${TASKS_DIR}/`, "").replace(/\.md$/, "");
  return `${REVIEW_BRANCH_PREFIX}${suffix}`;
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

function cmdStart(root, id) {
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`no task ${id}`);
  const task = readTask(root, file);
  if (!["ready", "changes-requested", "in-progress"].includes(task.meta.status))
    throw new Error(`task ${id} is \`${task.meta.status}\`; only ready / changes-requested tasks start`);
  if (tryGit(["cat-file", "-e", `${MAIN_BRANCH}:${file}`], { cwd: root }) === undefined)
    throw new Error(`${file} is not committed on ${MAIN_BRANCH} yet — commit the spec first`);
  const branch = branchFor(task);
  const exists = tryGit(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root });

  const dir = resolve(root, "..", `${basename(root)}-task-${task.meta.id}`);
  if (!existsSync(dir)) git(["worktree", "add", dir, ...(exists ? [branch] : ["-b", branch, MAIN_BRANCH])], { cwd: root });
  writeRole(dir, "executor");

  if (task.meta.status !== "in-progress") setStatus(join(dir, file), "in-progress");
  console.log(`✔ executor worktree for task ${task.meta.id}: ${dir} (${branch})\n`);
  cmdBrief(dir, id);
}

function cmdReview(root, id) {
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`no task ${id}`);
  const task = readTask(root, file);
  const taskBranch = branchFor(task);
  if (tryGit(["rev-parse", "--verify", "--quiet", `refs/heads/${taskBranch}`], { cwd: root }) === undefined)
    throw new Error(`task branch ${taskBranch} does not exist yet — run \`start ${id}\` first`);

  const reviewBranch = reviewBranchFor(task);
  const reviewExists = tryGit(["rev-parse", "--verify", "--quiet", `refs/heads/${reviewBranch}`], { cwd: root });
  const dir = resolve(root, "..", `${basename(root)}-review-${task.meta.id}`);
  if (!existsSync(dir)) {
    git(["worktree", "add", dir, ...(reviewExists ? [reviewBranch] : ["-b", reviewBranch, taskBranch])], { cwd: root });
  }
  writeRole(dir, "reviewer");

  console.log(`✔ reviewer worktree for task ${task.meta.id}: ${dir} (${reviewBranch})
Follow .agents/skills/review-task/SKILL.md:
- Review \`git diff ${MAIN_BRANCH}...HEAD\`, polish only inside the task's \`allow\` paths, and run \`node scripts/agents/task.mjs verify --task ${task.meta.id}\`.
- Changes outside \`allow\` belong to a new task or to ${MAIN_BRANCH} after merge.`);
}

function cmdBrief(root, id) {
  const file = findTaskFile(root, id);
  if (!file) throw new Error(`no task ${id}`);
  const task = readTask(root, file);
  console.log(`----- paste into the executor (Claude Code / Antigravity / OpenCode) -----
Worktree: ${root}
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
    else if (a === "--branch") opts.branch = argv[++i];
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
      return cmdStart(root, opts._[0]), 0;
    case "review":
      return cmdReview(root, opts._[0]), 0;
    case "brief":
      return cmdBrief(root, opts._[0]), 0;
    case "check": {
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
