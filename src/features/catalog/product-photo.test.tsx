import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { ProductPhoto } from "./product-photo";

describe("product photo presentation", () => {
  it("contains uploaded photos in a small, uncropped offer-card frame", () => {
    const markup = renderToStaticMarkup(
      createElement(ProductPhoto, {
        productName: "Tomate",
        category: "Hortalizas",
        photoUrl:
          "https://res.cloudinary.com/test-cloud/image/upload/v123/products/abc123/main.jpg",
      }),
    );

    assert.match(markup, /alt="Foto de Tomate"/);
    assert.match(markup, /object-contain/);
    assert.match(markup, /c_limit,w_256,h_256,q_auto,f_auto/);
    assert.doesNotMatch(markup, /object-cover/);
  });

  it("uses a bounded aspect ratio for detail photos", () => {
    const markup = renderToStaticMarkup(
      createElement(ProductPhoto, {
        productName: "Tomate",
        category: "Hortalizas",
        photoUrl:
          "https://res.cloudinary.com/test-cloud/image/upload/v123/products/abc123/main.jpg",
        size: "detail",
      }),
    );

    assert.match(markup, /aspect-\[16\/9\]/);
    assert.match(markup, /max-h-56/);
    assert.match(markup, /object-contain/);
  });

  it("never renders non-Cloudinary URLs as photos", () => {
    const markup = renderToStaticMarkup(
      createElement(ProductPhoto, {
        productName: "Tomate",
        category: "Hortalizas",
        photoUrl: "https://untrusted.example/photo.jpg",
      }),
    );

    assert.match(markup, /Sin foto de Tomate/);
    assert.doesNotMatch(markup, /untrusted\.example/);
  });
});
