#!/usr/bin/env node
// @ts-check
// Unified role-aware lifecycle hooks for Claude Code, Antigravity, and OpenCode V2 plugins (ADR 0008).
// Usage: node scripts/agents/agent-hook.mjs <claude|antigravity> <session-start|pre-tool|post-tool|stop>

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  GENERATED,
  PROTECTED,
  currentBranch,
  findTaskFile,
  list,
  matchesAny,
  readRole,
  readState,
  readTask,
  repoRoot,
  tryGit,
  writeState,
} from "./lib.mjs";
import { check, isVerified } from "./task.mjs";

/**
 * @typedef {import("./agent-hook.d.ts").AgentRole} AgentRole
 * @typedef {import("./agent-hook.d.ts").TaskSpec} TaskSpec
 * @typedef {import("./agent-hook.d.ts").HookEventName} HookEventName
 * @typedef {import("./agent-hook.d.ts").HarnessName} HarnessName
 * @typedef {import("./agent-hook.d.ts").ClaudeEventInput} ClaudeEventInput
 * @typedef {import("./agent-hook.d.ts").ClaudeHookOutput} ClaudeHookOutput
 * @typedef {import("./agent-hook.d.ts").AntigravityEventInput} AntigravityEventInput
 * @typedef {import("./agent-hook.d.ts").AntigravityHookOutput} AntigravityHookOutput
 * @typedef {import("./agent-hook.d.ts").NormalizedToolCall} NormalizedToolCall
 * @typedef {import("./agent-hook.d.ts").PreToolResult} PreToolResult
 * @typedef {import("./agent-hook.d.ts").StopResult} StopResult
 * @typedef {import("./agent-hook.d.ts").OpenCodeToolBeforeEvent} OpenCodeToolBeforeEvent
 * @typedef {import("./agent-hook.d.ts").OpenCodeShellBeforeEvent} OpenCodeShellBeforeEvent
 */

/** @type {PreToolResult} */
const ALLOW = { decision: "allow" };

/** @param {string} reason @param {string} [cmd] @returns {PreToolResult} */
const deny = (reason, cmd) => ({
  decision: "deny",
  reason: `App guard: ${reason}${cmd ? `\n  command: ${cmd.slice(0, 200)}` : ""}`,
});

/** @type {[RegExp, string][]} */
const EXECUTOR_DENY_COMMANDS = [
  [/--no-verify\b|\bgit\b[^|;&]*\bcommit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, "skipping git hooks is not allowed — fix what the hook reports"],
  [/\bLEFTHOOK(_EXCLUDE|_SKIP)?\s*=|\blefthook\s+(uninstall|install)\b|core\.hooksPath/i, "changing or disabling git hooks is not allowed"],
  [/\bgit\s+push\b/, "executors never push — the reviewer integrates the branch"],
  [/\bgit\s+(reset\s+--hard|clean\s+-\w*f|rebase|filter-branch|filter-repo|update-ref|tag|merge)\b/, "history-rewriting / integration git commands are the reviewer's job"],
  [/\bgit\s+(branch\s+-[dDmM]|stash\s+(drop|clear)|checkout\s+(main|master)\b|switch\s+(main|master)\b)/, "stay on the task branch and keep its history"],
  [/\b(pnpm|npm|npx|yarn|bun)\b(\s+(--?[\w-]+(=\S+)?|(--dir|-C|--filter|--prefix)\s+\S+))*\s+(add|remove|rm|uninstall|update|up|upgrade|dlx\s+shadcn|i\s+[^-\s]|install\s+[^-\s])/, "adding/removing/updating packages needs the planner (task `unlock`)"],
  [/\bdotnet\s+(add\s+\S+\s+package|add\s+package|remove\s+\S+\s+package|package\s+(add|remove|update))\b|\bdotnet\s+outdated\b/, "adding/removing NuGet packages needs the planner (task `unlock`)"],
  [/\bdotnet\s+ef\s+migrations\s+remove\b/, "migrations are append-only — add a new one instead"],
];

/** @type {[RegExp, string][]} */
const REVIEWER_DENY_COMMANDS = [
  [/--no-verify\b|\bgit\b[^|;&]*\bcommit\b[^|;&]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, "skipping git hooks is not allowed — fix what the hook reports"],
  [/\bLEFTHOOK(_EXCLUDE|_SKIP)?\s*=|\blefthook\s+(uninstall|install)\b|core\.hooksPath/i, "changing or disabling git hooks is not allowed"],
  [/\bdotnet\s+ef\s+migrations\s+remove\b/, "migrations are append-only"],
];

