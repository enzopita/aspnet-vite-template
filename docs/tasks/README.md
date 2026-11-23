# Tasks

A task is the **contract** between a planner (the orchestrator model of the day, or a human) and an executor agent
(any model, in any harness). Why it works this way: [ADR 0008](../adr/0008-agent-task-workflow.md).

## Lifecycle

| Status | Set by | Meaning |
|---|---|---|
| `ready` | planner | Spec committed on `main`, nobody working on it |
| `in-progress` | `task.mjs start` / executor | Executor working on `task/NNNN-slug` |
| `review` | executor | `verify` passed, work committed, Executor log written |
| `blocked` | executor | The spec can't be done as written; the Executor log says why |
| `changes-requested` | reviewer | Review findings are in `## Review`; the executor resumes on the same branch |
| `done` | reviewer | Merged into `main` |

```text
planner                 executor (task/NNNN-slug)                  reviewer
/plan-task ─► spec ─► task.mjs start ─► check … verify ─► commit ─► /review-task ─► merge or changes-requested
on main                                                              (polish, then merge)
```

## Commands

All of them are in `node scripts/agents/task.mjs help`. The ones you type:

- `start <id> [--worktree]`: create the branch (or a sibling worktree, to run two executors at once) and print the
  prompt to paste into the executor.
- `brief <id>`: print that prompt again.
- `check`: the **fence**: changed paths inside `allow`, protected files untouched, the spec unchanged apart from
  `status` and the Executor log, no suppressions/skips/raw colors in added lines. It also runs on every commit on
  a `task/*` branch.
- `verify`: `check`, plus the gates for the touched areas, plus the task's own `verify` commands. The Antigravity
  Stop hook keeps the agent working until `verify` has passed on the current tree.

## The fence

The fence lives in git hooks and scripts, so every harness gets the same limits. Harness adapters
(`.agents/hooks.json` for Antigravity, `opencode.jsonc` for OpenCode) block the same things earlier, before a tool
call runs, which saves the agent a wasted loop.

- Protected files (rules, gates, dependency manifests, ADRs, the design-kit primitives…) are listed in
  `scripts/agents/lib.mjs`. A task opens one with `unlock:` only when the planner means it.
- Generated files (OpenAPI document, Kubb client, route tree) are always allowed, because the gates regenerate them.
  Executors never edit them by hand.
- Existing EF Core migrations are append-only.
- Reviewers fixing things on a task branch bypass the fence with `APP_TASK_FENCE=off`, both at commit time and in
  `verify` (which then runs the gates without recording a pass). Executor harnesses block that variable.
