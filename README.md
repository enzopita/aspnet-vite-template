English | [Português (Brasil)](README.pt-BR.md)

# ASP.NET + Vite Template (`App`)

Modular monolith template with a **.NET 11** backend (vertical slices, PostgreSQL 18, EF Core 11, Aspire 17), a **Vite 8 + React 19 + TypeScript 7 + TanStack** SPA, automated code-level governance, an **OpenAPI 3.1 → Kubb** typed client pipeline, **Lingui** i18n, and a multi-harness AI agent workflow (**Claude Code**, **Antigravity**, and **OpenCode**).

## Overview

- **Backend:** .NET 11 (`net11.0`) modular monolith (`App.slnx`) organized by isolated business modules and single-use-case vertical slices, orchestrated with .NET Aspire (`src/App.AppHost`).
- **Frontend:** Vite 8 + React 19 (React Compiler) + TypeScript 7 (`tsc -b`) + TanStack Router, Query, Form, Table, and Virtual + Tailwind CSS v4 + Base UI / shadcn components (`web/`).
- **Contract-first API pipeline:** Building `src/App.Api` emits an OpenAPI 3.1 specification (`web/openapi/app.json`), from which Kubb generates TypeScript types, Zod 4 schemas, Fetch clients, TanStack Query hooks, and MSW mock handlers (`web/src/lib/api/gen/`).
- **Automated governance:** Roslyn/IDE analyzers (`TreatWarningsAsErrors`), `BannedApiAnalyzers` (blocking sync-over-async, `[SuppressMessage]`, skipped tests, and `DateTime.Now`/`UtcNow` outside tests), `ArchUnitNET` architecture tests, `Oxlint` (`--type-aware`), `Oxfmt`, `lint-extra.mjs`, `react-doctor`, and `commitlint`.
- **Single-source gates & AI agent workflow:** `scripts/verify.mjs` drives local task verification, `lefthook` `pre-push`, and GitHub Actions CI, while `scripts/agents/` enforces worktree role isolation, scoped task specs, and a trusted PR fence.

## Prerequisites

| Requirement | Version / Constraint | Notes |
|---|---|---|
| **.NET SDK** | `11.0.100` (`rollForward: latestFeature`) | Pinned in [global.json](global.json) |
| **Node.js** | `>= 26` | Configured in [web/package.json](web/package.json) |
| **pnpm** | `12.21.0` | Declared via `packageManager` in [web/package.json](web/package.json) |
| **Docker** | Engine running locally | Required for Aspire PostgreSQL container (`18-alpine`), `App.Api.IntegrationTests` (Testcontainers), and optional `hadolint` / `actionlint` hooks |

## Quick Start

### 1. Initial setup

```bash
# Restore local .NET tools (dotnet-ef 11.0.0 from dotnet-tools.json)
dotnet tool restore

# Install frontend dependencies and configure Lefthook git hooks
pnpm --dir web install

# Install headless Chromium for Vitest browser component/flow tests
pnpm --dir web exec playwright install --only-shell chromium
```

### 2. Run with .NET Aspire (recommended)

Starts PostgreSQL (`18-alpine`), `App.Api`, and the Vite dev server together:

```bash
dotnet run --project src/App.AppHost
```

### 3. Run standalone (API + Vite separately)

Requires a PostgreSQL instance configured for `src/App.Api` (for example via user secrets or `appsettings.Development.json`):

```bash
# Terminal 1 — API (default launch profile: https://localhost:7180 and http://localhost:5180)
dotnet run --project src/App.Api

# Terminal 2 — Vite SPA (http://localhost:5173, proxies /api and /openapi to the API)
pnpm --dir web dev
```

In `Development` (and `Testing`), the OpenAPI 3.1 document is served at `/openapi/v1.json`. In `Development`, the Scalar API reference UI is available at `/scalar`.

## Architecture

### Repository layout