const WRITE_COMMANDS = /^(rm|del|erase|rmdir|rd|mv|move|cp|copy|xcopy|robocopy|ren|rename|truncate|touch|tee|chmod|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Clear-Content|ni|ri|mi|ci|sc|ac)$/i;
const INPLACE_EDIT = /\b(sed|perl)\s+-\w*[ip]/;

const READ_TOOLS = /^(read|view_file|read_file|glob|grep|ls|find_by_name|grep_search|list_dir|websearch|webfetch|web_fetch|search_web)$/i;
const COMMAND_TOOLS = /^(bash|run_command|shell_exec|send_command_input|git_commit|shell)$/i;
const WRITE_TOOLS = /^(edit|multiedit|write|notebookedit|notebook_edit|patch|code_action|file_change|write_blob|move|delete_directory|propose_code|edit_notebook|edit_file|write_file)$/i;
const MCP_TOOL_PREFIX = /^mcp__/i;
const MCP_WRITE_NAME_HINT = /(?:^|_)(write|edit|patch|replace|create|delete|remove|move|rename|apply|save|append|put|notebook)/i;
const MCP_EXEC_NAME_HINT = /(?:^|_)(exec|run|shell|command|terminal|bash)/i;
const MCP_WRITE_ARG_HINT = /\b(apply|edit|write|create|delete|remove|move|rename|patch|replace)/i;
const MCP_EXEC_ARG_HINT = /\b(run|exec|command|check|shell|terminal)/i;

const PATH_KEY_HINT = /^(file_?path|path|paths|target|target_?file|absolute_?path|notebook_?path|destination|dest|source|src)$/i;
const IGNORE_CONTENT_KEYS = new Set(["content", "codecontent", "new_string", "old_string", "new_source", "replacement", "replacementcontent", "text", "command", "commandline"]);
const HARMLESS_REDIRECT_TARGETS = new Set(["/dev/null", "nul", "nul:"]);

/**
 * Extract shell redirect / destructive file-command targets.
 * @param {string} cmd
 * @returns {string[]}
 */
export function writeTargets(cmd) {
  /** @type {string[]} */
  const targets = [];
  for (const m of cmd.matchAll(/(?<![0-9&])>{1,2}\s*(?!&)([^\s|;&<>]+)/g)) targets.push(m[1]);
  for (const segment of cmd.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/).filter((w) => !/^\w+=/.test(w));
    if (words.length && (WRITE_COMMANDS.test(words[0]) || INPLACE_EDIT.test(segment))) {
      targets.push(...words.slice(1).filter((w) => !w.startsWith("-")));
    }
  }
  return targets.map((t) => t.replace(/^["'`]|["'`]$/g, "")).filter(Boolean);
}

/**
 * Classify a target string relative to worktree root.
 * @param {string} root
 * @param {string} candidate
 * @returns {{ kind: "ignore" | "outside" | "git" | "repo", rel?: string }}
 */
function inspectTargetPath(root, candidate) {
  const trimmed = candidate.trim().replace(/^file:\/\/\/?/, "");
  if (!trimmed || HARMLESS_REDIRECT_TARGETS.has(trimmed.toLowerCase()) || /^https?:\/\//i.test(trimmed)) {
    return { kind: "ignore" };
  }
  if (trimmed.length > 400 || /\r|\n/.test(trimmed)) return { kind: "ignore" };

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  const abs = isAbsolute(decoded) ? resolve(decoded) : resolve(root, decoded);
  const rel = relative(root, abs).replace(/\\/g, "/");
  if (!rel) return { kind: "ignore" };
  if (rel.startsWith("..") || isAbsolute(rel)) return { kind: "outside" };
  if (rel === ".git" || rel.startsWith(".git/")) return { kind: "git", rel };
  return { kind: "repo", rel };
}

/**
 * Resolve worktree root + role from payload `cwd`/`workspacePaths` or fallback dir.
 * @param {string} [hintDir]
 * @returns {{ root: string, role: AgentRole }}
 */
export function resolveWorkspaceRole(hintDir) {
  const start = hintDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = repoRoot(start);
  const role = /** @type {AgentRole} */ (readRole(root));
  return { root, role };
}

/**
 * @param {string} root
 * @returns {TaskSpec | undefined}
 */
function activeTask(root) {
  const id = tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root });
  const taskId = id && /^(?:task|review)\/(\d{4})(?:-|$)/.exec(id)?.[1];
  const file = taskId && findTaskFile(root, taskId);
  if (!file) return undefined;
  try {
    return /** @type {TaskSpec} */ (readTask(root, file));
  } catch {
    return { file, meta: { id: taskId, title: "", status: "in-progress", allow: [], unlock: [] }, body: "", frontmatter: "" };
  }
}

