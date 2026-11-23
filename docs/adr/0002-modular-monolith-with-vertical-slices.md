# 0002. Modular monolith with vertical slices

- Status: Accepted
- Date: 2026-11-22

## Context

The product ships as one deployable but spans several business areas that grow independently. Folder conventions
alone erode quickly, especially when most code is written by agents.

## Decision

- One deployable (`App.Api`) composed of **modules** under `src/Modules/<Module>/`.
- Each module is two projects: `App.<Module>` (everything `internal`) and `App.<Module>.Contracts` (the only `public`
  surface).
- Inside a module, code is organized in **vertical slices**: `Features/<Area>/<UseCase>/` holds the request,
  response, validation, handler and endpoint of one use case.
- No mediator library. An endpoint calls its handler directly; cross-cutting behavior uses endpoint filters.
- One `DbContext` and one PostgreSQL schema per module, in a single database.
- A module implements business rules with its own persistence plus other modules' `Contracts` and events. Reads
  that span modules (reports, dashboards) go through an explicit mechanism (read model, projection or a query
  module) chosen in its own ADR.

## Consequences

- Module boundaries are enforced by the compiler (project references + `internal`); slice rules by architecture
  tests (ADR 0003).
- Slight duplication between slices is accepted in exchange for independent change.
