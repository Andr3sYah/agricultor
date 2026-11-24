import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasManualPriceReferenceConsent,
  selectAgriculturalPriceReference,
} from "./price-reference";

const now = new Date("2026-11-24T12:00:00Z");
const request = {
  productName: "Papa criolla",
  category: "TUBERS",
  unit: "KG",
  market: "Bogotá",
  enabled: true,
};
const reference = {
  ...request,
  priceCOP: 4200,
  source: "SIPSA",
  publishedAt: new Date("2026-11-23T12:00:00Z"),
};

describe("agricultural reference price selection", () => {
  it("returns an exact, recent product/unit/market reference with source and date", () => {
    assert.deepEqual(
      selectAgriculturalPriceReference(request, [reference], now),
      { status: "available", reference },
    );
  });

  it("normalizes accents and case while preserving exact product, unit, and market matching", () => {
    assert.equal(
      selectAgriculturalPriceReference(
        {
          ...request,
          productName: "PÁPA CRIOLLA",
          category: "tubers",
          unit: "kg",
          market: "BOGOTA",
        },
        [reference],
        now,
      ).status,
      "available",
    );
    assert.equal(
      selectAgriculturalPriceReference(
        { ...request, market: "Medellín" },
        [reference],
        now,
      ).status,
      "not-covered",
    );
  });

  it("rejects stale and future-dated references", () => {
    const stale = {
      ...reference,
      publishedAt: new Date("2026-11-20T12:00:00Z"),
    };
    const future = {
      ...reference,
      publishedAt: new Date("2026-11-25T12:00:00Z"),
    };
    assert.equal(
      selectAgriculturalPriceReference(request, [stale], now).status,
      "stale",
    );
    assert.equal(
      selectAgriculturalPriceReference(request, [future], now).status,
      "stale",
    );
  });

  it("does not guess when market, unit, variety or coverage does not match", () => {
    assert.equal(
      selectAgriculturalPriceReference(
        { ...request, market: null },
        [reference],
        now,
      ).status,
      "not-covered",
    );
    assert.equal(
      selectAgriculturalPriceReference(
        { ...request, unit: "BULTO" },
        [reference],
        now,
      ).status,
      "not-covered",
    );
    assert.equal(
      selectAgriculturalPriceReference(
        { ...request, productName: "Papa pastusa" },
        [reference],
        now,
      ).status,
      "not-covered",
    );
    assert.equal(
      selectAgriculturalPriceReference(request, [], now).status,
      "not-covered",
    );
  });

  it("does not select a reference until the seller opts in", () => {
    assert.deepEqual(
      selectAgriculturalPriceReference(
        { ...request, enabled: false },
        [reference],
        now,
      ),
      { status: "disabled" },
    );
  });

  it("requires explicit consent to enable manual review but always permits opting out", () => {
    assert.equal(hasManualPriceReferenceConsent(true, "accepted"), true);
    assert.equal(hasManualPriceReferenceConsent(true, null), false);
    assert.equal(hasManualPriceReferenceConsent(false, null), true);
  });

  it("rejects duplicate matching observations as ambiguous", () => {
    assert.equal(
      selectAgriculturalPriceReference(
        request,
        [reference, { ...reference, priceCOP: 4300 }],
        now,
      ).status,
      "ambiguous",
    );
  });
});
