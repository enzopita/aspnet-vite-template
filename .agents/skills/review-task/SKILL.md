---
name: review-task
description: Review an executor's task/* branch against its spec, polish it, and send it back or merge it.
disable-model-invocation: true
---

# Review a task

You are the **reviewer**. The executor's branch is a draft. You decide whether it merges as is, after your
polish, or goes back. Workflow and statuses: `docs/tasks/README.md`.

## 1. Run the fence

`node scripts/agents/task.mjs check --ref task/NNNN-<slug> --task NNNN`. Fence violations are findings, whatever the
Executor log says about them.

## 2. Read everything

Read the spec, the Executor log, and the full diff: `git diff main...task/NNNN-<slug>`. Check each hunk against:

- **The spec**: every acceptance criterion is met and proven by a test, every name matches the spec, nothing
  from Out of scope crept in.
- **The reference shape**: same structure, visibility, error handling and test style as the reference files.
- **AGENTS.md and the ADRs it touches.**
- **Drift typical of weaker models**: assertions that can't fail, tests that restate the implementation, swallowed
  exceptions or `catch {}`, null-forgiving `!`, unused or duplicated helpers, re-implemented utilities that already
  exist, comments narrating the obvious, hard-coded text, Portuguese identifiers or comments, magic numbers,
  `double`/`float` used for money or currency values (use `decimal`).

Done when every changed line has been read and every finding has a `file:line`.

## 3. Run the gates yourself

Create the reviewer worktree (`node scripts/agents/task.mjs review NNNN`), which opens `../<repo>-review-NNNN` on
`review/NNNN-<slug>` from the task head with `agent-role = reviewer`. Inside that worktree, run
`node scripts/agents/task.mjs verify --task NNNN`. For backend work also run the full `dotnet test` (needs Docker).
A pass reported in the Executor log doesn't count until you have seen it yourself.

## 4. Decide

- **Polish**: findings inside the task's `allow` paths you can fix quickly. Fix them on `review/NNNN-<slug>` and commit
  normally (never outside `allow`; changes outside `allow` belong to a new task or to `main` after merge).
- **Send back**: anything bigger, anything outside `allow`, or anything the executor will repeat. Write numbered,
  actionable findings under `## Review` (`file:line`, what is wrong, what right looks like), set
  `status: changes-requested`, and commit on `review/NNNN-<slug>` (then fast-forward/update `task/NNNN-<slug>` if
  resuming it). Give the user `node scripts/agents/task.mjs brief NNNN` to resume the executor.
- **Merge**: once clean, write a short summary under `## Review`, set `status: done`, commit, and ask before
  squash-merging `review/NNNN-<slug>` into `main` with a Conventional Commit message for the whole task. Remove the
  worktrees and branches afterwards.

## 5. Tighten the harness

For each finding, ask whether a machine could have caught it. If yes, propose the cheapest guard, ranked by how
early it fires:

1. an analyzer or Oxlint rule (`governance/BannedSymbols*.txt`, `.editorconfig`, `web/.oxlintrc.json`),
2. a `GovernanceTests` or `App.ArchitectureTests` rule,
3. a residual pattern in `scripts/lint-extra.mjs`,
4. a sentence in `.agents/skills/execute-task/SKILL.md` or a sharper section in the spec template.

Done when every finding is either guarded, or you have told the user why it can't be.
