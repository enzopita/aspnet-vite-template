import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listProductsQueryOptions } from "@/lib/api/gen/queries/useListProducts";
import type { ProductListItem } from "@/lib/api/gen/types/ProductListItem";
import { problemMessage } from "@/lib/api/problem";

import { type CatalogSearch, catalogProblemMessages } from "../api/catalog";
import { CreateProductDialog } from "./create-product-dialog";
import { ProductsTable } from "./products-table";

const searchPlaceholderMsg = msg`Buscar por SKU ou nome...`;
const searchAriaLabelMsg = msg`Buscar produtos`;
const emptyItems: ProductListItem[] = [];

interface CatalogPageProps {
  search: CatalogSearch;
  onSearchChange: (patch: Partial<CatalogSearch>) => void;
}

export function CatalogPage({ search, onSearchChange }: CatalogPageProps) {
  const { i18n } = useLingui();
  const trimmedSearch = search.search.trim();

  const query = useQuery({
    ...listProductsQueryOptions({
      query: {
        page: search.page,
        "page-size": search.pageSize,
        ...(trimmedSearch.length > 0 ? { search: trimmedSearch } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? emptyItems;
  const totalPages = Number(query.data?.totalPages ?? 0);
  const totalCount = Number(query.data?.totalCount ?? 0);
  const displayTotalPages = Math.max(totalPages, 1);

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Trans>Catálogo de produtos</Trans>
          </h1>
          <p className="text-sm text-muted-foreground">
            <Trans>Gerencie SKUs, preços e níveis de estoque.</Trans>
          </p>
        </div>
        <CreateProductDialog />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          type="search"
          aria-label={i18n._(searchAriaLabelMsg)}
          placeholder={i18n._(searchPlaceholderMsg)}
          value={search.search}
          onChange={(e) => onSearchChange({ search: e.target.value, page: 1 })}
          className="max-w-xs"
        />
        <span className="text-sm text-muted-foreground tabular-nums">
          <Trans>{totalCount} produto(s)</Trans>
        </span>
      </div>

      {query.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {i18n._(problemMessage(query.error, catalogProblemMessages))}
        </div>
      ) : (
        <ProductsTable items={items} />
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          <Trans>
            Página {search.page} de {displayTotalPages}
          </Trans>
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={search.page <= 1}
            onClick={() => onSearchChange({ page: search.page - 1 })}
          >
            <Trans>Anterior</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={search.page >= totalPages}
            onClick={() => onSearchChange({ page: search.page + 1 })}
          >
            <Trans>Próxima</Trans>
          </Button>
        </div>
      </div>
    </section>
  );
}
