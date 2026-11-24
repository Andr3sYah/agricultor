"use client";

import { useActionState } from "react";
import type { ProductFormState } from "./product-actions";

const initialState: ProductFormState = {};

export function PriceReferenceOptIn({
  productId,
  enabled,
  action,
}: {
  productId: string;
  enabled: boolean;
  action: (
    previous: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <form action={formAction}>
        {!enabled && (
          <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
            <input
              className="mt-1"
              name="consent"
              required
              type="checkbox"
              value="accepted"
            />
            <span>
              Acepto revisar manualmente la información pública antes de cambiar
              mi oferta. Esta opción no cambia el precio ni autoriza actualizaciones
              automáticas.
            </span>
          </label>
        )}
        <input name="productId" type="hidden" value={productId} />
        <input name="enabled" type="hidden" value={String(!enabled)} />
        <button
          aria-pressed={enabled}
          className="min-h-11 rounded-xl border border-emerald-900 px-4 font-semibold text-emerald-950 hover:bg-emerald-50 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending
            ? "Guardando..."
            : enabled
              ? "Desactivar revisión de precios"
              : "Activar revisión de precios"}
        </button>
      </form>
      <p className="mt-2 text-sm text-slate-700">
        {state.message ??
          (enabled
            ? "Preferencia activa para revisión manual. No hay un feed conectado y el precio publicado solo cambia cuando tú lo actualizas."
            : "Opcional. La casilla confirma que revisarás la fuente; cualquier cambio requiere tu aprobación manual.")}
      </p>
      <p className="mt-2 text-sm text-slate-700">
        SIPSA publica observaciones mayoristas diarias por producto y mercado,
        con días sin publicación y una cotización por mercado. No ofrece aquí un
        rango de transacción ni un precio universal en tiempo real. No se
        conectan fuentes derivadas de SIPSA como si fueran independientes.
        <a
          className="ml-1 font-semibold text-emerald-900 underline"
          href="https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas"
          rel="noreferrer"
          target="_blank"
        >
          Consultar boletines de SIPSA
        </a>
      </p>
    </div>
  );
}
