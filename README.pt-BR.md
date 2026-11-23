[English](README.md) | Português (Brasil)

# ASP.NET + Vite Template (`App`)

Template de monolito modular com backend **.NET 11** (vertical slices, PostgreSQL 18, EF Core 11, Aspire 17), SPA **Vite 8 + React 19 + TypeScript 7 + TanStack**, governança automatizada no código, pipeline **OpenAPI 3.1 → Kubb** para o cliente tipado, i18n com **Lingui** e fluxo de agentes multi-harness (**Claude Code**, **Antigravity** e **OpenCode**).

## Visão geral

- **Backend:** Monolito modular em .NET 11 (`net11.0`, `App.slnx`) organizado em módulos de domínio isolados e vertical slices por caso de uso, orquestrado com .NET Aspire (`src/App.AppHost`).
- **Frontend:** SPA em Vite 8 + React 19 (React Compiler) + TypeScript 7 (`tsc -b`) + TanStack Router, Query, Form, Table e Virtual + Tailwind CSS v4 + componentes Base UI / shadcn (`web/`).
- **Pipeline orientado a contrato:** O build de `src/App.Api` gera a especificação OpenAPI 3.1 (`web/openapi/app.json`), a partir da qual o Kubb gera tipos TypeScript, schemas Zod 4, clientes Fetch, hooks do TanStack Query e handlers do MSW (`web/src/lib/api/gen/`).
- **Governança automatizada:** Analyzers Roslyn/IDE (`TreatWarningsAsErrors`), `BannedApiAnalyzers` (bloqueando sync-over-async, `[SuppressMessage]`, testes pulados e `DateTime.Now`/`UtcNow` em produção), testes de arquitetura com `ArchUnitNET`, `Oxlint` (`--type-aware`), `Oxfmt`, `lint-extra.mjs`, `react-doctor` e `commitlint`.
- **Gates em fonte única e fluxo de agentes:** `scripts/verify.mjs` centraliza a verificação das tarefas, o hook `pre-push` do Lefthook e os workflows do GitHub Actions, enquanto `scripts/agents/` aplica papéis por worktree, specs escopadas e fence confiável no CI.

## Pré-requisitos

| Requisito | Versão / Restrição | Observações |
|---|---|---|
| **.NET SDK** | `11.0.100` (`rollForward: latestFeature`) | Fixado em [global.json](global.json) |
| **Node.js** | `>= 26` | Configurado em [web/package.json](web/package.json) |
| **pnpm** | `12.21.0` | Declarado em `packageManager` no [web/package.json](web/package.json) |
| **Docker** | Engine em execução | Necessário para o PostgreSQL do Aspire (`18-alpine`), `App.Api.IntegrationTests` (Testcontainers) e hooks opcionais de `hadolint` / `actionlint` |

## Início rápido

### 1. Configuração inicial

```bash
# Restaurar ferramentas .NET locais (dotnet-ef 11.0.0 a partir do dotnet-tools.json)
dotnet tool restore

# Instalar dependências do frontend e configurar os hooks git do Lefthook
pnpm --dir web install

# Instalar o Chromium headless para os testes de componente/fluxo no Vitest
pnpm --dir web exec playwright install --only-shell chromium
```

### 2. Executar com .NET Aspire (recomendado)

Sobe PostgreSQL (`18-alpine`), `App.Api` e o servidor de desenvolvimento do Vite juntos:

```bash
dotnet run --project src/App.AppHost
```

### 3. Executar separado (API + Vite)

Requer uma instância PostgreSQL configurada para `src/App.Api` (por exemplo via user secrets ou `appsettings.Development.json`):

```bash
# Terminal 1 — API (perfil padrão: https://localhost:7180 e http://localhost:5180)
dotnet run --project src/App.Api

# Terminal 2 — SPA Vite (http://localhost:5173, faz proxy de /api e /openapi para a API)
pnpm --dir web dev
```

Em `Development` (e `Testing`), o documento OpenAPI 3.1 é servido em `/openapi/v1.json`. Em `Development`, a interface Scalar fica disponível em `/scalar`.

## Arquitetura

### Estrutura do repositório

