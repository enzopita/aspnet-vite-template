# 0003. Dependency rules and their enforcement

- Status: Accepted
- Date: 2026-11-22

## Decision

| From | May depend on | Must not depend on |
|---|---|---|
| `SharedKernel` | BCL | any App project |
| `<Module>.Domain` | `SharedKernel` | EF Core, ASP.NET Core, other modules |
| `<Module>.Features.<Slice>` | own Domain + Persistence, other modules' `Contracts` | other slices, other modules' internals |
| `<Module>.Persistence` | own Domain, EF Core | Features |
| `<Module>.Contracts` | `SharedKernel` | implementations |
| `App.Api` | all projects, for composition | business logic |

Cross-module communication is synchronous through query interfaces in `Contracts`, or asynchronous through
integration events.

Enforcement:

1. Project references: a module project references only `App.SharedKernel`, `App.BuildingBlocks` (shared technical
   plumbing) and other modules' `Contracts`.
2. `internal` by default; `InternalsVisibleTo` only for test projects.
3. `tests/App.ArchitectureTests` (ArchUnitNET) checks Domain purity, slice isolation, Contracts purity and
   SharedKernel purity.

## Consequences

Violations fail the build or CI. When a rule blocks legitimate work, the fix is an ADR.
