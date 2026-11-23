import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

const skuRequiredMsg = msg`Informe o SKU do produto.`;
const skuTooLongMsg = msg`O SKU deve ter no máximo 64 caracteres.`;
const nameRequiredMsg = msg`Informe o nome do produto.`;
const nameTooLongMsg = msg`O nome deve ter no máximo 200 caracteres.`;
const priceInvalidMsg = msg`O preço deve ser zero ou maior.`;
const stockInvalidMsg = msg`O estoque inicial deve ser um número inteiro não negativo.`;

export function createProductFormSchema() {
  return z.object({
    sku: z.string().trim().min(1, i18n._(skuRequiredMsg)).max(64, i18n._(skuTooLongMsg)),
    name: z.string().trim().min(1, i18n._(nameRequiredMsg)).max(200, i18n._(nameTooLongMsg)),
    price: z.number({ error: i18n._(priceInvalidMsg) }).min(0, i18n._(priceInvalidMsg)),
    initialStock: z
      .number({ error: i18n._(stockInvalidMsg) })
      .int(i18n._(stockInvalidMsg))
      .min(0, i18n._(stockInvalidMsg)),
  });
}

export type CreateProductFormValues = z.infer<ReturnType<typeof createProductFormSchema>>;
