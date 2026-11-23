import { describe, expect, it } from "vitest";

import {
  createProductHandler,
  createProductHandlerResponse201,
} from "@/lib/api/gen/msw/createProductHandler";
import { worker } from "@/test/msw";
import { problemResponse, renderWithProviders } from "@/test/render";

import { CreateProductDialog } from "./create-product-dialog";

describe("CreateProductDialog", () => {
  it("shows client-side Zod validation errors when submitted empty", async () => {
    const screen = await renderWithProviders(<CreateProductDialog />);

    await screen.getByRole("button", { name: "Novo produto" }).click();
    await screen.getByRole("button", { name: "Salvar" }).click();

    await expect.element(screen.getByText("Informe o SKU do produto.")).toBeVisible();
    await expect.element(screen.getByText("Informe o nome do produto.")).toBeVisible();
  });

  it("submits valid payload and closes the dialog", async () => {
    let submitted: unknown = null;
    worker.use(
      createProductHandler(async ({ request }) => {
        submitted = await request.json();
        return createProductHandlerResponse201({
          id: "01900000-0000-7000-8000-000000000001",
          sku: "SKU-100",
          name: "Mouse sem fio",
          price: 129.9,
          stockQuantity: 15,
          createdAtUtc: "2026-11-22T20:00:00Z",
        });
      }),
    );

    const screen = await renderWithProviders(<CreateProductDialog />);

    await screen.getByRole("button", { name: "Novo produto" }).click();
    await screen.getByLabelText("SKU").fill("SKU-100");
    await screen.getByLabelText("Nome").fill("Mouse sem fio");
    await screen.getByLabelText("Preço").fill("129.9");
    await screen.getByLabelText("Estoque inicial").fill("15");
    await screen.getByRole("button", { name: "Salvar" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(submitted).toEqual({
      sku: "SKU-100",
      name: "Mouse sem fio",
      price: 129.9,
      initialStock: 15,
    });
  });

  it("renders mapped localized error when API returns 409 sku-taken", async () => {
    worker.use(createProductHandler(() => problemResponse(409, "catalog.product.sku-taken")));

    const screen = await renderWithProviders(<CreateProductDialog />);

    await screen.getByRole("button", { name: "Novo produto" }).click();
    await screen.getByLabelText("SKU").fill("SKU-DUP");
    await screen.getByLabelText("Nome").fill("Produto duplicado");
    await screen.getByRole("button", { name: "Salvar" }).click();

    await expect.element(screen.getByText("Já existe um produto cadastrado com este SKU.")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
  });
});
