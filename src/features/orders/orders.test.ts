import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDecideOrder,
  canRequestOrder,
  transitionOrder,
} from "./order-policy";
import {
  parseOrderDecision,
  validateOrderRequest,
} from "./order-validation";
import {
  getOrderPagination,
  ORDER_LIST_PAGE_SIZE,
  parseOrderPage,
} from "./order-pagination";

describe("order request validation", () => {
  it("normalizes valid decimal quantities", () => {
    const result = validateOrderRequest({
      productId: "product-1",
      quantity: "1,250",
      idempotencyKey: "A".repeat(43),
    });

    assert.deepEqual(result, {
      ok: true,
      data: {
        productId: "product-1",
        quantity: "1.250",
        idempotencyKey: "A".repeat(43),
      },
    });
  });

  it("rejects malformed, zero, negative, and over-precision quantities", () => {
    for (const quantity of ["0", "0.000", "-1", "1.1234", "1e2", ""]) {
      const result = validateOrderRequest({
        productId: "product-1",
        quantity,
        idempotencyKey: "A".repeat(43),
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(result.errors.quantity);
      }
    }
  });

  it("rejects invalid product identifiers and decisions", () => {
    assert.equal(
      validateOrderRequest({
        productId: " ",
        quantity: "1",
        idempotencyKey: "A".repeat(43),
      }).ok,
      false,
    );
    const invalidKey = validateOrderRequest({
      productId: "product-1",
      quantity: "1",
      idempotencyKey: "not-an-opaque-key",
    });
    assert.equal(invalidKey.ok, false);
    if (!invalidKey.ok) {
      assert.ok(invalidKey.errors.idempotencyKey);
    }
    assert.equal(parseOrderDecision("PENDING"), null);
    assert.equal(parseOrderDecision("ACCEPTED"), "ACCEPTED");
  });
});

describe("order permissions and transitions", () => {
  it("allows buyers to request another producer's product only", () => {
    assert.equal(
      canRequestOrder({ userId: "buyer-1", roles: ["BUYER"] }, "producer-1"),
      true,
    );
    assert.equal(
      canRequestOrder(
        { userId: "producer-1", roles: ["BUYER"] },
        "producer-1",
      ),
      false,
    );
    assert.equal(
      canRequestOrder({ userId: "trader-1", roles: ["TRADER"] }, "producer-1"),
      false,
    );
  });

  describe("order list pagination", () => {
    it("uses a bounded page size and clamps requests past the last page", () => {
      assert.deepEqual(getOrderPagination(ORDER_LIST_PAGE_SIZE * 2 + 1, 2), {
        page: 2,
        pageCount: 3,
        skip: ORDER_LIST_PAGE_SIZE,
        take: ORDER_LIST_PAGE_SIZE,
      });
      assert.deepEqual(getOrderPagination(0, 99), {
        page: 1,
        pageCount: 1,
        skip: 0,
        take: ORDER_LIST_PAGE_SIZE,
      });
      assert.equal(getOrderPagination(13, 99).page, 2);
    });

    it("rejects malformed, repeated, zero, and unsafe page values", () => {
      for (const value of [undefined, "", "0", "-1", "1.5", ["2"], "9999999999"]) {
        assert.equal(parseOrderPage(value), 1);
      }
      assert.equal(parseOrderPage("3"), 3);
    });
  });

  it("allows only the owning producer to decide a pending order once", () => {
    assert.equal(
      canDecideOrder(
        { userId: "producer-1", roles: ["PRODUCER"] },
        "producer-1",
      ),
      true,
    );
    assert.equal(
      canDecideOrder(
        { userId: "producer-2", roles: ["PRODUCER"] },
        "producer-1",
      ),
      false,
    );
    assert.equal(
      canDecideOrder({ userId: "buyer-1", roles: ["PRODUCER"] }, "producer-1"),
      false,
    );
    assert.equal(transitionOrder("PENDING", "ACCEPTED"), "ACCEPTED");
    assert.equal(transitionOrder("PENDING", "REJECTED"), "REJECTED");
    assert.equal(transitionOrder("ACCEPTED", "REJECTED"), null);
    assert.equal(transitionOrder("REJECTED", "ACCEPTED"), null);
  });
});