/**
 * Determine area AGENTS.md paths relevant to the task's `allow` globs.
 * @param {string} root
 * @param {{ meta?: { allow?: string | string[] } } | undefined} task
 * @returns {string[]}
 */
export function areaAgentsFilesForTask(root, task) {
  const allow = list(task?.meta?.allow);
  /** @type {string[]} */
  const files = [];
  const wantsBackend = allow.some((g) => /^(?:\*\*|src|tests)(?:\/|$)/i.test(g) || /\.cs$/i.test(g));
  const wantsWeb = allow.some((g) => /^(?:\*\*|web)(?:\/|$)/i.test(g));
  if (wantsBackend && existsSync(join(root, "src", "AGENTS.md"))) files.push("src/AGENTS.md");
  if (wantsWeb && existsSync(join(root, "web", "AGENTS.md"))) files.push("web/AGENTS.md");
  return files;
}

/**
 * Check whether writing `path` is forbidden for executor/reviewer in `root`.
 * @param {string} root
 * @param {string} candidate
 * @param {ReturnType<typeof activeTask>} task
 * @returns {string | undefined}
 */
function checkWriteDestination(root, candidate, task) {
  const inspected = inspectTargetPath(root, candidate);
  if (inspected.kind === "ignore") return undefined;
  if (inspected.kind === "outside") {
    return `${candidate} is outside the worktree (${root}) — agents must stay inside their assigned worktree`;
  }
  if (inspected.kind === "git") {
    return `${inspected.rel} is repository metadata (.git/**) — agents never modify git state directly`;
  }
  const rel = inspected.rel;
  if (!rel) return undefined;
  if (task && (rel === task.file || matchesAny(rel, list(task.meta?.unlock)))) return undefined;
  if (matchesAny(rel, GENERATED)) {
    return `${rel} is generated — run its generator (pnpm --dir web run api:generate / build), never edit it`;
  }
  if (matchesAny(rel, PROTECTED)) {
    return `${rel} is protected (rules, gates, dependencies or the spec). If blocked without it, set status: blocked.`;
  }
  return undefined;
}

/**
 * Extract command strings from a tool argument object.
 * @param {Record<string, unknown>} args
 * @returns {string[]}
 */
function extractCommands(args) {
  /** @type {string[]} */
  const out = [];
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && /^(command|commandline|cmd|script|input)$/i.test(k)) {
      out.push(v);
    }
  }
  if (out.length === 0) {
    for (const v of Object.values(args)) {
      if (typeof v === "string") out.push(v);
    }
  }
  return out;
}

/**
 * Extract candidate file paths from a tool argument object, skipping source-content blobs.
 * @param {Record<string, unknown>} args
 * @returns {string[]}
 */
function extractPaths(args) {
  /** @type {string[]} */
  const out = [];
  /** @param {unknown} node @param {string} keyHint */
  const visit = (node, keyHint) => {
    if (typeof node === "string") {
      if (IGNORE_CONTENT_KEYS.has(keyHint.toLowerCase())) return;
      if (PATH_KEY_HINT.test(keyHint) || !/\s{2,}|\n/.test(node)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, keyHint);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) visit(v, k);
    }
  };
  visit(args, "");
  return out;
}

/**
 * Shared SessionStart builder across harnesses.
 * @param {string} root
 * @param {AgentRole} role
 * @returns {string}
 */
