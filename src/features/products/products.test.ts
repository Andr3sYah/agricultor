import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEditProduct, canManageProducts } from "./product-access";
import {
  getAvailabilityLabel,
  validateProductInput,
} from "./product-validation";

const validInput = {
  name: "Producto",
  category: "FRUITS",
  availableQuantity: "12,5",
  unit: "KG",
  pricingType: "FIXED",
  priceCOP: "2500",
  municipality: "Pueblo",
};

describe("product management policies and validation", () => {
  it("accepts valid product fields and normalizes decimal quantities", () => {
    const result = validateProductInput(validInput);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.availableQuantity, "12.5");
      assert.equal(result.data.priceCOP, 2500);
    }
  });

  it("rejects malformed, negative, and over-precision quantities", () => {
    for (const availableQuantity of ["-1", "1.1234", "1e3", ""]) {
      const result = validateProductInput({ ...validInput, availableQuantity });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.errors.availableQuantity);
      }
    }
  });

  it("accepts the maximum supported quantity and rejects more integer digits", () => {
    const maximumQuantity = validateProductInput({
      ...validInput,
      availableQuantity: "999999999.999",
    });
    assert.equal(maximumQuantity.ok, true);

    const unsupportedQuantity = validateProductInput({
      ...validInput,
      availableQuantity: "1000000000",
    });
    assert.equal(unsupportedQuantity.ok, false);
    if (!unsupportedQuantity.ok) {
      assert.ok(unsupportedQuantity.errors.availableQuantity);
    }
  });

  it("rejects invalid categories, units, prices, and localities", () => {
    const result = validateProductInput({
      ...validInput,
      category: "UNKNOWN",
      unit: "UNKNOWN",
      priceCOP: "0",
      municipality: "x",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.category);
      assert.ok(result.errors.unit);
      assert.ok(result.errors.priceCOP);
      assert.ok(result.errors.municipality);
    }
  });

  it("accepts the maximum supported price and rejects the next integer", () => {
    const maximumPrice = validateProductInput({
      ...validInput,
      priceCOP: "2147483647",
    });
    assert.equal(maximumPrice.ok, true);

    const unsupportedPrice = validateProductInput({
      ...validInput,
      priceCOP: "2147483648",
    });
    assert.equal(unsupportedPrice.ok, false);
    if (!unsupportedPrice.ok) {
      assert.ok(unsupportedPrice.errors.priceCOP);
    }
  });

  it("accepts whole Colombian pesos with grouping and rejects ambiguous cents", () => {
    const grouped = validateProductInput({ ...validInput, priceCOP: "$ 2.500" });
    assert.ok(grouped.ok);
    assert.equal(grouped.data.priceCOP, 2500);

    for (const priceCOP of ["2.50", "2.500,50", "2.50.0", "$0"]) {
      const result = validateProductInput({ ...validInput, priceCOP });
      assert.ok(!result.ok);
      assert.ok(result.errors.priceCOP);
    }
  });

  it("accepts an explicit price-to-be-agreed offer without a numeric price", () => {
    const result = validateProductInput({
      ...validInput,
      pricingType: "NEGOTIABLE",
      priceCOP: "",
    });

    assert.deepEqual(result, {
      ok: true,
      data: {
        name: "Producto",
        category: "FRUITS",
        availableQuantity: "12.5",
        unit: "KG",
        pricingType: "NEGOTIABLE",
        priceCOP: null,
        municipality: "Pueblo",
      },
    });
  });

  it("requires an explicit pricing type and a valid price for fixed-price offers", () => {
    const missingPricingType = validateProductInput({
      ...validInput,
      pricingType: undefined,
    });
    assert.equal(missingPricingType.ok, false);
    if (!missingPricingType.ok) {
      assert.ok(missingPricingType.errors.pricingType);
    }

    const missingFixedPrice = validateProductInput({
      ...validInput,
      priceCOP: "",
    });
    assert.equal(missingFixedPrice.ok, false);
    if (!missingFixedPrice.ok) {
      assert.ok(missingFixedPrice.errors.priceCOP);
    }
  });

  it("allows only the producer owner to edit and change publication", () => {
    assert.equal(canManageProducts(["PRODUCER"]), true);
    assert.equal(canManageProducts(["BUYER"]), false);
    assert.equal(
      canEditProduct({ userId: "producer-1", roles: ["PRODUCER"] }, "producer-2"),
      false,
    );
    assert.equal(
      canEditProduct({ userId: "producer-1", roles: ["PRODUCER"] }, "producer-1"),
      true,
    );
    assert.equal(
      canEditProduct({ userId: "producer-1", roles: ["BUYER"] }, "producer-1"),
      false,
    );
  });

  it("derives availability from quantity so zero is always sold out", () => {
    assert.equal(getAvailabilityLabel("0.000"), "Agotado");
    assert.equal(getAvailabilityLabel("0.125"), "Disponible");
  });
});
