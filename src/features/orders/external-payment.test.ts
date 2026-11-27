import assert from "node:assert/strict";
import test from "node:test";
import { canUseWompiForProduct, parsePaymentReference } from "./external-payment";

test("parsePaymentReference accepts a bounded external transaction reference", () => {
  assert.equal(parsePaymentReference("  TRX-2026_11:23.1  "), "TRX-2026_11:23.1");
});

test("parsePaymentReference rejects markup, empty values, and overlong references", () => {
  assert.equal(parsePaymentReference(null), null);
  assert.equal(parsePaymentReference("   "), null);
  assert.equal(parsePaymentReference("<script>"), null);
  assert.equal(parsePaymentReference("x".repeat(121)), null);
});

test("Wompi requires a fixed-price product with a positive persisted price", () => {
  assert.equal(canUseWompiForProduct({ pricingType: "FIXED", priceCOP: 1000 }), true);
  assert.equal(canUseWompiForProduct({ pricingType: "NEGOTIABLE", priceCOP: null }), false);
  assert.equal(canUseWompiForProduct({ pricingType: "NEGOTIABLE", priceCOP: 1000 }), false);
  assert.equal(canUseWompiForProduct({ pricingType: "FIXED", priceCOP: null }), false);
  assert.equal(canUseWompiForProduct({ pricingType: "FIXED", priceCOP: 0 }), false);
  assert.equal(canUseWompiForProduct(null), false);
});