```text
.
├── src/
│   ├── App.AppHost/              # .NET Aspire orchestration (PostgreSQL 18, App.Api, Vite)
│   ├── App.ServiceDefaults/      # OpenTelemetry, resilience, health checks, service discovery
│   ├── App.Api/                  # HTTP host, OpenAPI 3.1 generation, Scalar UI, Problem Details, SPA hosting
│   ├── App.SharedKernel/         # Pure domain primitives (Result, Error) — BCL only
│   ├── App.BuildingBlocks/       # Shared HTTP (ToProblem) and EF migration helpers
│   └── Modules/
│       └── Catalog/              # Reference domain module (replace with your own before removing)
│           ├── App.Catalog.Contracts/   # Public DTOs, query interfaces, integration events
│           └── App.Catalog/
│               ├── Domain/              # Entities/value objects (no EF/ASP.NET dependencies)
│               ├── Features/<Area>/<Slice>/  # Request, Response, Handler, Endpoint per use case
│               ├── Persistence/         # CatalogDbContext (own schema), configurations, migrations
│               └── CatalogModule.cs     # AddCatalogModule() + MapCatalogEndpoints()
├── tests/
│   ├── App.ArchitectureTests/    # ArchUnitNET dependency rules + GovernanceTests (no Docker needed)
│   └── App.Api.IntegrationTests/ # Real HTTP + PostgreSQL tests via Testcontainers
├── web/
│   ├── openapi/                  # Build-generated OpenAPI 3.1 contract (app.json)
│   └── src/
│       ├── app/                  # Router, QueryClient, whole-app tests, generated route-tree.gen.ts
│       ├── routes/               # Thin TanStack Router file routes
│       ├── features/             # Vertical frontend features (api/, components/, schemas/, index.ts)
│       ├── components/
│       │   ├── ui/               # shadcn / Base UI primitives (CLI-managed)
│       │   └── patterns/         # Composed design-kit abstractions (e.g., useAppForm)
│       ├── lib/
│       │   ├── api/gen/          # Kubb-generated types, Zod 4 schemas, Fetch clients, Query hooks, MSW
│       │   ├── api/problem.ts    # Problem Details mapper by stable error code
│       │   └── i18n/             # Lingui runtime configuration
│       ├── locales/              # Message catalogs (pt-BR source, en target)
│       ├── styles/               # Tailwind CSS v4 entry + design tokens (tokens.css)
│       └── test/                 # Vitest browser setup, MSW worker/handlers, render helpers
├── governance/                   # BannedSymbols*.txt, allowed-suppressions.txt, nowarn.json
├── scripts/                      # Unified verify runner, lint-extra, i18n/generated checks, agent tooling
├── docs/
│   ├── adr/                      # Architecture Decision Records (0001–0009)
│   ├── agents/                   # Reference slices, findings.jsonl, red-team report
│   ├── tasks/                    # Task spec contract docs + _template.md
│   └── glossary.md               # Canonical domain terms
├── .agents/                      # Antigravity hooks, knowledge MCP plugin, skills (canonical source)
├── .claude/                      # Claude Code hooks (settings.json) + symlink to .agents/skills
├── .opencode/                    # OpenCode V2 guard plugin (app-guard)
└── .github/                      # CODEOWNERS + backend, web, fence, and commitlint workflows
```

### Key architectural rules

- **Backend modular monolith ([ADR 0002](docs/adr/0002-modular-monolith-with-vertical-slices.md), [ADR 0003](docs/adr/0003-dependency-rules.md)):**
  - Module types are `internal` by default; only `<Module>.Contracts` projects expose public DTOs/interfaces, and `<Module>Module` exposes DI/endpoint registration (`Add<Module>Module()` / `Map<Module>Endpoints()`).
  - Vertical slices inside `Features/<Area>/<Slice>/` cannot depend on other slices; cross-module communication uses `*.Contracts` only.
  - `Domain/` stays free of EF Core and ASP.NET Core; `App.SharedKernel` depends on the BCL only; `TimeProvider` is injected instead of `DateTime.Now`/`UtcNow`.
  - Enforced continuously by [App.ArchitectureTests](tests/App.ArchitectureTests/) and Roslyn `BannedApiAnalyzers` (`RS0030`).
- **HTTP API & OpenAPI → Kubb pipeline ([ADR 0004](docs/adr/0004-http-api-conventions.md), [ADR 0007](docs/adr/0007-api-client-generation.md)):**
  - Versioned kebab-case endpoints (`/api/v{n}/<module>/...`) with camelCase JSON (`DateOnly` for calendar dates, UTC `DateTimeOffset` for instants).
  - Domain/application failures return `Result`/`Error` mapped through `ToProblem()` into RFC 9457 Problem Details carrying a stable `code` extension (`<module>.<entity>.<reason>`).
  - `dotnet build src/App.Api` updates `web/openapi/app.json` (OpenAPI 3.1). Running `pnpm --dir web api:generate` regenerates TypeScript types, Zod 4 schemas, Fetch clients, React Query hooks, and MSW handlers in `web/src/lib/api/gen/`.
