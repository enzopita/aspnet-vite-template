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
anything. Ask with `AskUserQuestion` and give a recommended option. Done when you could write the acceptance
criteria without guessing.

## 2. Find the shape in the code

Locate the existing code each part of the change should imitate: the closest slice, endpoint, component, test.
Read the ADRs it touches. Done when every file the executor will create maps to a reference file. If no reference
exists (a first-of-its-kind pattern), build that skeleton yourself first, here, and plan the task on top of it.
Weak executors copy well and invent badly.

## 3. Cut it

One task is one reviewable change: one slice or one UI feature, with its tests, and roughly 400 changed lines at
most. Split anything bigger into several specs. In each spec's Context, name the tasks it depends on ("start
after 0003 is `done`").

## 4. Write the spec

Create it with `node scripts/agents/task.mjs new <slug> --title "<title>"` and fill in every section:

- `allow`: the narrowest globs that fit, including the test folders. Each glob you add is room to drift.
  When the task makes an existing page or endpoint do more (a new request, a new side effect), include the existing
  tests that cover it: they break on the new behaviour, and the executor can't fix them outside `allow`.
- `unlock`: empty, unless the task genuinely needs a protected file (a new package, a new commitlint scope). Then
  say exactly what changes in it.
- `verify`: the targeted test commands for this task, e.g.
  `dotnet test --project tests/App.Api.IntegrationTests --filter "FullyQualifiedName~Orders"`.
- **Reference implementation**: map files one to one, reference → new file.
- **Steps**: decide the names yourself and write them down: types, namespaces, routes, Problem `code`s, query
  keys, component names, test names. Every step ends on how to tell it is done.
- **Acceptance criteria**: observable behaviour plus the tests that prove it. Keep "`verify` passes" as the last
  one.
- **Invariants across rows** ("at least one owner", "a transaction balances"): say how concurrent requests are kept
  from breaking them, for example with a concurrency token, a row lock or a unique index, and put the migration in
  `allow`. Or list the race under Out of scope with the task that will close it. An in-memory check alone passes
  every sequential test and still breaks under concurrency. Name the test class that forces the race
  `<Area>ConcurrencyTests`: `verify` reruns every changed class with that suffix 10 times, because one green run of a
  race test proves little.
- **Out of scope**: the adjacent work the executor will be tempted to do.

Done when `node scripts/agents/task.mjs list` shows the task as `ready`, and a stranger with only the spec and the
repo could do it without asking you anything.

## 5. Publish

Commit the spec on `main` (`docs(agents): add task NNNN <slug>`). Executors branch from that commit, and the fence
compares their spec against it. Then give the user:

- the start command: `node scripts/agents/task.mjs start NNNN --worktree` (one worktree per executor, so several
  executors can run in parallel),
- which executor you would pick and why, in one line.
