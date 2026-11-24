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
            ? "Guardamos tu preferencia. Aún no hay un feed conectado; puedes comparar el boletín y actualizar el precio manualmente."
            : "Opcional. No cambia tu precio publicado; cualquier ajuste requiere que revises la fuente y confirmes el precio manualmente.")}
      </p>
      <p className="mt-2 text-sm text-slate-700">
        SIPSA publica boletines periódicos por mercado y presentación; no es un
        precio universal en tiempo real. La integración de datos, la selección
        explícita del mercado y la equivalencia de variedad y unidad aún faltan.
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
