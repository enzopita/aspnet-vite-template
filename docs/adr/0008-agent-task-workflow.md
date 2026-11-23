# 0008. Agent task workflow: planner, executors, fence

- Status: Accepted
- Date: 2026-11-22

## Context

Most implementation work is done by cheaper models. Given an open-ended request they drift: they invent patterns
instead of copying existing ones, touch unrelated files, add dependencies, silence gates and declare work done
before verifying it. Prose rules reduce this but don't prevent it, and each harness has its own customization
format.

## Decision

Split the roles by **worktree location** and enforce the boundaries with machines. Any model or harness can hold any
role.

- **Orchestrator** (main checkout on `main` or orchestrator setup branches; skills `plan-task` / governance): plans,
  commits specs on `main`, creates task and review worktrees, edits governance, and merges PRs. Runs without executor
  hook restrictions.
- **Executor** (`../<repo>-task-NNNN` on `task/NNNN-<slug>`, created by `task.mjs start NNNN`; skill `execute-task`):
  implements one spec. Owns the code inside `allow`, the commits, the `status` field (`in-progress`, `review`, `blocked`)
  and `## Executor log`. Leaves pushing, merging and history rewrites out.
- **Reviewer** (`../<repo>-review-NNNN` on `review/NNNN-<slug>`, created by `task.mjs review NNNN` from the task
  branch head; skill `review-task`): checks the branch against the spec, polishes strictly within `allow` (plus
  `## Review` and `status`), sends back as `changes-requested` or sets `done` for merge into `main`. Changes outside
  `allow` belong to a new task or to `main` after merge — never to an ad-hoc fence bypass.

Enforcement lives in the repository, so it holds across harnesses:

- **Role marker by location:** `task.mjs start` and `task.mjs review` write `agent-role` (`executor` or `reviewer`) inside
  the worktree's git dir (`.git/worktrees/<name>/agent-role`). Missing markers (such as the main checkout) resolve to
  `orchestrator`.
- **Single-rule fence (`scripts/agents/task.mjs check`):** changed paths inside `allow`; protected files untouched unless
  explicitly listed under `unlock`; generated files only regenerated; existing migrations append-only; the spec unchanged
  apart from `status`, `## Executor log` (and `## Review` on `review/*` branches). Lefthook runs it on every commit and
  `.github/workflows/fence.yml` re-checks it on `pull_request_target` using scripts checked out from `main`. No bypass
  variable exists.
- **Verified delivery (`scripts/agents/task.mjs verify` → `scripts/verify.mjs --mode task`):** runs the fence, the gates
  for the touched areas, and the task's own commands, recording a fingerprint of the verified tree.
- **Unified harness adapters (`scripts/agents/agent-hook.mjs`):** role-aware SessionStart, PreToolUse, PostToolUse and Stop
  hooks wired into Claude Code (`.claude/settings.json`), Antigravity (`.agents/hooks.json`) and OpenCode V2 plugins
  (`.opencode/plugins/app-guard.mjs`, backed by `opencode.jsonc`). Fail closed on invalid write/command/MCP events.

## Consequences

- Planning costs more: specs must be precise, and first-of-a-kind patterns are built by the orchestrator before any
  executor copies them. Executor output becomes predictable and cheap to review.
- Executors and reviewers never touch `PROTECTED`, `.git/**`, `GENERATED` or paths outside their worktree unless a task
  explicitly unlocks a protected manifest.
- Role guards are session guardrails for cooperative agents rather than OS-level user isolation (known boundary when an
  agent runs as the same OS user): the commit fence, reviewer re-verification and trusted CI still reject unapproved
  changes.
