"use client";

import { useState, type FormEvent } from "react";
import {
  calculateUnitPriceTotal,
  convertAgriculturalUnits,
  convertBagsToWeight,
  formatAgriculturalValue,
  getUnitLabel,
  UNIT_CATEGORIES,
  type UnitCategoryKey,
  type UnitConversion,
} from "@/features/unit-converter/agricultural-units";

export function AgriculturalUnitConverter() {
  const [category, setCategory] = useState<UnitCategoryKey>("mass");
  const [fromUnit, setFromUnit] = useState("lb500");
  const [toUnit, setToUnit] = useState("kg");
  const [amount, setAmount] = useState("");
  const [bagWeight, setBagWeight] = useState("");
  const [bagWeightError, setBagWeightError] = useState<string | null>(null);
  const [convertedValue, setConvertedValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [priceUnitKey, setPriceUnitKey] = useState<string | null>(null);
  const [priceResult, setPriceResult] = useState<UnitConversion | null>(null);
  const selectedCategory = UNIT_CATEGORIES.find(
    (item) => item.key === category,
  )!;
  const convertingBags = fromUnit === "bulto";
  const pricingUnit = priceUnitKey ?? toUnit;
  const priceUnit =
    selectedCategory.key === "mass"
      ? selectedCategory.units.find(({ key }) => key === pricingUnit)?.priceUnit
      : undefined;

  function resetResult() {
    setConvertedValue(null);
    setError(null);
    setBagWeightError(null);
    setPriceResult(null);
  }

  function handleCategoryChange(value: string) {
    const nextCategory = UNIT_CATEGORIES.find((item) => item.key === value);
    if (!nextCategory) {
      return;
    }

    setCategory(nextCategory.key);
    setFromUnit(nextCategory.units[0].key);
    setToUnit(nextCategory.units[1].key);
    setPrice("");
    setPriceUnitKey(null);
    resetResult();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const conversion = convertingBags
      ? convertBagsToWeight(amount, bagWeight, toUnit)
      : convertAgriculturalUnits(amount, category, fromUnit, toUnit);
    const invalidBagWeight = "field" in conversion && conversion.field === "bagWeight";
    setError(invalidBagWeight ? null : conversion.error);
    setBagWeightError(invalidBagWeight ? conversion.error : null);
    setConvertedValue(conversion.value);
    if (category !== "mass" || conversion.value === null || !price.trim()) {
      setPriceResult(null);
      return;
    }
    const pricedQuantity = pricingUnit === toUnit
      ? conversion.value
      : convertAgriculturalUnits(conversion.value, "mass", toUnit, pricingUnit).value;
    setPriceResult(pricedQuantity === null ? null : calculateUnitPriceTotal(pricedQuantity, price));
  }

  const amountErrorId = "unit-converter-amount-error";

  return (
    <form className="mt-6 space-y-6" noValidate onSubmit={handleSubmit}>
      <div>
        <label
          className="block font-medium text-slate-900"
          htmlFor="unit-converter-category"
        >
          Tipo de medida
        </label>
        <select
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
          id="unit-converter-category"
          onChange={(event) => handleCategoryChange(event.target.value)}
          value={category}
        >
          {UNIT_CATEGORIES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            className="block font-medium text-slate-900"
            htmlFor="unit-converter-amount"
          >
            {convertingBags ? "Cantidad de bultos" : "Cantidad"}
          </label>
          <input
            aria-describedby={`unit-converter-hint${error ? ` ${amountErrorId}` : ""}`}
            aria-invalid={Boolean(error)}
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
            id="unit-converter-amount"
            inputMode="decimal"
            maxLength={60}
            onChange={(event) => {
              setAmount(event.target.value);
              resetResult();
            }}
            type="text"
            value={amount}
          />
          <p className="mt-1 text-sm text-slate-600" id="unit-converter-hint">
            Se aceptan decimales con punto o coma. El cero es válido.
          </p>
          {error && (
            <p
              className="mt-1 text-sm font-medium text-rose-800"
              id={amountErrorId}
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        <div>
          <label
            className="block font-medium text-slate-900"
            htmlFor="unit-converter-from"
          >
            Convertir desde
          </label>
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
            id="unit-converter-from"
            onChange={(event) => {
              setFromUnit(event.target.value);
              if (event.target.value === "bulto") {
                setToUnit("kg");
                setPrice("");
                setPriceUnitKey(null);
              }
              resetResult();
            }}
            value={fromUnit}
          >
            {selectedCategory.units.map((unit) => (
              <option key={unit.key} value={unit.key}>
                {unit.label}
              </option>
            ))}
            {category === "mass" && <option value="bulto">Bultos</option>}
          </select>
        </div>

        <div>
          <label
            className="block font-medium text-slate-900"
            htmlFor="unit-converter-to"
          >
            Convertir a
          </label>
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
            id="unit-converter-to"
            onChange={(event) => {
              setToUnit(event.target.value);
              if (priceUnitKey === null) setPrice("");
              resetResult();
            }}
            value={toUnit}
          >
            {selectedCategory.units.map((unit) => (
              <option key={unit.key} value={unit.key}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {convertingBags && (
        <div>
          <label className="block font-medium" htmlFor="unit-converter-bag-weight">
            Peso de cada bulto en kilos
          </label>
          <p className="mt-1 text-sm text-slate-600" id="bag-weight-hint">
            Escribe cuánto pesa un bulto. Por ejemplo, 25,5.
          </p>
          <input
            aria-describedby={`bag-weight-hint${bagWeightError ? " bag-weight-error" : ""}`}
            aria-invalid={Boolean(bagWeightError)}
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
            id="unit-converter-bag-weight"
            inputMode="decimal"
            maxLength={60}
            onChange={(event) => {
              setBagWeight(event.target.value);
              resetResult();
            }}
            type="text"
            value={bagWeight}
          />
          {bagWeightError && (
            <p className="mt-1 text-sm text-rose-800" id="bag-weight-error" role="alert">
              {bagWeightError}
            </p>
          )}
        </div>
      )}

      {selectedCategory.key === "mass" && priceUnit && (
        <div className="space-y-3">
          <div>
            <label className="block font-medium" htmlFor="unit-converter-price-unit">
              Unidad del precio
            </label>
            <select
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
              id="unit-converter-price-unit"
              onChange={(event) => {
                setPriceUnitKey(event.target.value);
                setPrice("");
                resetResult();
              }}
              value={pricingUnit}
            >
              {selectedCategory.units.map((unit) => (
                <option key={unit.key} value={unit.key}>{unit.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium" htmlFor="unit-converter-price">
              Precio por {priceUnit} en pesos (opcional)
            </label>
            <p className="mt-1 text-sm text-slate-600" id="unit-converter-price-hint">
              Escribe el precio que acordaste. Por ejemplo, 2.000.
            </p>
            <input
              aria-describedby={`unit-converter-price-hint${priceResult?.error ? " unit-converter-price-error" : ""}`}
              aria-invalid={Boolean(priceResult?.error)}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 focus-visible:outline-2 focus-visible:outline-emerald-800"
              id="unit-converter-price"
              inputMode="numeric"
              maxLength={18}
              onChange={(event) => {
                setPrice(event.target.value);
                resetResult();
              }}
              type="text"
              value={price}
            />
            {priceResult?.error && (
              <p className="mt-1 text-sm text-rose-800" id="unit-converter-price-error" role="alert">
                {priceResult.error}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        {!convertingBags && (
          <button
            className="min-h-11 w-full rounded-xl border border-emerald-800 px-4 font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-800 sm:w-auto"
            onClick={() => {
              setFromUnit(toUnit);
              setToUnit(fromUnit);
              setPrice("");
              setPriceUnitKey(null);
              resetResult();
            }}
            type="button"
          >
            Intercambiar unidades
          </button>
        )}

        <button
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 sm:w-auto"
          type="submit"
        >
          Convertir unidades
        </button>
      </div>

      {convertedValue !== null && (
        <section
          aria-live="polite"
          aria-labelledby="unit-converter-result-title"
          className="rounded-2xl bg-emerald-50 p-5"
        >
          <h2
            className="text-xl font-semibold text-emerald-950"
            id="unit-converter-result-title"
          >
            Resultado
          </h2>
          <p className="mt-3 break-words text-lg text-emerald-950">
            <strong>{formatAgriculturalValue(amount.trim().replace(",", "."))}</strong>{" "}
            {convertingBags ? "bultos" : getUnitLabel(category, fromUnit)} ={" "}
            <strong>{formatAgriculturalValue(convertedValue)}</strong>{" "}
            {getUnitLabel(category, toUnit)}
          </p>
          <p className="mt-2 text-sm text-emerald-950">
            Conversión exacta; no se redondeó el resultado.
          </p>
          {priceResult?.value != null && (
            <p className="mt-3 text-emerald-950 wrap-anywhere">
              Valor estimado: <strong>$ {formatAgriculturalValue(priceResult.value)} COP</strong>
              {" "}al peso más cercano.
            </p>
          )}
        </section>
      )}
    </form>
  );
}