export function sessionStart(root, role) {
  const branch = currentBranch(root) || "(detached)";
  if (role === "orchestrator") {
    return `App (orchestrator): checkout ${root} on ${branch}. Full orchestrator access active; task branches and review worktrees use \`node scripts/agents/task.mjs start|review <id>\`.`;
  }

  const task = activeTask(root);
  if (!task) {
    return `App (${role}): worktree ${root} on ${branch}. Stay strictly inside the worktree and never alter .git/** or protected governance files.`;
  }

  const areaFiles = areaAgentsFilesForTask(root, task);
  const areaBlocks = areaFiles.map((f) => {
    const content = readFileSync(join(root, f), "utf8").trim();
    return `### Area rules (${f})\n${content}`;
  });

  const header =
    role === "reviewer"
      ? `App (reviewer): ${root} on ${branch} reviewing task ${task.meta.id} ("${task.meta.title}", status: ${task.meta.status}). Polish only inside \`allow\` and use \`node scripts/agents/task.mjs verify --task ${task.meta.id}\`.`
      : `App (executor): ${root} on ${branch} implementing task ${task.meta.id} ("${task.meta.title}", status: ${task.meta.status}).
Read AGENTS.md and ${task.file} completely, follow .agents/skills/execute-task/SKILL.md, edit only \`allow\` paths, and run \`node scripts/agents/task.mjs check\` / \`verify\`.`;

  return areaBlocks.length > 0 ? `${header}\n\n${areaBlocks.join("\n\n")}` : header;
}

/**
 * Shared PreToolUse evaluation across harnesses and roles.
 * @param {string} root
 * @param {AgentRole} role
 * @param {NormalizedToolCall} call
 * @returns {PreToolResult}
 */
export function preTool(root, role, call) {
  if (role === "orchestrator") return ALLOW;

  const name = (call.name || "").trim();
  const args = call.args || {};
  if (READ_TOOLS.test(name)) return ALLOW;

  const task = activeTask(root);
  const lowerName = name.toLowerCase();
  const isMcp = lowerName === "mcp_tool" || MCP_TOOL_PREFIX.test(lowerName);
  const argBlob = JSON.stringify(args);

  const isCommand =
    COMMAND_TOOLS.test(name) ||
    (isMcp && (MCP_EXEC_NAME_HINT.test(lowerName) || (lowerName === "mcp_tool" && MCP_EXEC_ARG_HINT.test(argBlob))));
  const isWrite =
    WRITE_TOOLS.test(name) ||
    (isMcp && (MCP_WRITE_NAME_HINT.test(lowerName) || (lowerName === "mcp_tool" && MCP_WRITE_ARG_HINT.test(argBlob))));

  if (isCommand) {
    const commandRules = role === "reviewer" ? REVIEWER_DENY_COMMANDS : EXECUTOR_DENY_COMMANDS;
    for (const cmd of extractCommands(args)) {
      for (const [re, why] of commandRules) {
        if (re.test(cmd)) return deny(why, cmd);
      }
      for (const target of writeTargets(cmd)) {
        const err = checkWriteDestination(root, target, task);
        if (err) return deny(err, cmd);
      }
    }
  }

  if (isWrite) {
    for (const p of extractPaths(args)) {
      const err = checkWriteDestination(root, p, task);
      if (err) return deny(err);
    }
  }

  return ALLOW;
}

/**
 * Run Oxlint on edited web TS/TSX/MJS files after Claude Edit/Write/MultiEdit calls.
 * @param {string} root
 * @param {AgentRole} role
 * @param {NormalizedToolCall} call
 * @returns {string | undefined}
 */
export function postToolLintContext(root, role, call) {
  if (role === "orchestrator") return undefined;
  if (!/^(edit|multiedit|write)$/i.test(call.name)) return undefined;

  const candidate = extractPaths(call.args)[0];
  if (!candidate) return undefined;
  const inspected = inspectTargetPath(root, candidate);
  if (inspected.kind !== "repo" || !inspected.rel) return undefined;
  const rel = inspected.rel;
  if (!rel.startsWith("web/") || !/\.(ts|tsx|mjs)$/i.test(rel) || matchesAny(rel, GENERATED)) return undefined;

  const webRel = rel.slice("web/".length);
  const webRoot = join(root, "web");
  const localBin = join(webRoot, "node_modules", "oxlint", "bin", "oxlint");
  const sharedBin = resolve(import.meta.dirname, "..", "..", "web", "node_modules", "oxlint", "bin", "oxlint");
  const bin = existsSync(localBin) ? localBin : sharedBin;
  if (!existsSync(bin)) return undefined;

  const args = existsSync(join(webRoot, "node_modules")) ? [bin, "--type-aware", webRel] : [bin, webRel];
  const res = spawnSync(process.execPath, args, {
    cwd: webRoot,
    encoding: "utf8",
    timeout: 15_000,
  });
  const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  if (res.status !== 0 && combined) return `oxlint feedback for ${rel}:\n${combined}`;
  return undefined;
}