- **Frontend stack & i18n ([ADR 0005](docs/adr/0005-frontend-stack.md), [ADR 0006](docs/adr/0006-internationalization.md)):**
  - Imports flow one way: `routes → features → components/patterns → components/ui → lib`. Cross-feature imports must go through `<feature>/index.ts`.
  - Server data loads via TanStack Router `loader` + TanStack Query; forms use `useAppForm` (TanStack Form + Zod) and localized Problem `code` mapping.
  - All UI copy goes through Lingui (`<Trans>` in JSX, or module-level `msg` + `i18n._(…)` to stay compatible with React Compiler). `pt-BR` is the source locale and `en` must remain 100% translated (`check-i18n.mjs`).
  - `Oxlint` (`--type-aware`), `scripts/lint-extra.mjs` (blocks raw Tailwind palette/arbitrary colors, magic motion durations, `oxlint-disable`, skipped tests, literal UI text), `Oxfmt`, and `react-doctor` enforce frontend rules.
- **Testing strategy:**
  - **Backend:** xUnit v3 + Microsoft.Testing.Platform (`global.json`). `App.ArchitectureTests` validates module/slice boundaries and governance files with zero external containers; `App.Api.IntegrationTests` runs against real PostgreSQL via Testcontainers. Concurrency test classes (`*ConcurrencyTests`) are automatically re-run **10×** by `verify`.
  - **Frontend:** Vitest runs two projects (`web/vitest.config.ts`): `unit` (`*.test.ts` in Node) and `browser` (`*.test.tsx` in headless Chromium via Playwright with generated MSW handlers).
  - **Tooling:** Node built-in test runner (`node --test scripts/`) covers verification planning, `lint-extra`, hooks, and task fence logic.

## Commands Reference

### Unified verification (`scripts/verify.mjs`)

| Command | Purpose |
|---|---|
| `node scripts/verify.mjs --mode pre-push` | Run all 12 quality gates (backend build/format/tests, OpenAPI/Kubb/route-tree checks, web check/tests, script tests, i18n, React Doctor) |
| `node scripts/verify.mjs --mode task` | Run diff-scoped gates for the current branch (`--task <id>` optional), plus 10× `*ConcurrencyTests` and task `verify` commands |
| `node scripts/verify.mjs --mode ci --area backend` | Run backend CI gates (Release build, `web/openapi` diff check, format check, Release tests) |
| `node scripts/verify.mjs --mode ci --area web` | Run frontend CI gates (`api:generate`, `build`, `check-generated`, `check`, `test`, `scripts/` tests, `i18n`, React Doctor) |
| `node scripts/verify.mjs --mode ci --area all` | Run both backend and web CI gate sets |
| `node scripts/verify.mjs --mode task --dry-run --json` | Inspect which gates would run without executing them |

### Backend (.NET 11)

| Command | Purpose |
|---|---|
| `dotnet run --project src/App.AppHost` | Start PostgreSQL 18 + API + Vite via Aspire |
| `dotnet run --project src/App.Api` | Run API host standalone (`https://localhost:7180` / `http://localhost:5180`) |
| `dotnet build App.slnx` | Build solution with warnings/code-style as errors; `dotnet build src/App.Api` also regenerates `web/openapi/app.json` |
| `dotnet test --solution App.slnx` | Run all .NET tests (requires Docker for integration tests) |
| `dotnet test --project tests/App.ArchitectureTests` | Run architecture and governance tests (no Docker required) |
| `dotnet test --project tests/App.Api.IntegrationTests` | Run API integration tests against Testcontainers PostgreSQL |
| `dotnet format App.slnx --verify-no-changes --no-restore` | Check C# formatting (`dotnet format App.slnx` / `dotnet format style App.slnx --severity warn` to auto-fix) |
| `dotnet ef migrations add <Name> --project src/Modules/<Module>/App.<Module> --startup-project src/App.Api --context <Module>DbContext --output-dir Persistence/Migrations` | Add an append-only EF Core migration for a module |

