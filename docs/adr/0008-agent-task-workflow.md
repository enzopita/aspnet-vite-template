# 0008. Agent task workflow: planner, executors, fence

- Status: Accepted
- Date: 2026-11-22

## Context

Most implementation work is done by cheaper models. Given an open-ended request they drift: they invent patterns
instead of copying existing ones, touch unrelated files, add dependencies, silence gates and declare work done
before verifying it. Prose rules reduce this but don't prevent it, and each harness has its own customization
format.

## Decision

Split the roles and enforce the boundaries with machines. Any model can hold any role.

- **Planner** (the orchestrator, or a human; skill `plan-task`): writes a task spec in `docs/tasks/` and commits it
  on `main`. The spec fixes the names, maps every new file to a reference file, and lists the paths the task may
  change (`allow`), the protected paths it may open (`unlock`) and the commands that prove it (`verify`).
- **Executor** (skill `execute-task`): implements one spec on `task/NNNN-<slug>`. Owns the code, the commits, the
  `status` field (`in-progress`, `review`, `blocked`) and the Executor log. Leaves pushing, merging and history to
  the reviewer.
- **Reviewer** (the orchestrator, or a human; skill `review-task`): checks the branch against the spec, polishes,
  sends back as `changes-requested` or merges. Each class of finding a machine could catch becomes a new guard.

Enforcement lives in the repository, so it holds in any harness:

- `scripts/agents/task.mjs check` is the **fence**: changed paths inside `allow`; protected files untouched;
  generated files only regenerated; existing migrations append-only; the spec unchanged apart from `status` and
  the Executor log. Lefthook runs it on every commit of a `task/*` branch.
- `scripts/agents/task.mjs verify` runs the fence, the gates for the touched areas and the task's own commands, and
  records a fingerprint of the tree that passed.
- Harness adapters only fail earlier: `.agents/hooks.json` → `scripts/agents/antigravity-hook.mjs` (SessionStart,
  PreToolUse, Stop) and `opencode.jsonc` permissions, kept in sync with `PROTECTED` by a test.

## Consequences

- Planning costs more: specs must be precise, and first-of-a-kind patterns are built by the planner before any
  executor copies them. Executor output becomes predictable and cheap to review.
- Executors change rules, gates and dependencies only through a spec with `unlock`.
- When a harness adapter breaks, the git-level fence still holds.
