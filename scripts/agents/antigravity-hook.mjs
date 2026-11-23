#!/usr/bin/env node
// Antigravity lifecycle hooks for executor agents (ADR 0008). Wired in .agents/hooks.json.
//   session-start  tells the agent which task is active and how to work on it
//   pre-tool       blocks hook bypasses, pushes, history rewrites, dependency changes and edits to protected files
//   stop           keeps the agent going until the fence passes, verify passed, work is committed and status is set
// Contract: JSON on stdin, JSON on stdout (Antigravity hooks guide). PreToolUse output must carry a `decision`:
// Antigravity reads `{}` as a deny with an empty reason, so every pre-tool path answers `allow` or `deny` explicitly.
// Any internal failure fails open (`allow` / `{}`) — the git hooks (lefthook → task.mjs check) still enforce the
// fence on commit.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GENERATED,
  PROTECTED,
  currentBranch,
  findTaskFile,
  list,
  matchesAny,
  readTask,
  taskIdFromBranch,
  toRepoPath,
  tryGit,
} from "./lib.mjs";
import { check, isVerified } from "./task.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const reply = (obj) => process.stdout.write(JSON.stringify(obj));

const DENY_COMMANDS = [
  [/--no-verify\b|\bgit\b[^|;&]*\bcommit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, "skipping git hooks is not allowed — fix what the hook reports"],
  [/\bLEFTHOOK(_EXCLUDE|_SKIP)?\s*=|\blefthook\s+(uninstall|install)\b|core\.hooksPath/i, "changing or disabling git hooks is not allowed"],
  [/\bAPP_TASK_FENCE\b/, "the task fence cannot be turned off by an executor"],
  [/\bgit\s+push\b/, "executors never push — the reviewer integrates the branch"],
  [/\bgit\s+(reset\s+--hard|clean\s+-\w*f|rebase|filter-branch|filter-repo|update-ref|tag|merge)\b/, "history-rewriting / integration git commands are the reviewer's job"],
  [/\bgit\s+(branch\s+-[dDmM]|stash\s+(drop|clear)|checkout\s+(main|master)\b|switch\s+(main|master)\b)/, "stay on the task branch and keep its history"],
  [/\b(pnpm|npm|npx|yarn|bun)\b(\s+(--?[\w-]+(=\S+)?|(--dir|-C|--filter|--prefix)\s+\S+))*\s+(add|remove|rm|uninstall|update|up|upgrade|dlx\s+shadcn|i\s+[^-\s]|install\s+[^-\s])/,"adding/removing/updating packages needs the planner (task `unlock`)"],
  [/\bdotnet\s+(add\s+\S+\s+package|add\s+package|remove\s+\S+\s+package|package\s+(add|remove|update))\b|\bdotnet\s+outdated\b/, "adding/removing NuGet packages needs the planner (task `unlock`)"],
  [/\bdotnet\s+ef\s+migrations\s+remove\b/, "migrations are append-only — add a new one instead"],
];

const WRITE_COMMANDS = /^(rm|del|erase|rmdir|rd|mv|move|cp|copy|xcopy|robocopy|ren|rename|truncate|touch|tee|chmod|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Clear-Content|ni|ri|mi|ci|sc|ac)$/i;
const INPLACE_EDIT = /\b(sed|perl)\s+-\w*[ip]/;