/**
 * Shared Stop evaluation across harnesses. Only executor worktrees gate Stop.
 * @param {string} root
 * @param {AgentRole} role
 * @param {{ backgroundRunning?: boolean }} opts
 * @returns {StopResult}
 */
export function evaluateStop(root, role, opts = {}) {
  if (role !== "executor") return { blocked: false };

  if (opts.backgroundRunning) {
    return {
      blocked: true,
      reason: "Background work is still running. Wait for all background tasks to finish before stopping.",
    };
  }

  const task = activeTask(root);
  if (!task) return { blocked: false };
  const failureFile = `stop-failures-${task.meta.id}.json`;

  if (task.meta.status === "blocked") {
    writeState(root, failureFile, { key: "", count: 0 });
    return { blocked: false };
  }

  /** @param {string} key @param {string} detail @returns {StopResult} */
  const failStop = (key, detail) => {
    const prev = readState(root, failureFile);
    const count = prev?.key === key ? Number(prev.count ?? 0) + 1 : 1;
    writeState(root, failureFile, { key, count });
    const escalate =
      count >= 3
        ? ` Repeated failure (${count}x on the same gate): stop looping, set \`status: blocked\` in ${task.file}, explain what blocks completion in "## Executor log", commit, and stop.\n\n`
        : "";
    return {
      blocked: true,
      reason: `Task ${task.meta.id} is not finished. ${escalate}${detail}\nIf you genuinely cannot continue or need the user, set \`status: blocked\` in ${task.file}, explain in "## Executor log", commit, and stop.`,
    };
  };

  const result = check(root, { mode: "worktree" });
  if (result.errors.length) {
    return failStop(
      `fence:${result.errors[0]}`,
      `The task fence fails:\n${result.errors.map((e) => `- ${e}`).join("\n")}\nUndo or fix these (run \`node scripts/agents/task.mjs check\`).`,
    );
  }

  const touched = result.files?.filter((f) => f.path !== task.file) ?? [];
  if (touched.length === 0) {
    return failStop("empty", "Nothing has been implemented yet. Read the spec and start with the first step.");
  }

  if (!isVerified(root, task.meta.id, result.base)) {
    return failStop("verify", "The current changes have not passed `node scripts/agents/task.mjs verify`. Run it and fix every failure.");
  }

  if (tryGit(["status", "--porcelain"], { cwd: root })) {
    return failStop("dirty", "There are uncommitted changes. Commit them (Conventional Commits, English, the task's scope).");
  }

  if (result.status !== "review") {
    return failStop("status", `Fill in "## Executor log" (criteria → tests, decisions) and set \`status: review\`, then commit.`);
  }

  writeState(root, failureFile, { key: "", count: 0 });
  return { blocked: false };
}

/**
 * Typed Claude Code lifecycle adapter.
 * @param {ClaudeEventInput} event
 * @returns {ClaudeHookOutput}
 */
export function handleClaudeEvent(event) {
  const { root, role } = resolveWorkspaceRole(event.cwd);
  switch (event.hook_event_name) {
    case "SessionStart":
      return {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: sessionStart(root, role),
        },
      };
    case "PreToolUse": {
      const res = preTool(root, role, {
        name: event.tool_name ?? "",
        args: event.tool_input ?? {},
      });
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: res.decision,
          ...(res.reason ? { permissionDecisionReason: res.reason } : {}),
        },
      };
    }
    case "PostToolUse": {
      const ctx = postToolLintContext(root, role, {
        name: event.tool_name ?? "",
        args: event.tool_input ?? {},
      });
      return ctx
        ? {
            hookSpecificOutput: {
              hookEventName: "PostToolUse",
              additionalContext: ctx,
            },
          }
        : {};
    }
    case "Stop": {
      const res = evaluateStop(root, role, {
        backgroundRunning: event.background_tasks_running === true,
      });
      return res.blocked && res.reason ? { decision: "block", reason: res.reason } : {};
    }
  }
}

/**
 * Typed Antigravity lifecycle adapter.
 * @param {AntigravityEventInput} event
 * @returns {AntigravityHookOutput}
 */
