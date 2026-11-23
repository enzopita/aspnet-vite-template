# Backend rules

## Module layout (ADR 0002)

```
src/Modules/<Module>/
  App.<Module>.Contracts/   public: query interfaces, integration events, DTOs
  App.<Module>/
    Domain/                 aggregates and value objects, free of EF and ASP.NET
    Features/<Area>/<Slice>/ one folder per use case: request, response, handler, endpoint
    Persistence/            <Module>DbContext (own schema), configurations, migrations
    <Module>Module.cs       Add<Module>Module() + Map<Module>Endpoints()
```

- Types are `internal` by default. Only `Contracts` projects expose `public` types.
- A slice depends on its own module's Domain and Persistence and on other modules' `Contracts`. The full table is in
  ADR 0003, and `tests/App.ArchitectureTests` enforces it.
- Endpoints call their slice handler directly. Cross-cutting concerns are endpoint filters.

## API (ADR 0004)

- Routes are `/api/v{n}/<module>/...` in kebab-case, including query parameters. JSON is camelCase.
- Failures return `Result`/`Error` → Problem Details with a stable `code` (`<module>.<entity>.<reason>`), through
  `ToProblem()`.
- Every endpoint declares all its responses, a summary and an operation id. The OpenAPI document is the contract for
  the web client.
- Calendar dates are `DateOnly`; instants are `DateTimeOffset` in UTC.

## Quality

- Every recommendation the .NET language server shows (IDE00xx: primary constructors, collection expressions,
  unused usings, unnecessary `!`) is a build error. `dotnet format style App.slnx --severity warn` fixes most of
  them; review what it rewrites.
- Integration tests run against real PostgreSQL through Testcontainers.
- An invariant that spans rows gets a `<Area>ConcurrencyTests` class. `verify` reruns it 10 times.
- Migrations are append-only: add a new one.
