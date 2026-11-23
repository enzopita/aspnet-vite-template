import { createFileRoute } from "@tanstack/react-router";

import { CatalogPage, catalogSearchSchema, loadCatalogPage } from "@/features/catalog";

export const Route = createFileRoute("/catalog")({
  validateSearch: catalogSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) => loadCatalogPage(queryClient, deps),
  component: CatalogRoute,
});

function CatalogRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <CatalogPage
      search={search}
      onSearchChange={(next) => {
        void navigate({
          search: (prev) => ({ ...prev, ...next }),
          replace: true,
        });
      }}
    />
  );
}