### Frontend (`web/`) and Scripts

| Command | Purpose |
|---|---|
| `pnpm --dir web dev` | Start Vite dev server on `http://localhost:5173` |
| `pnpm --dir web build` | Build production bundle, regenerate `web/src/app/route-tree.gen.ts`, and run `tsc -b` |
| `pnpm --dir web check` | Run TypeScript 7 typecheck (`tsc -b`), `oxlint --type-aware`, `lint-extra.mjs`, and `oxfmt --check` |
| `pnpm --dir web lint:fix` / `pnpm --dir web fmt` | Auto-fix Oxlint issues / format frontend files with Oxfmt |
| `pnpm --dir web test` / `pnpm --dir web test:watch` | Run Vitest unit (Node) and browser (Chromium + MSW) tests |
| `pnpm --dir web api:generate` | Regenerate `web/src/lib/api/gen/` from `web/openapi/app.json` via Kubb |
| `pnpm --dir web i18n:extract` | Extract Lingui messages into `web/src/locales/*/messages.po` |
| `node scripts/check-i18n.mjs` | Fail if any non-source locale has empty translations |
| `pnpm --dir web exec react-doctor . --yes --no-score --blocking warning` | Run React Doctor static checks |
| `node scripts/check-generated.mjs` | Verify `web/openapi/`, `web/src/lib/api/gen/`, and `web/src/app/route-tree.gen.ts` match committed files |
| `node --test scripts/` | Run Node unit tests for `verify`, `lint-extra`, hooks, and task tooling |

### Agent task tooling (`scripts/agents/task.mjs`)

| Command | Purpose |
|---|---|
| `node scripts/agents/task.mjs list` | List tasks in `docs/tasks/` and their current status |
| `node scripts/agents/task.mjs new <slug> --title "<title>"` | Create `docs/tasks/NNNN-<slug>.md` from `_template.md` (planner) |
| `node scripts/agents/task.mjs start <id>` | Create sibling executor worktree (`../<repo>-task-NNNN` on `task/NNNN-*`), set `agent-role = executor`, mark `in-progress`, print brief |
| `node scripts/agents/task.mjs brief <id>` | Reprint executor brief for task `<id>` |
| `node scripts/agents/task.mjs check [--staged]` | Validate task fence (`allow`, `unlock`, `frozen`, `PROTECTED`, spec integrity) |
| `node scripts/agents/task.mjs verify [--task <id>]` | Run `check`, diff-scoped `verify.mjs --mode task`, and task `verify` commands; records verify fingerprint |
| `node scripts/agents/task.mjs review <id>` | Create sibling reviewer worktree (`../<repo>-review-NNNN` on `review/NNNN-*`) from `task/*` and print review instructions |

## Agent Workflow, Governance & CI

- **Role by worktree ([ADR 0008](docs/adr/0008-agent-task-workflow.md)):**
  - **Orchestrator (main checkout):** Plans tasks (`plan-task`), reviews work (`review-task`), updates `PROTECTED` rules/manifests, and merges to `main`.
  - **Executor (`task/NNNN-*` worktree):** Follows `.agents/skills/execute-task/SKILL.md`. Constrained to the task spec's `allow:` globs; cannot edit `PROTECTED` files (`scripts/agents/lib.mjs`), alter `frozen:` black-box tests, bypass hooks, push, add unapproved dependencies, or remove existing EF migrations.
  - **Reviewer (`review/NNNN-*` worktree):** Checks diff against `main` (`diff-audit`), re-runs `verify`, can polish within `allow:` and update `## Review` / `status: done`, then merges to `main`.
- **Multi-harness support:**
  - Instructions: `AGENTS.md`, `src/AGENTS.md`, `web/AGENTS.md` (no `CLAUDE.md`/`GEMINI.md` shims needed; both names remain in `PROTECTED` and `opencode.jsonc` to prevent shadowing `AGENTS.md`).
  - Skills: `.agents/skills/` (`plan-task`, `execute-task`, `review-task`, `diff-audit`, `look-it-up`), symlinked at `.claude/skills`.
  - Lifecycle hooks: Unified `scripts/agents/agent-hook.mjs` wired for Claude Code (`.claude/settings.json`), Antigravity (`.agents/hooks.json`), and OpenCode V2 (`.opencode/plugins/app-guard/index.mjs` + `opencode.jsonc`).
  - Knowledge MCPs: `microsoft-learn`, `context7`, and planner-only `nuget` configured in `.mcp.json`, `.agents/plugins/app-knowledge/`, and `opencode.jsonc`.
