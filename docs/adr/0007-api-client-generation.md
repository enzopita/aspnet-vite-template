# 0007. TypeScript API client generation

- Status: Accepted
- Date: 2026-11-22

## Decision

- The backend OpenAPI document is emitted in **OpenAPI 3.1** (runtime `options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_1`
  in `App.Api` plus build-time `--openapi-version OpenApi3_1` in `<OpenApiGenerateDocumentsOptions>`, because
  `Microsoft.Extensions.ApiDescription.Server`'s `GetDocument.Insider` overrides `OpenApiOptions` with 3.2 by default)
  and written at build time into `web/openapi/app.json` (committed until Kubb declares OpenAPI 3.2 support).
- **Kubb** (versions pinned exactly) generates into `web/src/lib/api/gen/` with `@kubb/adapter-oas`
  (`validate: true`, complementing backend validation in `OpenApiDocumentTests`), `plugin-ts`, `plugin-zod`,
  `plugin-fetch`, `plugin-react-query` (`queryOptions`/`mutationOptions`, no hooks) and `plugin-msw` (test handlers).
- Requests are same-origin: no base URL, cookies flow automatically.
- Generated code is committed and reviewed; CI fails if regeneration produces a diff.
- Kubb's TS printer uses the TypeScript 6 API through `@typescript/typescript6` until TypeScript 7 ships its
  programmatic API.

## Consequences

The generator is a dev-time tool whose output is plain TypeScript, so switching generators stays cheap.
