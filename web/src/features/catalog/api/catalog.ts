import { msg } from "@lingui/core/macro";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { listProductsQueryOptions } from "@/lib/api/gen/queries/useListProducts";
import type { ProblemMessages } from "@/lib/api/problem";

export const catalogSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20).default(20),
  search: z.string().catch("").default(""),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export function loadCatalogPage(queryClient: QueryClient, params: CatalogSearch) {
  const trimmed = params.search.trim();
  return queryClient.query({
    ...listProductsQueryOptions({
      query: {
        page: params.page,
        "page-size": params.pageSize,
        ...(trimmed.length > 0 ? { search: trimmed } : {}),
      },
    }),
    staleTime: "static",
  });
}

export const catalogProblemMessages: ProblemMessages = {
  "catalog.product.sku-taken": msg`Já existe um produto cadastrado com este SKU.`,
  "catalog.product.sku-required": msg`Informe o SKU do produto.`,
  "catalog.product.name-required": msg`Informe o nome do produto.`,
  "catalog.product.invalid-price": msg`O preço não pode ser negativo.`,
  "catalog.product.invalid-stock": msg`O estoque inicial não pode ser negativo.`,
  "catalog.product.insufficient-stock": msg`Estoque insuficiente para realizar este ajuste.`,
  "catalog.product.concurrency-conflict": msg`O produto foi atualizado por outra operação. Recarregue e tente novamente.`,
  "catalog.product.not-found": msg`Produto não encontrado.`,
};