```text
.
├── src/
│   ├── App.AppHost/              # Orquestração .NET Aspire (PostgreSQL 18, App.Api, Vite)
│   ├── App.ServiceDefaults/      # OpenTelemetry, resiliência, health checks e service discovery
│   ├── App.Api/                  # Host HTTP, geração OpenAPI 3.1, Scalar UI, Problem Details, host da SPA
│   ├── App.SharedKernel/         # Primitivas puras de domínio (Result, Error) — apenas BCL
│   ├── App.BuildingBlocks/       # Helpers compartilhados de HTTP (ToProblem) e migrations EF
│   └── Modules/
│       └── Catalog/              # Módulo de referência (substitua pelo seu módulo antes de remover)
│           ├── App.Catalog.Contracts/   # DTOs públicos, interfaces de consulta e eventos de integração
│           └── App.Catalog/
│               ├── Domain/              # Entidades e value objects (sem dependência de EF/ASP.NET)
│               ├── Features/<Area>/<Slice>/  # Request, Response, Handler e Endpoint por caso de uso
│               ├── Persistence/         # CatalogDbContext (schema próprio), configurações e migrations
│               └── CatalogModule.cs     # AddCatalogModule() + MapCatalogEndpoints()
├── tests/
│   ├── App.ArchitectureTests/    # Regras de dependência (ArchUnitNET) + GovernanceTests (sem Docker)
│   └── App.Api.IntegrationTests/ # Testes reais HTTP + PostgreSQL via Testcontainers
├── web/
│   ├── openapi/                  # Contrato OpenAPI 3.1 gerado no build (app.json)
│   └── src/
│       ├── app/                  # Router, QueryClient, testes de fluxo e route-tree.gen.ts gerado
│       ├── routes/               # Rotas finas do TanStack Router por arquivo
│       ├── features/             # Features verticais (api/, components/, schemas/, index.ts)
│       ├── components/
│       │   ├── ui/               # Primitivos shadcn / Base UI (gerenciados pela CLI)
│       │   └── patterns/         # Componentes compostos do design kit (ex.: useAppForm)
│       ├── lib/
│       │   ├── api/gen/          # Tipos, schemas Zod 4, clientes Fetch, hooks Query e MSW gerados pelo Kubb
│       │   ├── api/problem.ts    # Mapeador de Problem Details por código de erro estável
│       │   └── i18n/             # Configuração do runtime Lingui
│       ├── locales/              # Catálogos de mensagens (pt-BR origem, en alvo)
│       ├── styles/               # Entrada Tailwind CSS v4 + design tokens (tokens.css)
│       └── test/                 # Setup Vitest browser, MSW worker/handlers e helpers de renderização
├── governance/                   # BannedSymbols*.txt, allowed-suppressions.txt e nowarn.json
├── scripts/                      # Runner único verify, lint-extra, checks de i18n/gerados e scripts de agentes
├── docs/
│   ├── adr/                      # Architecture Decision Records (0001–0009)
│   ├── agents/                   # Reference slices, findings.jsonl e relatório de red team
│   ├── tasks/                    # Contrato de task specs + _template.md
│   └── glossary.md               # Vocabulário canônico do domínio
├── .agents/                      # Hooks do Antigravity, plugin MCP de conhecimento e skills (fonte canônica)
├── .claude/                      # Hooks do Claude Code (settings.json) + symlink para .agents/skills
├── .opencode/                    # Plugin V2 de guarda do OpenCode (app-guard)
└── .github/                      # CODEOWNERS + workflows backend, web, fence e commitlint
```

### Regras arquiteturais principais

- **Monolito modular no backend ([ADR 0002](docs/adr/0002-modular-monolith-with-vertical-slices.md), [ADR 0003](docs/adr/0003-dependency-rules.md)):**
  - Os tipos dos módulos são `internal` por padrão; apenas projetos `<Module>.Contracts` expõem contratos públicos, e `<Module>Module` expõe `Add<Module>Module()` / `Map<Module>Endpoints()`.
  - Vertical slices em `Features/<Area>/<Slice>/` não dependem de outras slices; a comunicação entre módulos passa exclusivamente por `*.Contracts`.
  - `Domain/` não depende de EF Core nem ASP.NET Core; `App.SharedKernel` depende apenas da BCL; o relógio é injetado via `TimeProvider` (sem `DateTime.Now`/`UtcNow` em produção).
  - Aplicado continuamente por [App.ArchitectureTests](tests/App.ArchitectureTests/) e `BannedApiAnalyzers` (`RS0030`).
