# AGENTS.md

Modular monolith: a .NET 11 API in `src/` and a Vite + React SPA in `web/`. Write code, identifiers, commits and docs
in English.

## Your role

Where you run decides your role:

- On a `task/*` branch you are the **executor**. Your contract is the task file in `docs/tasks/`. Follow
  `.agents/skills/execute-task/SKILL.md`.
- Anywhere else you are the **orchestrator**: plan with `plan-task`, review with `review-task`.

## Done

Done means `node scripts/agents/task.mjs verify` passed on the final tree and the work is committed as a
Conventional Commit, with a scope from `web/commitlint.config.mjs`.

## Every task

- When a gate fails, change the code under test until it passes. If the only way through is a protected file, set
  `status: blocked` and explain why in the Executor log.
- Commit through the git hooks. They run the same gates as CI.
- Regenerate generated files with their tool: `pnpm --dir web api:generate` for the API client, `pnpm --dir web build`
  for the route tree.
- User-facing text goes through i18n, and errors carry a stable Problem Details `code` (ADR 0004, ADR 0006).
- Read the current time from an injected `TimeProvider`.

## Area rules

- `src/` and `tests/`: `src/AGENTS.md`
- `web/`: `web/AGENTS.md`
- Decisions: `docs/adr/`. Domain vocabulary: `docs/glossary.md`.
