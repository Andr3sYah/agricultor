"use client";

import { useState, type FormEvent } from "react";
import {
  calculateAgriculturalCosts,
  COST_CATEGORIES,
  type CalculatorField,
  type CalculatorResult,
  type CalculatorValues,
} from "@/features/calculator/agricultural-costs";

const initialValues: CalculatorValues = {
  productionQuantity: "",
  salePricePerUnit: "",
  seeds: "",
  supplies: "",
  labor: "",
  transport: "",
  other: "",
};

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 1,
});

function ResultSummary({ result }: { result: CalculatorResult }) {
  const items: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Costo total", value: copFormatter.format(result.totalCost) },
    { label: "Costo por unidad", value: copFormatter.format(result.unitCost) },
  ];
  if (result.expectedRevenue !== null && result.profit !== null) {
    items.push(
      { label: "Ingreso esperado", value: copFormatter.format(result.expectedRevenue) },
      {
        label: "Ganancia o pérdida",
        value: copFormatter.format(result.profit),
        emphasis: true,
      },
    );
  }

  return (
    <section
      aria-live="polite"
      aria-labelledby="results-title"
      className="rounded-2xl bg-emerald-50 p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold text-emerald-950" id="results-title">
        Resultado estimado
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map(({ label, value, emphasis }) => (
          <div
            className={`rounded-xl p-4 ${emphasis ? "bg-emerald-900 text-white" : "bg-white text-slate-900"}`}
            key={label}
          >
            <dt className="text-sm font-medium">{label}</dt>
            <dd className="mt-1 text-xl font-semibold wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-emerald-950">
        <p className="text-sm font-medium">Precio por unidad para cubrir tus costos</p>
        <p className="mt-1 text-xl font-semibold wrap-anywhere">
          {copFormatter.format(result.wholePesoUnitCost)}
        </p>
        <p className="mt-2 text-sm">
          Redondeado hacia arriba a pesos enteros. Supone que vendes toda la
          cantidad que anotaste.
        </p>
      </div>
      {result.expectedRevenue === null ? (
        <p className="mt-4 text-sm text-emerald-950">
          Ingresa un precio de venta si quieres estimar tu ganancia.
        </p>
      ) : (
        <p className="mt-4 text-sm text-emerald-950">
          Margen sobre ingresos:{" "}
          <strong>
            {result.marginPercent === null
              ? "No calculable porque el ingreso esperado es $0."
              : `${percentFormatter.format(result.marginPercent)}%`}
          </strong>
        </p>
      )}
    </section>
  );
}

export function AgriculturalCostCalculator() {
  const [values, setValues] = useState(initialValues);
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<CalculatorField, string>>
  >({});
  const [submitted, setSubmitted] = useState(false);

  function updateValue(field: CalculatorField, value: string) {
    const updatedValues = { ...values, [field]: value };
    setValues(updatedValues);

    if (submitted) {
      const calculation = calculateAgriculturalCosts(updatedValues);
      setErrors(calculation.errors);
      setResult(calculation.result);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const calculation = calculateAgriculturalCosts(values);
    setErrors(calculation.errors);
    setResult(calculation.result);
  }

  function amountField(
    field: CalculatorField,
    label: string,
    hint: string,
  ) {
    const error = submitted ? errors[field] : undefined;
    const inputId = `calculator-${field}`;
    const errorId = `${inputId}-error`;

    return (
      <div>
        <label className="block font-medium text-slate-900 sm:min-h-12" htmlFor={inputId}>
          {label}
        </label>
        <div className="mt-2 flex min-h-12 overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-emerald-800">
          <span
            aria-hidden="true"
            className="flex items-center border-r border-slate-200 px-3 text-slate-600"
          >
            {field === "productionQuantity" ? "unid." : "$"}
          </span>
          <input
            aria-describedby={`${inputId}-hint${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 px-3 py-2 text-slate-950 outline-none"
            id={inputId}
            inputMode="decimal"
            onChange={(event) => updateValue(field, event.target.value)}
            type="text"
            maxLength={24}
            value={values[field]}
          />
        </div>
        <p className="mt-1 text-sm text-slate-600" id={`${inputId}-hint`}>
          {hint}
        </p>
        {error && (
          <p className="mt-1 text-sm font-medium text-rose-800" id={errorId}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="mt-6 space-y-8" noValidate onSubmit={handleSubmit}>
      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">Producción y venta</legend>
        <p className="text-sm text-slate-700">
          Escribe cuánto produces. Puedes calcular tus costos aunque todavía
          no hayas decidido el precio de venta.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {amountField(
            "productionQuantity",
            "Cantidad de producción",
            "Usa la misma medida en toda la cuenta. Por ejemplo, 2,5 kilos.",
          )}
          {amountField(
            "salePricePerUnit",
            "Precio de venta por unidad en pesos (opcional)",
            "Por ejemplo, 2.000 si vendes cada kilo a dos mil pesos.",
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold">Costos de producción</legend>
        <p className="text-sm text-slate-700">
          Escribe los costos en pesos. Si un costo no aplica, déjalo vacío.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {COST_CATEGORIES.map(({ key, label }) => (
            <div key={key}>
              {amountField(key, label, "Costo total estimado en COP.")}
            </div>
          ))}
        </div>
      </fieldset>

      <button
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 sm:w-auto"
        type="submit"
      >
        Calcular costos y margen
      </button>

      {result && <ResultSummary result={result} />}
      {submitted && Object.keys(errors).length > 0 && (
        <p className="text-sm font-medium text-rose-800" role="status">
          Revisa los campos marcados para obtener el resultado.
        </p>
      )}
    </form>
  );
}