- **API HTTP e pipeline OpenAPI → Kubb ([ADR 0004](docs/adr/0004-http-api-conventions.md), [ADR 0007](docs/adr/0007-api-client-generation.md)):**
  - Endpoints versionados em kebab-case (`/api/v{n}/<module>/...`) com JSON camelCase (`DateOnly` para datas de calendário e `DateTimeOffset` em UTC para instantes).
  - Falhas retornam `Result`/`Error` convertidos por `ToProblem()` para RFC 9457 Problem Details com `code` estável (`<module>.<entity>.<reason>`).
  - `dotnet build src/App.Api` atualiza `web/openapi/app.json` (OpenAPI 3.1). `pnpm --dir web api:generate` regenera tipos, schemas Zod 4, clientes Fetch, hooks do TanStack Query e handlers MSW em `web/src/lib/api/gen/`.
- **Frontend e i18n ([ADR 0005](docs/adr/0005-frontend-stack.md), [ADR 0006](docs/adr/0006-internationalization.md)):**
  - Imports fluem em direção única: `routes → features → components/patterns → components/ui → lib`. Imports entre features passam apenas por `<feature>/index.ts`.
  - Estado de servidor é carregado no `loader` das rotas com TanStack Query; formulários usam `useAppForm` (TanStack Form + Zod) e mapeamento localizável por `code` de Problem Details.
  - Textos de UI usam Lingui (`<Trans>` em JSX ou `msg` no nível de módulo + `i18n._(…)` para compatibilidade com o React Compiler). `pt-BR` é o idioma fonte e `en` deve estar 100% traduzido (`check-i18n.mjs`).
  - `Oxlint` (`--type-aware`), `scripts/lint-extra.mjs` (bloqueia cores Tailwind cruas/arbitrárias, durações mágicas de animação, `oxlint-disable`, testes pulados e texto literal de UI), `Oxfmt` e `react-doctor` validam o código.
- **Estratégia de testes:**
  - **Backend:** xUnit v3 + Microsoft.Testing.Platform (`global.json`). `App.ArchitectureTests` valida fronteiras e arquivos de governança sem containers; `App.Api.IntegrationTests` testa contra PostgreSQL real via Testcontainers. Classes `*ConcurrencyTests` são reexecutadas **10×** pelo `verify`.
  - **Frontend:** Vitest roda dois projetos (`web/vitest.config.ts`): `unit` (`*.test.ts` em Node) e `browser` (`*.test.tsx` em Chromium headless via Playwright com handlers MSW gerados).
  - **Tooling:** Node test runner (`node --test scripts/`) cobre `verify`, `lint-extra`, hooks e fence de tarefas.

## Referência de comandos

### Verificação unificada (`scripts/verify.mjs`)

| Comando | Finalidade |
|---|---|
| `node scripts/verify.mjs --mode pre-push` | Executa todos os 12 gates (build/format/testes .NET, checagem de OpenAPI/Kubb/rotas geradas, check e testes web, testes de scripts, i18n e React Doctor) |
| `node scripts/verify.mjs --mode task` | Executa apenas os gates dos arquivos alterados na branch (`--task <id>` opcional), mais 10× `*ConcurrencyTests` e comandos `verify` da task |
| `node scripts/verify.mjs --mode ci --area backend` | Executa os gates de CI do backend (build Release, diff de `web/openapi`, format check e testes Release) |
| `node scripts/verify.mjs --mode ci --area web` | Executa os gates de CI do frontend (`api:generate`, `build`, `check-generated`, `check`, `test`, testes de `scripts/`, `i18n` e React Doctor) |
| `node scripts/verify.mjs --mode ci --area all` | Executa os gates de CI de backend e web |
| `node scripts/verify.mjs --mode task --dry-run --json` | Lista os gates planejados sem executá-los |

### Backend (.NET 11)

| Comando | Finalidade |
|---|---|
| `dotnet run --project src/App.AppHost` | Inicia PostgreSQL 18 + API + Vite via Aspire |
| `dotnet run --project src/App.Api` | Sobe a API isolada (`https://localhost:7180` / `http://localhost:5180`) |
| `dotnet build App.slnx` | Compila a solution com warnings/code-style como erro; `dotnet build src/App.Api` também regenera `web/openapi/app.json` |
| `dotnet test --solution App.slnx` | Executa todos os testes .NET (requer Docker para os testes de integração) |
| `dotnet test --project tests/App.ArchitectureTests` | Executa testes de arquitetura e governança (não requer Docker) |
| `dotnet test --project tests/App.Api.IntegrationTests` | Executa testes de integração contra PostgreSQL via Testcontainers |
| `dotnet format App.slnx --verify-no-changes --no-restore` | Verifica formatação C# (`dotnet format App.slnx` / `dotnet format style App.slnx --severity warn` para corrigir) |
| `dotnet ef migrations add <Name> --project src/Modules/<Module>/App.<Module> --startup-project src/App.Api --context <Module>DbContext --output-dir Persistence/Migrations` | Adiciona uma migration EF Core append-only para o módulo |

