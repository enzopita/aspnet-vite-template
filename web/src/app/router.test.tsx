import { describe, expect, it } from "vitest";

import {
  createProductHandler,
  createProductHandlerResponse201,
} from "@/lib/api/gen/msw/createProductHandler";
import { listProductsHandler, listProductsHandlerResponse200 } from "@/lib/api/gen/msw/listProductsHandler";
import type { ProductListItem } from "@/lib/api/gen/types/ProductListItem";
import { worker } from "@/test/msw";
import { renderApp } from "@/test/render-app";

describe("app catalog route", () => {
  it("loads catalog products via route loader and refreshes list after creating a product", async () => {
    const items: ProductListItem[] = [
      {
        id: "01900000-0000-7000-8000-000000000010",
        sku: "KEY-001",
        name: "Teclado Compacto",
        price: 299.9,
        stockQuantity: 8,
        version: 1,
        createdAtUtc: "2026-11-22T19:00:00Z",
        updatedAtUtc: "2026-11-22T19:00:00Z",
      },
    ];

    worker.use(
      listProductsHandler(() =>
        listProductsHandlerResponse200({
          items,
          page: 1,
          pageSize: 20,
          totalCount: items.length,
          totalPages: 1,
        }),
      ),
      createProductHandler(async ({ request }) => {
        const body = await request.json();
        const created: ProductListItem = {
          id: "01900000-0000-7000-8000-000000000011",
          sku: body.sku.toUpperCase(),
          name: body.name,
          price: body.price,
          stockQuantity: body.initialStock,
          version: 1,
          createdAtUtc: "2026-11-22T20:00:00Z",
          updatedAtUtc: "2026-11-22T20:00:00Z",
        };
        items.unshift(created);
        return createProductHandlerResponse201(created);
      }),
    );

    const { screen } = await renderApp("/catalog");

    await expect.element(screen.getByText("KEY-001")).toBeVisible();
    await expect.element(screen.getByText("Teclado Compacto")).toBeVisible();

    await screen.getByRole("button", { name: "Novo produto" }).click();
    await screen.getByLabelText("SKU").fill("mon-002");
    await screen.getByLabelText("Nome").fill("Monitor 27");
    await screen.getByLabelText("Preço").fill("1499");
    await screen.getByLabelText("Estoque inicial").fill("4");
    await screen.getByRole("button", { name: "Salvar" }).click();

    await expect.element(screen.getByText("MON-002")).toBeVisible();
    await expect.element(screen.getByText("Monitor 27")).toBeVisible();
  });
});
