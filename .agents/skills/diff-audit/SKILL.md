---
name: diff-audit
description: Audit a task branch diff in a clean context against the task spec and drift checklist before setting status: review.
---

# Diff audit

Run this skill in a **clean context** (a dedicated subagent or a separate cheap model session that did not write the
implementation) **after** `node scripts/agents/task.mjs verify` passes and **before** setting `status: review`.

## Inputs

1. The task spec (`docs/tasks/NNNN-*.md`).
2. The full branch diff: `git diff main...HEAD`.
3. The review drift checklist in `.agents/skills/review-task/SKILL.md`.

## Audit checklist

Check every changed hunk against:

- **Acceptance criteria & named tests:** every clause of every acceptance criterion is proven by the exact test named in
  the spec (`criterion → TestClass.Test_name`). Partial coverage or missing assertions is a finding.
- **Reference implementation shape:** folder structure, naming, `internal` visibility, error mapping (`Result<T>` /
  `ProblemDetails`), and test helpers match the canonical reference files listed in the spec.
- **Rules & ADRs:** `AGENTS.md`, area `AGENTS.md`, and touched ADRs are respected; `Out of scope` items were not added.
- **Weak-model drift:** assertions that cannot fail, tests that restate the implementation, swallowed exceptions or empty
  `catch {}`, null-forgiving `!`, duplicated helpers instead of `Support/` reuse, comments narrating the obvious,
  hardcoded UI text outside Lingui, Portuguese identifiers or comments, magic numbers, `double`/`float` used for money.
- **Verified sources:** every new package version, API, config option, or CLI flag not previously used in the codebase is
  backed by a URL in `## Verified facts` or `## Executor log` → `### Sources`.
- **Contract test fidelity:** if the spec includes tests under `## Contract tests` (or `task.mjs check` warns on test
  divergence), any deviation from the spec snippet is explicitly justified in `## Executor log`.

## Output

Return a concise bullet list of findings formatted as:

- `path/to/file.ext:line` — what is wrong, and what right looks like.

If everything passes cleanly, return `No findings`. Resolve every finding and re-run `node scripts/agents/task.mjs verify`
before committing `status: review`.
