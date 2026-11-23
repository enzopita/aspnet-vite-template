---
name: look-it-up
description: Verify any unfamiliar API, package version, option or flag through the matching MCP or web docs before using it, and cite the source URL.
---

# Look it up before claiming it

Never invent or guess a package version, API signature, analyzer diagnostic rule, MSBuild property, config key, or CLI
flag from memory. Memory alone is a hypothesis; verified documentation is a fact.

## When to run

Run this skill **before** using any API, config option, flag, or package version that does not already appear in the
repository or in the task spec's `## Verified facts` section:

- **Planner (`plan-task`):** runs this routinely while writing a spec and records every version, signature, and URL
  under `## Verified facts`.
- **Executor (`execute-task`):** uses it as a **fallback** whenever a required API or flag is missing from `## Verified facts`
  and existing reference files (after consulting compiler/LSP diagnostics such as `CS0618` or `typescript/no-deprecated`).

## Which source to use

| Need | Tool / MCP | Scope & notes |
|---|---|---|
| C# language features, .NET BCL, ASP.NET Core, EF Core, MSBuild, `CA`/`IDE` analyzer rules | **Microsoft Learn MCP** (`microsoft-learn`: `microsoft_docs_search`, `microsoft_docs_fetch`, `microsoft_code_sample_search`) | All roles |
| Third-party JS/TS libraries (React, TanStack, Kubb, Lingui, Zod, Tailwind, Oxlint, Vitest) and third-party .NET libraries (Testcontainers, NetArchTest, Shouldly, Scalar, Asp.Versioning) | **Context7 MCP** (`context7`) | All roles |
| NuGet package versions and vulnerability advisories | **NuGet MCP** (`nuget`) | **Planner / orchestrator only** — blocked by guards in executor/reviewer worktrees because it can apply upgrades |
| Anything not covered by the MCPs above (e.g., GitHub/harness specs, Docker tools) | Native harness web search | All roles |

## Recording requirement

- **Planner:** write verified versions, signatures, and direct source URLs into the spec's `## Verified facts` section
  and commit them with the spec.
- **Executor:** cite every fallback lookup URL under `## Executor log` → `### Sources`. Any new API or flag added without
  a verified URL is treated as a review finding.