export function handleAntigravityEvent(event) {
  const hint = event.cwd ?? event.workspacePaths?.[0];
  const { root, role } = resolveWorkspaceRole(hint);
  switch (event.hookEventName) {
    case "SessionStart":
      return { injectSteps: [{ systemMessage: { systemMessage: sessionStart(root, role) } }] };
    case "PreToolUse":
      return preTool(root, role, {
        name: event.toolCall?.name ?? "",
        args: event.toolCall?.args ?? {},
      });
    case "PostToolUse":
      return {};
    case "Stop": {
      if (event.continuationActive && Number(event.executionNum ?? 0) >= 3) {
        const res = evaluateStop(root, role, { backgroundRunning: event.fullyIdle === false });
        return res.blocked && res.reason ? { decision: "continue", reason: res.reason } : {};
      }
      const res = evaluateStop(root, role, { backgroundRunning: event.fullyIdle === false });
      return res.blocked && res.reason ? { decision: "continue", reason: res.reason } : {};
    }
  }
}

/**
 * OpenCode V2 `tool.execute.before` adapter. Throws to deny a call.
 * @param {OpenCodeToolBeforeEvent} event
 * @param {string} [cwd]
 */
export function evaluateOpenCodeTool(event, cwd) {
  const { root, role } = resolveWorkspaceRole(cwd);
  const res = preTool(root, role, {
    name: event.tool,
    args: event.args ?? event.input ?? {},
  });
  if (res.decision === "deny") throw new Error(res.reason ?? "Blocked by App worktree guard.");
}

/**
 * OpenCode V2 `shell.create.before` adapter. Throws to deny a shell command.
 * @param {OpenCodeShellBeforeEvent} event
 * @param {string} [cwd]
 */
export function evaluateOpenCodeShell(event, cwd) {
  const { root, role } = resolveWorkspaceRole(event.cwd ?? cwd);
  const res = preTool(root, role, {
    name: "shell",
    args: { command: event.command },
  });
  if (res.decision === "deny") throw new Error(res.reason ?? "Blocked by App shell guard.");
}

/** @type {Record<HookEventName, ClaudeEventInput["hook_event_name"]>} */
const CLAUDE_EVENT_MAP = {
  "session-start": "SessionStart",
  "pre-tool": "PreToolUse",
  "post-tool": "PostToolUse",
  stop: "Stop",
};

/** @type {Record<HookEventName, AntigravityEventInput["hookEventName"]>} */
const ANTIGRAVITY_EVENT_MAP = {
  "session-start": "SessionStart",
  "pre-tool": "PreToolUse",
  "post-tool": "PostToolUse",
  stop: "Stop",
};

function runCli() {
  const harness = /** @type {HarnessName | undefined} */ (process.argv[2]);
  const event = /** @type {HookEventName | undefined} */ (process.argv[3]);
  const reply = (/** @type {unknown} */ obj) => process.stdout.write(JSON.stringify(obj));

  /** @type {Record<string, unknown>} */
  let raw = {};
  try {
    const text = readFileSync(0, "utf8").trim();
    raw = text ? /** @type {Record<string, unknown>} */ (JSON.parse(text)) : {};
  } catch (err) {
    if (event === "pre-tool") {
      const msg = err instanceof Error ? err.message : String(err);
      if (harness === "claude") {
        reply({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `App guard failed closed on invalid hook payload: ${msg}`,
          },
        });
        return;
      }
      if (harness === "antigravity") {
        reply({
          decision: "deny",
          reason: `App guard failed closed on invalid hook payload: ${msg}`,
        });
        return;
      }
    }
    reply({});
    return;
  }

  try {
    if (!harness || !event || !(event in CLAUDE_EVENT_MAP)) {
      reply({});
      return;
    }

    if (harness === "claude") {
      const typed = /** @type {ClaudeEventInput} */ ({
        ...raw,
        hook_event_name: CLAUDE_EVENT_MAP[event],
      });
      reply(handleClaudeEvent(typed));
      return;
    }

    if (harness === "antigravity") {
      const typed = /** @type {AntigravityEventInput} */ ({
        ...raw,
        hookEventName: ANTIGRAVITY_EVENT_MAP[event],
      });
      reply(handleAntigravityEvent(typed));
      return;
    }

    reply({});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`app agent-hook error (${harness ?? "unknown"} ${event ?? "unknown"}): ${msg}\n`);
    if (event === "pre-tool") {
      if (harness === "claude") {
        reply({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `App guard failed closed on internal error: ${msg}`,
          },
        });
        return;
      }
      reply({ decision: "deny", reason: `App guard failed closed on internal error: ${msg}` });
      return;
    }
    reply({});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli();
}