- **Git hooks & CI ([ADR 0009](docs/adr/0009-ci.md)):**
  - **Lefthook (`lefthook.yml`):** `pre-commit` (Oxfmt, Oxlint, `lint-extra`, `tsc -b`, Lingui extract + completeness, `dotnet format`, `App.ArchitectureTests`, `task.mjs check --staged`, and containerized `hadolint` / `actionlint` when applicable), `commit-msg` (`commitlint` requiring ASCII English Conventional Commits with scopes from `web/commitlint.config.mjs`), and `pre-push` (`scripts/verify.mjs --mode pre-push`).
  - **GitHub Actions (`.github/workflows/`):** `backend.yml`, `web.yml`, `commitlint.yml`, and trusted `fence.yml` (`pull_request_target` reading `scripts/` strictly from `main` to run `task.mjs check` against the PR head SHA), alongside `.github/CODEOWNERS` guarding `.github/`, `scripts/`, and `governance/`.

## Using This Repository as a Template

1. **Create your repository:** On GitHub, enable **Settings → General → Template repository** (if self-hosting/mirroring) or click **Use this template → Create a new repository**, then clone locally and run the steps in [Quick Start](#quick-start).
2. **Recreate branch protection / rulesets on GitHub:** GitHub does not copy repository rulesets to new template instances. Protect `main` by requiring pull requests, blocking force-pushes and branch deletion, and requiring the status checks **`backend`**, **`web`**, and **`fence`** (and code-owner review if desired).
3. **Update ownership and metadata:** Replace `@enzopita` in [`.github/CODEOWNERS`](.github/CODEOWNERS) with your GitHub user/team, and update [`LICENSE`](LICENSE) or package metadata in [`Directory.Build.props`](Directory.Build.props) / [`web/package.json`](web/package.json) as needed.
4. **Optionally rename the `App` prefix:** Keep the neutral `App` namespace/package prefix or rename `App.slnx`, `App.*` projects/namespaces, and `@app/web` consistently across solution, code, and configs before building out modules.
5. **Replace the reference `Catalog` module:** `App.ArchitectureTests` requires at least one `<Module>` and `<Module>.Contracts` assembly, so add your first domain module first, register its scope in [`web/commitlint.config.mjs`](web/commitlint.config.mjs), update [`docs/glossary.md`](docs/glossary.md) and [`docs/agents/reference-slices.md`](docs/agents/reference-slices.md), and then follow [Removing the example module](docs/agents/reference-slices.md#removing-the-example-module).
6. **Verify everything passes:**

   ```bash
   node scripts/verify.mjs --mode pre-push
   ```

## Documentation Index

- **Agent entrypoints:** [AGENTS.md](AGENTS.md) · [src/AGENTS.md](src/AGENTS.md) · [web/AGENTS.md](web/AGENTS.md)
- **Architecture Decision Records:**
  - [0001 — Record architecture decisions](docs/adr/0001-record-architecture-decisions.md)
  - [0002 — Modular monolith with vertical slices](docs/adr/0002-modular-monolith-with-vertical-slices.md)
  - [0003 — Dependency rules and their enforcement](docs/adr/0003-dependency-rules.md)
  - [0004 — HTTP API conventions](docs/adr/0004-http-api-conventions.md)
  - [0005 — Frontend stack and structure](docs/adr/0005-frontend-stack.md)
  - [0006 — Internationalization](docs/adr/0006-internationalization.md)
  - [0007 — TypeScript API client generation](docs/adr/0007-api-client-generation.md)
  - [0008 — Agent task workflow: planner, executors, fence](docs/adr/0008-agent-task-workflow.md)
  - [0009 — CI](docs/adr/0009-ci.md)
- **Workflow & domain guides:** [Tasks guide](docs/tasks/README.md) · [Reference slices](docs/agents/reference-slices.md) · [Glossary](docs/glossary.md) · [Red Team report (2026-11-23)](docs/agents/red-team-2026-11-23.md)