### Frontend (`web/`) e Scripts

| Comando | Finalidade |
|---|---|
| `pnpm --dir web dev` | Inicia o servidor Vite em `http://localhost:5173` |
| `pnpm --dir web build` | Faz o build de produção, regenera `web/src/app/route-tree.gen.ts` e roda `tsc -b` |
| `pnpm --dir web check` | Roda TypeScript 7 (`tsc -b`), `oxlint --type-aware`, `lint-extra.mjs` e `oxfmt --check` |
| `pnpm --dir web lint:fix` / `pnpm --dir web fmt` | Corrige problemas do Oxlint / formata arquivos com Oxfmt |
| `pnpm --dir web test` / `pnpm --dir web test:watch` | Executa testes Vitest unitários (Node) e no browser (Chromium + MSW) |
| `pnpm --dir web api:generate` | Regenera `web/src/lib/api/gen/` a partir de `web/openapi/app.json` via Kubb |
| `pnpm --dir web i18n:extract` | Extrai mensagens Lingui para `web/src/locales/*/messages.po` |
| `node scripts/check-i18n.mjs` | Falha se algum catálogo alvo tiver traduções vazias |
| `pnpm --dir web exec react-doctor . --yes --no-score --blocking warning` | Executa análise estática React Doctor |
| `node scripts/check-generated.mjs` | Garante que `web/openapi/`, `web/src/lib/api/gen/` e `web/src/app/route-tree.gen.ts` estão atualizados |
| `node --test scripts/` | Executa os testes Node de `verify`, `lint-extra`, hooks e fluxo de tasks |

### Ferramentas de tarefas para agentes (`scripts/agents/task.mjs`)

| Comando | Finalidade |
|---|---|
| `node scripts/agents/task.mjs list` | Lista as tarefas em `docs/tasks/` e seus status |
| `node scripts/agents/task.mjs new <slug> --title "<title>"` | Cria `docs/tasks/NNNN-<slug>.md` a partir de `_template.md` (planner) |
| `node scripts/agents/task.mjs start <id>` | Cria worktree do executor (`../<repo>-task-NNNN` em `task/NNNN-*`), grava `agent-role = executor`, marca `in-progress` e imprime o brief |
| `node scripts/agents/task.mjs brief <id>` | Reimprime o brief do executor para a task `<id>` |
| `node scripts/agents/task.mjs check [--staged]` | Valida o fence da task (`allow`, `unlock`, `frozen`, `PROTECTED` e integridade da spec) |
| `node scripts/agents/task.mjs verify [--task <id>]` | Executa `check`, `verify.mjs --mode task` e os comandos `verify` da task, gravando o fingerprint |
| `node scripts/agents/task.mjs review <id>` | Cria worktree do revisor (`../<repo>-review-NNNN` em `review/NNNN-*`) a partir de `task/*` e imprime as instruções de revisão |

## Fluxo de agentes, governança e CI

- **Papel definido pelo local ([ADR 0008](docs/adr/0008-agent-task-workflow.md)):**
  - **Orquestrador (checkout principal):** Planeja tarefas (`plan-task`), revisa PRs/worktrees (`review-task`), mantém arquivos `PROTECTED` e faz merge na `main`.
  - **Executor (worktree `task/NNNN-*`):** Segue `.agents/skills/execute-task/SKILL.md`. Fica restrito aos caminhos `allow:` da task; não altera arquivos `PROTECTED` (`scripts/agents/lib.mjs`), não edita testes `frozen:`, não pula hooks, não faz `git push`, não adiciona pacotes sem `unlock:` e não remove migrations existentes.
  - **Revisor (worktree `review/NNNN-*`):** Audita o diff contra a `main` (`diff-audit`), reexecuta o `verify`, pode polir dentro de `allow:`, atualiza `## Review` / `status: done` e faz o merge na `main`.
- **Suporte multi-harness:**
  - Instruções: `AGENTS.md`, `src/AGENTS.md`, `web/AGENTS.md` (sem shims `CLAUDE.md`/`GEMINI.md`; ambos permanecem em `PROTECTED` e `opencode.jsonc` para evitar shadowing do `AGENTS.md`).
  - Skills: `.agents/skills/` (`plan-task`, `execute-task`, `review-task`, `diff-audit`, `look-it-up`), espelhadas via symlink em `.claude/skills`.
  - Hooks de ciclo de vida: `scripts/agents/agent-hook.mjs` conectado ao Claude Code (`.claude/settings.json`), Antigravity (`.agents/hooks.json`) e OpenCode V2 (`.opencode/plugins/app-guard/index.mjs` + `opencode.jsonc`).
  - MCPs de conhecimento: `microsoft-learn`, `context7` e `nuget` (exclusivo do planner) configurados em `.mcp.json`, `.agents/plugins/app-knowledge/` e `opencode.jsonc`.
