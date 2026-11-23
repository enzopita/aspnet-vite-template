---
id: "{{id}}"
title: {{title}}
status: ready # ready → in-progress → review → done; or blocked / changes-requested
scope: repo # commitlint scope for the executor's commits (web/commitlint.config.mjs)
executor: any # gemini | deepseek | any
allow: # the fence: globs the executor may change. Keep it as narrow as the work.
  - src/Modules/Example/**
unlock: [] # protected paths this task may change (rare; Context says why)
frozen: [] # black-box tests on an existing contract committed by the planner; never edited by the executor
verify: [] # commands that prove THIS task (targeted tests). Area gates run automatically.
---

# {{id}} · {{title}}

## Goal

<!-- One paragraph: the observable outcome, in domain terms (docs/glossary.md). -->

## Context

Read before editing:

- `AGENTS.md`
- <!-- docs/adr/NNNN-....md — the rule from it that matters here -->

## Verified facts

<!-- Package versions, API signatures, analyzer rules, or CLI flags verified via MCP (`look-it-up`) with source URLs:
- Package / API: `<exact symbol or version>` — [source](https://...)
-->

## Reference implementation

Copy the shape of this existing code, file for file (`docs/agents/reference-slices.md`):

- <!-- `src/Modules/<M>/App.<M>/Features/<Area>/<Slice>/<Slice>.cs` (a reference slice) → the new slice -->

## Contract tests

<!-- Optional: for a new contract, embed test code tagged with its repo path so the executor copies it verbatim.
`task.mjs check` warns if the file diverges; any divergence must be justified in `## Executor log`.
```csharp tests/App.Api.IntegrationTests/<Area>/<Slice>Tests.cs
```
-->

## Steps

1. <!-- One action per step, ending on how to tell it is done. -->

## Acceptance criteria

<!-- Each criterion needs one named test proving every clause. Critical tasks (money, auth, concurrency) require human
     sign-off on criteria (and hidden review-only tests when feasible). -->

- [ ] <!-- <Observable behavior> — proven by `TestClass.Test_name` (or `file.test.tsx: "case"`) -->
- [ ] `node scripts/agents/task.mjs verify` passes.

## Out of scope

- <!-- Tempting adjacent work that belongs to another task. -->

## Executor log

<!-- Executor: one line per criterion (`criterion → TestClass.Test_name`), decisions made, what the reviewer should look at, open questions. -->

### Sources

<!-- Citations (`URL` + why consulted) for any fallback lookup run via `look-it-up`. -->

## Review

<!-- Reviewer only. -->
