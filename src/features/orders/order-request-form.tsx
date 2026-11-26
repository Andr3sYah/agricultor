"use client";

import { useActionState, useState } from "react";
import {
  calculateUnitPriceTotal,
  formatAgriculturalValue,
} from "@/features/unit-converter/agricultural-units";
import {
  requestOrderAction,
  type OrderFormState,
} from "./order-actions";
import { parseOrderQuantity } from "./order-validation";

const initialState: OrderFormState = {};

export function OrderRequestForm({
  productId,
  availableQuantity,
  availableQuantityLabel,
  idempotencyKey,
  initialQuantity,
  priceCOP,
  suggestAvailableQuantity,
  unit,
}: {
  productId: string;
  availableQuantity: string;
  availableQuantityLabel: string;
  idempotencyKey: string;
  initialQuantity: string;
  priceCOP: number;
  suggestAvailableQuantity: boolean;
  unit: string;
}) {
  const [state, action, pending] = useActionState(
    requestOrderAction,
    initialState,
  );
  const [editedQuantity, setEditedQuantity] = useState<string | null>(null);
  const quantity = editedQuantity ?? state.submittedQuantity ?? initialQuantity;
  const normalizedQuantity = parseOrderQuantity(quantity);
  const estimatedPrice =
    normalizedQuantity && Number(normalizedQuantity) <= Number(availableQuantity)
      ? calculateUnitPriceTotal(normalizedQuantity, String(priceCOP)).value
      : null;

  return (
    <form action={action} className="mt-6 space-y-4">
      <input name="productId" type="hidden" value={productId} />
      <input name="expectedUnit" type="hidden" value={unit} />
      <input name="expectedPriceCOP" type="hidden" value={priceCOP} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div>
        <label className="block font-medium" htmlFor="order-quantity">
          Cantidad que solicitas
        </label>
        <input
          aria-describedby={
            state.fieldErrors?.quantity
              ? "order-quantity-availability order-quantity-error"
              : "order-quantity-availability"
          }
          aria-invalid={Boolean(state.fieldErrors?.quantity)}
          autoComplete="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3"
          id="order-quantity"
          inputMode="decimal"
          maxLength={13}
          name="quantity"
          onChange={(event) => setEditedQuantity(event.target.value)}
          placeholder="Ejemplo: 2,5"
          required
          type="text"
          value={quantity}
        />
        {state.fieldErrors?.quantity && (
          <p className="mt-1 text-sm text-red-800" id="order-quantity-error" role="alert">
            {state.fieldErrors.quantity}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-600" id="order-quantity-availability">
          Disponible ahora: {availableQuantityLabel}
        </p>
        {suggestAvailableQuantity && (
          <button
            className="mt-2 min-h-11 rounded-lg border border-emerald-900 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
            disabled={pending}
            onClick={() => setEditedQuantity(availableQuantity.replace(".", ","))}
            type="button"
          >
            Usar cantidad disponible
          </button>
        )}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {estimatedPrice !== null && (
          <p className="rounded-xl bg-emerald-50 p-3 text-emerald-950">
            Valor estimado <strong>$ {formatAgriculturalValue(estimatedPrice)} COP</strong>{" "}
            al peso más cercano.
          </p>
        )}
      </div>
      {state.message && (
        <p
          className="text-red-800"
          role="alert"
        >
          {state.message}
        </p>
      )}
      <button
        className="min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
        disabled={pending || Number(availableQuantity) <= 0}
        type="submit"
      >
        {pending
          ? "Enviando…"
          : Number(availableQuantity) <= 0
            ? "Sin disponibilidad libre"
            : "Solicitar producto"}
      </button>
    </form>
  );
}