/** Paths a shell command would write: redirect targets, and every argument of a file-writing command. */
function writeTargets(cmd) {
  const targets = [];
  for (const m of cmd.matchAll(/(?<![0-9&])>{1,2}\s*(?!&)([^\s|;&<>]+)/g)) targets.push(m[1]);
  for (const segment of cmd.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/).filter((w) => !/^\w+=/.test(w));
    if (words.length && (WRITE_COMMANDS.test(words[0]) || INPLACE_EDIT.test(segment)))
      targets.push(...words.slice(1).filter((w) => !w.startsWith("-")));
  }
  return targets.map((t) => t.replace(/^["'`]|["'`]$/g, ""));
}

const COMMAND_TOOLS = /^(run_command|shell_exec|send_command_input|git_commit)$/;
const WRITE_TOOLS = /^(code_action|file_change|write_blob|move|delete_directory|propose_code|edit_notebook)$/;
const MCP_WRITE_HINT = /\b(apply|edit|write|create|delete|remove|move|rename|patch|replace)/i;
const MCP_EXEC_HINT = /\b(run|exec|command|check|shell|terminal)/i;

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

function activeTask() {
  const id = taskIdFromBranch(currentBranch(root));
  const file = id && findTaskFile(root, id);
  if (!file) return undefined;
  try {
    return readTask(root, file);
  } catch {
    return { file, meta: { id } };
  }
}

/** Protected for this agent right now: protected or generated, minus the active task's own file and its `unlock`. */
function protectedPath(path, task) {
  if (task && (path === task.file || matchesAny(path, list(task.meta.unlock)))) return false;
  return matchesAny(path, PROTECTED) || matchesAny(path, GENERATED);
}

function preTool(input) {
  const name = String(input.toolCall?.name ?? "").toLowerCase();
  const args = input.toolCall?.args ?? {};
  const values = strings(args);
  const isMcp = name === "mcp_tool";
  const blob = JSON.stringify(args);
  const task = activeTask();

  if (COMMAND_TOOLS.test(name) || (isMcp && MCP_EXEC_HINT.test(blob))) {
    for (const cmd of values) {
      for (const [re, why] of DENY_COMMANDS) if (re.test(cmd)) return deny(why, cmd);
      for (const target of writeTargets(cmd)) {
        const path = toRepoPath(root, target);
        if (path && protectedPath(path, task)) return deny(`${path} is protected — executors don't change it (regenerate generated files with their tool)`, cmd);
      }
    }
  }

  if (WRITE_TOOLS.test(name) || (isMcp && MCP_WRITE_HINT.test(blob))) {
    for (const v of values) {
      if (v.length > 400 || /\n/.test(v)) continue; // file contents, not paths
      const path = toRepoPath(root, v);
      if (path && protectedPath(path, task))
        return deny(
          matchesAny(path, GENERATED)
            ? `${path} is generated — run its generator (pnpm --dir web api:generate / build), never edit it`
            : `${path} is protected (rules, gates, dependencies or the spec). If the task can't be done without it, set status: blocked and explain in the Executor log.`,
        );
    }
  }
  return ALLOW;
}

const ALLOW = { decision: "allow" };
const deny = (reason, cmd) => ({ decision: "deny", reason: `App guard: ${reason}${cmd ? `\n  command: ${cmd.slice(0, 200)}` : ""}` });

function stop(input) {
  if (input.continuationActive && Number(input.executionNum ?? 0) >= 3) return {};
  const task = activeTask();
  if (!task) return {};
  if (task.meta.status === "blocked") return {};

  const result = check(root, { mode: "worktree" });
  const keepGoing = (reason) => ({
    decision: "continue",
    reason: `Task ${task.meta.id} is not finished. ${reason}\nIf you genuinely cannot continue or need the user, set \`status: blocked\` in ${task.file}, explain in "## Executor log", commit, and stop.`,
  });

  if (result.errors.length)
    return keepGoing(`The task fence fails:\n${result.errors.map((e) => `- ${e}`).join("\n")}\nUndo or fix these (run \`node scripts/agents/task.mjs check\`).`);

  const touched = result.files.filter((f) => f.path !== task.file);
  if (touched.length === 0) return keepGoing("Nothing has been implemented yet. Read the spec and start with the first step.");
  if (!isVerified(root, task.meta.id, result.base))
    return keepGoing("The current changes have not passed `node scripts/agents/task.mjs verify`. Run it and fix every failure.");
  if (tryGit(["status", "--porcelain"], { cwd: root }))
    return keepGoing("There are uncommitted changes. Commit them (Conventional Commits, English, the task's scope).");
  if (result.status !== "review")
    return keepGoing(`Fill in "## Executor log" (what you did, decisions, anything the reviewer should look at), set \`status: review\`, and commit.`);
  return {};
}

function sessionStart() {
  const branch = currentBranch(root);
  const task = activeTask();
  const text = task
    ? `App: you are on ${branch}, the branch of task ${task.meta.id} ("${task.meta.title}", status: ${task.meta.status}).
Before anything else read AGENTS.md and ${task.file} completely, then follow the execute-task skill.
Only the task's \`allow\` paths may change. Gates: \`node scripts/agents/task.mjs check\` (fast) and \`node scripts/agents/task.mjs verify\` (before you finish).`
    : `App: current branch is ${branch || "(detached)"}, which is not a task branch. Code changes by agents happen only on task/* branches created from a task spec (docs/tasks/). If you are asked to change code, ask the user which task to work on (\`node scripts/agents/task.mjs list\`) instead of editing here.`;
  return { injectSteps: [{ systemMessage: { systemMessage: text } }] };
}

let input = {};
try {
  const raw = readFileSync(0, "utf8");
  input = raw.trim() ? JSON.parse(raw) : {};
} catch {}

try {
  const event = process.argv[2];
  reply(event === "pre-tool" ? preTool(input) : event === "stop" ? stop(input) : event === "session-start" ? sessionStart() : {});
} catch (e) {
  process.stderr.write(`app antigravity hook: ${e.message}\n`);
  reply(process.argv[2] === "pre-tool" ? ALLOW : {});
}
