---
name: plan-task
description: Turn a feature request into one or more executor-ready task specs (docs/tasks/) for an executor agent (any model, any harness).
disable-model-invocation: true
---

# Plan a task

You are the **planner**. The executor is a capable model that drifts: it fills every gap in the spec with its own
habits. Your spec closes those gaps, so the executor makes no design decisions, only implementation ones.
Workflow and statuses: `docs/tasks/README.md`. Why: `docs/adr/0008-agent-task-workflow.md`.

## 1. Pin down the request

Settle every product question the user has to answer (behaviour, edge cases, wording, what is out) before writing
anything. Run an interview round (`AskUserQuestion`, giving a recommended option) that explicitly challenges every
proposed acceptance criterion. For critical tasks (money, authorization, concurrency), require human sign-off on the
acceptance criteria and note any hidden review-only tests to run after handback. Done when you could write the
acceptance criteria without guessing.

## 2. Find the shape and verify the facts

1. Consult `docs/agents/reference-slices.md` and locate the existing code each part of the change should imitate: the
   closest slice, endpoint, component, test. Read the ADRs it touches. Every new file the executor creates must map to a
   canonical reference file; if no reference exists (a first-of-its-kind pattern), build that skeleton yourself first,
   here on `main`, and plan the task on top of it. Weak executors copy well and invent badly.
2. Run `.agents/skills/look-it-up/SKILL.md` for every unfamiliar API, package version, option, or CLI flag via the
   configured MCPs (`microsoft-learn`, `context7`, `nuget`). Record the exact signatures, versions, and URLs under
   `## Verified facts`.

## 3. Cut it

One task is one reviewable change: one slice or one UI feature, with its tests. Aim for roughly 300 changed lines as a
planning reference — what really determines task difficulty is the number of unmade decisions left for the executor.
Split anything bigger into several specs, naming dependencies in Context (`"start after 0003 is done"`).

## 4. Write the spec

Create it with `node scripts/agents/task.mjs new <slug> --title "<title>"` and fill in every section:

- `allow`: the narrowest globs that fit, including the test folders. Each glob you add is room to drift.
  When the task makes an existing page or endpoint do more (a new request, a new side effect), include the existing
  tests that cover it: they break on the new behaviour, and the executor can't fix them outside `allow`.
- `unlock`: empty, unless the task genuinely needs a protected file (a new package, a new commitlint scope). Then
  say exactly what changes in it.
- `frozen`: tests asserting an existing black-box contract that must not be altered. Commit them on `main` (or in the
  initial commit on `task/*`); the fence rejects any later edit to `frozen` files.
- `verify`: the targeted test commands for this task, e.g.
  `dotnet test --project tests/App.Api.IntegrationTests --filter "FullyQualifiedName~Orders"`.
- **Verified facts**: every new package version, API signature, and URL verified in step 2.
- **Reference implementation**: map files one to one from `docs/agents/reference-slices.md`, reference → new file.
- **Contract tests** (when introducing a new contract): include fenced code blocks tagged with the target repo path
  (e.g., ```` ```csharp tests/App.Api.IntegrationTests/Orders/PlaceOrderTests.cs ````) for the executor to copy verbatim.
- **Steps**: decide the names yourself and write them down: types, namespaces, routes, Problem `code`s, query
  keys, component names, test names. Every step ends on how to tell it is done.
- **Acceptance criteria**: observable behaviour with **one named test per criterion** (`TestClass.Test_name` or
  `file.test.tsx: "case"`). Keep "`node scripts/agents/task.mjs verify` passes" as the last one.
- **Invariants across rows** ("at least one owner", "a transaction balances"): say how concurrent requests are kept
  from breaking them, for example with a concurrency token, a row lock or a unique index, and put the migration in
  `allow`. Or list the race under Out of scope with the task that will close it. An in-memory check alone passes
  every sequential test and still breaks under concurrency. Name the test class that forces the race
  `<Area>ConcurrencyTests`: `verify` reruns every changed class with that suffix 10 times, because one green run of a
  race test proves little.
- **Out of scope**: the adjacent work the executor will be tempted to do.

Ready when every criterion has a named test, every new file maps to a reference, every new API/version appears in
`## Verified facts`, `node scripts/agents/task.mjs list` shows `ready`, and a stranger with only the spec and the repo
could implement it without asking anything.

## 5. Publish

Commit the spec on `main` (`docs(agents): add task NNNN <slug>`). Executors branch from that commit, and the fence
compares their spec against it. Then give the user:

- the start command: `node scripts/agents/task.mjs start NNNN` (opens sibling worktree `../<repo>-task-NNNN` with `agent-role = executor`, allowing parallel tasks across separate worktrees),
- which executor you would pick and why, in one line.
