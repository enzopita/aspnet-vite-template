# Reference slices

The canonical file to copy for each kind of task. A task spec's "Reference implementation" points here. When no row
fits, the orchestrator builds the first one before planning the task.

| Kind of task | Backend reference | Frontend reference | Tests to copy |
|---|---|---|---|
| Command with a business rule | `src/Modules/Catalog/App.Catalog/Features/Products/CreateProduct/CreateProductHandler.cs`, `CreateProductEndpoint.cs`, `src/Modules/Catalog/App.Catalog/Domain/Product.cs` | `web/src/features/catalog/components/create-product-dialog.tsx` | `tests/App.Api.IntegrationTests/Catalog/CreateProductTests.cs`, `web/src/features/catalog/components/create-product-dialog.test.tsx` |
| Paginated query | `src/Modules/Catalog/App.Catalog/Features/Products/ListProducts/ListProductsHandler.cs`, `ListProductsEndpoint.cs` | `web/src/features/catalog/api/catalog.ts`, `web/src/features/catalog/components/products-table.tsx` | `tests/App.Api.IntegrationTests/Catalog/ListProductsTests.cs` |
| Command guarding an invariant under concurrency | `src/Modules/Catalog/App.Catalog/Features/Products/AdjustStock/AdjustStockHandler.cs`, `AdjustStockEndpoint.cs`, `src/Modules/Catalog/App.Catalog/Persistence/Configurations/ProductConfiguration.cs` | `web/src/features/catalog/api/catalog.ts` (`catalogProblemMessages`) | `tests/App.Api.IntegrationTests/Catalog/AdjustStockTests.cs`, `tests/App.Api.IntegrationTests/Catalog/CatalogConcurrencyTests.cs` |
| List page (route + loader + table) | — | `web/src/routes/catalog.tsx`, `web/src/features/catalog/api/catalog.ts`, `web/src/features/catalog/components/catalog-page.tsx`, `web/src/features/catalog/components/products-table.tsx` | `web/src/app/router.test.tsx` |
| Create/edit form in a dialog | — | `web/src/components/patterns/app-form.tsx`, `web/src/features/catalog/schemas/create-product.ts`, `web/src/features/catalog/components/create-product-dialog.tsx` | `web/src/features/catalog/components/create-product-dialog.test.tsx` |

## Removing the example module

The references above live in the example `Catalog` module. A new project replaces them with its own slices and then
removes `Catalog` (note: `App.ArchitectureTests` requires at least one `<Module>` and `<Module>.Contracts` assembly, so
add your first domain module before deleting `Catalog`):

1. **Backend module & tests:**
   - Delete `src/Modules/Catalog/` (`App.Catalog`, `App.Catalog.Contracts`, Domain, Features, Persistence, and migrations).
   - Delete `tests/App.Api.IntegrationTests/Catalog/`.
   - Remove the `/src/Modules/Catalog/` folder and both projects from `App.slnx`.
2. **API host composition:**
   - Remove the `App.Catalog` and `App.Catalog.Contracts` `<ProjectReference>` entries from `src/App.Api/App.Api.csproj`.
   - Remove `using App.Catalog;`, `builder.Services.AddCatalogModule(builder.Configuration);`, and `app.MapCatalogEndpoints();` from `src/App.Api/Program.cs`.
3. **Frontend feature, routes & tests:**
   - Delete `web/src/features/catalog/`.
   - Delete `web/src/routes/catalog.tsx`.
   - Update `web/src/routes/__root.tsx` (replace the `Catálogo` navigation link with your module routes).
   - Update `web/src/routes/index.tsx` (redirect to or render your app's home route instead of `/catalog`).
   - Update `web/src/app/router.test.tsx` to cover your new routes.
4. **Commitlint & generated artifacts:**
   - Remove `"catalog"` from `scopes` in `web/commitlint.config.mjs`.
   - Regenerate derived files and prune unused i18n messages:
     - `dotnet build src/App.Api` (regenerates `web/openapi/app.json`)
     - `pnpm --dir web api:generate` (regenerates `web/src/lib/api/gen/`)
     - `pnpm --dir web build` (regenerates `web/src/app/route-tree.gen.ts`)
     - `pnpm --dir web i18n:extract` (updates `web/src/locales/*/messages.po`)
