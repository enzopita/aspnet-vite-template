# 0007. TypeScript API client generation

- Status: Accepted
- Date: 2026-11-22

## Decision

- The backend OpenAPI document is generated at build time (`Microsoft.Extensions.ApiDescription.Server`) into
  `web/openapi/app.json` and committed.
- **Kubb** (versions pinned exactly) generates into `web/src/lib/api/gen/` with `@kubb/adapter-oas` and
  `plugin-ts`, `plugin-zod`, `plugin-fetch`, `plugin-react-query` (`queryOptions`/`mutationOptions`, no hooks) and
  `plugin-msw` (test handlers).
- Requests are same-origin: no base URL, cookies flow automatically.
- Generated code is committed and reviewed; CI fails if regeneration produces a diff.
- Kubb's TS printer uses the TypeScript 6 API through `@typescript/typescript6` until TypeScript 7 ships its
  programmatic API.

## Consequences

The generator is a dev-time tool whose output is plain TypeScript, so switching generators stays cheap.
