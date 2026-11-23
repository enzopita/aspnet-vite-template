---
id: "{{id}}"
title: {{title}}
status: ready # ready → in-progress → review → done; or blocked / changes-requested
scope: repo # commitlint scope for the executor's commits (web/commitlint.config.mjs)
executor: any # gemini | deepseek | any
allow: # the fence: globs the executor may change. Keep it as narrow as the work.
  - src/Modules/Example/**
unlock: [] # protected paths this task may change (rare; Context says why)
verify: [] # commands that prove THIS task (targeted tests). Area gates run automatically.
---

# {{id}} · {{title}}

## Goal

<!-- One paragraph: the observable outcome, in domain terms (docs/glossary.md). -->

## Context

Read before editing:

- `AGENTS.md`
- <!-- docs/adr/NNNN-....md — the rule from it that matters here -->

## Reference implementation

Copy the shape of this existing code, file for file:

- <!-- `src/Modules/<M>/App.<M>/Features/<Area>/<Slice>/<Slice>.cs` (a reference slice) → the new slice -->

## Steps

1. <!-- One action per step, ending on how to tell it is done. -->

## Acceptance criteria

- [ ] <!-- Observable and testable. Every clause must be proven by a test named in Steps → Tests. -->
- [ ] `node scripts/agents/task.mjs verify` passes.

## Out of scope

- <!-- Tempting adjacent work that belongs to another task. -->

## Executor log

<!-- Executor: what you did, decisions and why, what the reviewer should look at, open questions. -->

## Review

<!-- Reviewer only. -->
