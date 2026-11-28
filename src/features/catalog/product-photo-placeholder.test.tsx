import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { ProductPhotoPlaceholder } from "./product-photo-placeholder";

describe("product photo placeholder", () => {
  it("uses a compact, labeled placeholder in offer cards", () => {
    const markup = renderToStaticMarkup(
      createElement(ProductPhotoPlaceholder, {
        productName: "Tomate",
        category: "Hortalizas",
      }),
    );

    assert.match(markup, /aria-label="Sin foto de Tomate\. Categoría: Hortalizas\."/);
    assert.match(markup, />Sin foto</);
    assert.doesNotMatch(markup, /<img\b/);
  });

  it("keeps long product names accessible without using them as image content", () => {
    const productName = "Tomate de árbol seleccionado para venta al por mayor ".repeat(2);
    const markup = renderToStaticMarkup(
      createElement(ProductPhotoPlaceholder, {
        productName,
        category: "Frutas",
        size: "detail",
      }),
    );

    assert.ok(markup.includes(`Sin foto de ${productName}. Categoría: Frutas.`));
    assert.match(markup, />Sin foto · Frutas</);
    assert.doesNotMatch(markup, /<img\b/);
  });
});
