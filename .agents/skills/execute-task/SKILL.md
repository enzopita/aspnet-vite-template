---
name: execute-task
description: >-
  The protocol for implementing a App task spec (docs/tasks/NNNN-*.md) on its task/* branch. Use it whenever you
  are asked to execute, implement, continue or fix a task, or you are on a task/* branch.
---

# Execute a task

The spec is a **contract**. Your job is to fulfil it exactly, in the shape the codebase already has, and hand back
a branch the reviewer can merge without rewriting. Scope, structure and gates are fixed. You decide the code inside
them.

## 1. Load the contract

Read `AGENTS.md`, then the whole task file, then every file under **Context** and **Reference implementation**.
Done when you can name, for every step, which existing file you will imitate and which `allow` path you will write
to. If a step has no such file or path, the spec is incomplete: go to step 6.

## 2. Work one step at a time

For each step in **Steps**, in order:

1. Open the reference file and mirror it: same folder layout, naming, visibility (`internal` by default), error
   handling, test style. Copy its structure and add only the domain logic the step asks for.
2. Write or extend the test that proves the step, next to the existing tests of the same kind.
3. Run `node scripts/agents/task.mjs check`. It must print `✔ … fence passed`.

Done when the step's own check holds and the fence passes. Then move to the next step.

Stay inside the step. Refactors, renames, formatting sweeps, "improvements" to neighbouring code and new helpers
belong to other tasks. If you notice something worth doing, write it in the Executor log for the reviewer.

## 3. Keep the gates honest

When a gate fails, change the code under test until it passes, even if that takes a while. The gate stays as it
is. That means: no suppressions, no skipped or deleted tests, no loosened types, no edited config, no hand-edited
generated files. Regenerate them instead (`pnpm --dir web api:generate`, `pnpm --dir web build`).
If the only way through is changing a protected file or a test the spec didn't ask you to change, the spec is
wrong: go to step 6.

## 4. Verify

Run `node scripts/agents/task.mjs verify`. Done when it ends with `✔ task NNNN: all … gate(s) passed` on the tree
you are about to commit. Any edit after that, even a small one, needs another verify run.

## 5. Hand back

1. Commit with Conventional Commits in English, using the task's `scope`:
   `feat(orders): place an order`. Small commits per step are welcome.
2. In the task file, tick an acceptance criterion only when a test proves every clause of it (e.g. "sets the password
   once, **clears lockout**, rejects reused tokens" is three assertions). Write `## Executor log`: one line per
   criterion naming its test (`criterion → TestClass.Test_name`), what you built, each decision
   the spec left open and what you chose, anything the reviewer should look at first. Set `status: review`.
3. Commit that too. Done when `git status` is clean and `status: review` is committed.

Your part ends there. Leave pushing, merging and branch management to the reviewer.

## 6. When the contract can't be met

Set `status: blocked`. In `## Executor log`, quote the spec line and say what makes it impossible or ambiguous,
plus the options you see. Commit, then stop and tell the user. A clear question is a good result. Guessing past it
is how work gets thrown away.

## App specifics worth re-reading mid-task

- Resolve every .NET language-server recommendation in the code you write before handing back: primary
  constructors (IDE0290), collection expressions (IDE0300–0305), unused usings (IDE0005), unnecessary `!` (IDE0370)
  and the rest. They fail the build, so `verify` catches them; `dotnet format style App.slnx --severity warn`
  fixes most automatically, and you check what it rewrote (it can pick odd names or break nullability).

- User-facing text goes through Lingui (`<Trans>`, `t`). The source locale is pt-BR, so write pt-BR message text
  and keep `web/src/locales/en/messages.po` complete (`pnpm --dir web i18n:extract`, then translate).
- Calendar dates are `DateOnly`. Instants are `DateTimeOffset` in UTC from an injected `TimeProvider`.
- Styling uses design tokens (`bg-surface`, `text-positive`, `duration-fast`). The palette lives in
  `web/src/styles/tokens.css`.
- Endpoints declare every response, so the OpenAPI document and the TS client stay complete.
  Routes and query parameters are kebab-case; errors are Problem Details with a stable `code`.
- Before writing a test helper, look in the test project's `Support/` folder and grep the other test classes. Reuse
  a shared helper. If the only copy is `private` in another class, move it into `Support/` and call it from both;
  never paste a second copy.
