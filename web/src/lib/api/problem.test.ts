import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it } from "vitest";

import { ResponseError } from "./gen/.kubb/client";
import { problemCode, problemMessage, problemStatus } from "./problem";

function makeResponseError(status: number, data: unknown): ResponseError {
  return new ResponseError({
    status,
    statusText: String(status),
    data,
    request: new Request("http://localhost/api/v1/catalog/products"),
    response: new Response(null, { status }),
  });
}

describe("problem helpers", () => {
  beforeAll(() => {
    i18n.load("pt-BR", {});
    i18n.activate("pt-BR");
  });

  it("extracts status and machine code from ResponseError", () => {
    const err = makeResponseError(409, { code: "catalog.product.sku-taken", title: "Raw server title" });
    expect(problemStatus(err)).toBe(409);
    expect(problemCode(err)).toBe("catalog.product.sku-taken");
  });

  it("maps known problem code before falling back to HTTP status", () => {
    const err = makeResponseError(409, { code: "catalog.product.sku-taken", title: "Raw server title" });
    const descriptor = problemMessage(err, {
      "catalog.product.sku-taken": { id: "SKU já cadastrado." },
    });
    expect(descriptor.id).toBe("SKU já cadastrado.");
  });

  it("falls back by HTTP status and network failure when code is absent", () => {
    expect(problemMessage(makeResponseError(404, {})).message).toContain("Não encontramos");
    expect(problemMessage(new TypeError("Failed to fetch")).message).toContain("conexão");
  });
});