- **Git hooks e CI ([ADR 0009](docs/adr/0009-ci.md)):**
  - **Lefthook (`lefthook.yml`):** `pre-commit` (Oxfmt, Oxlint, `lint-extra`, `tsc -b`, extract + completude do Lingui, `dotnet format`, `App.ArchitectureTests`, `task.mjs check --staged`, e `hadolint` / `actionlint` em container quando aplicável), `commit-msg` (`commitlint` exigindo Conventional Commits em inglês ASCII com escopos de `web/commitlint.config.mjs`) e `pre-push` (`scripts/verify.mjs --mode pre-push`).
  - **GitHub Actions (`.github/workflows/`):** `backend.yml`, `web.yml`, `commitlint.yml` e o workflow confiável `fence.yml` (`pull_request_target` rodando `scripts/` da `main` para validar `task.mjs check` no SHA do PR), além de `.github/CODEOWNERS` protegendo `.github/`, `scripts/` e `governance/`.

## Como usar este repositório como template

1. **Crie o novo repositório:** No GitHub, ative **Settings → General → Template repository** (se for o repositório base) ou clique em **Use this template → Create a new repository**, clone localmente e rode os passos de [Início rápido](#início-rápido).
2. **Recrie a proteção de branch (`Protect main`) no GitHub:** O GitHub não copia rulesets para repositórios gerados a partir de templates. Configure proteção na `main` exigindo Pull Request, bloqueando force-push e deleção da branch, e exigindo os status checks **`backend`**, **`web`** e **`fence`** (além de revisão de code owners, se desejado).
3. **Atualize ownership e metadados:** Troque `@enzopita` em [`.github/CODEOWNERS`](.github/CODEOWNERS) pelo seu usuário/time e ajuste [`LICENSE`](LICENSE), [`Directory.Build.props`](Directory.Build.props) e [`web/package.json`](web/package.json) conforme o projeto.
4. **Opcionalmente renomeie o prefixo `App`:** Você pode manter o prefixo neutro `App` ou renomear `App.slnx`, projetos/namespaces `App.*` e `@app/web` antes de criar os primeiros módulos.
5. **Substitua o módulo de exemplo `Catalog`:** O `App.ArchitectureTests` exige pelo menos um módulo `<Module>` e `<Module>.Contracts`, portanto crie primeiro o seu primeiro módulo de domínio, registre o escopo em [`web/commitlint.config.mjs`](web/commitlint.config.mjs), atualize [`docs/glossary.md`](docs/glossary.md) e [`docs/agents/reference-slices.md`](docs/agents/reference-slices.md) e siga [Removing the example module](docs/agents/reference-slices.md#removing-the-example-module).
6. **Valide todo o pipeline:**

   ```bash
   node scripts/verify.mjs --mode pre-push
   ```

## Índice da documentação

- **Regras para agentes:** [AGENTS.md](AGENTS.md) · [src/AGENTS.md](src/AGENTS.md) · [web/AGENTS.md](web/AGENTS.md)
- **Architecture Decision Records (ADRs):**
  - [0001 — Record architecture decisions](docs/adr/0001-record-architecture-decisions.md)
  - [0002 — Modular monolith with vertical slices](docs/adr/0002-modular-monolith-with-vertical-slices.md)
  - [0003 — Dependency rules and their enforcement](docs/adr/0003-dependency-rules.md)
  - [0004 — HTTP API conventions](docs/adr/0004-http-api-conventions.md)
  - [0005 — Frontend stack and structure](docs/adr/0005-frontend-stack.md)
  - [0006 — Internationalization](docs/adr/0006-internationalization.md)
  - [0007 — TypeScript API client generation](docs/adr/0007-api-client-generation.md)
  - [0008 — Agent task workflow: planner, executors, fence](docs/adr/0008-agent-task-workflow.md)
  - [0009 — CI](docs/adr/0009-ci.md)
- **Guias e domínio:** [Tasks guide](docs/tasks/README.md) · [Reference slices](docs/agents/reference-slices.md) · [Glossary](docs/glossary.md) · [Red Team report (2026-11-23)](docs/agents/red-team-2026-11-23.md)
