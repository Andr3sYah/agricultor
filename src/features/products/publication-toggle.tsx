"use client";

import { useActionState } from "react";
import {
  setProductPublication,
  type ProductFormState,
} from "./product-actions";

const initialState: ProductFormState = {};

type PublicationToggleProps = {
  productId: string;
  isPublished: boolean;
};

export function PublicationToggle({
  productId,
  isPublished,
}: PublicationToggleProps) {
  const [state, action, pending] = useActionState(
    setProductPublication,
    initialState,
  );
  const nextPublicationState = !isPublished;

  return (
    <form action={action} className="mt-4">
      <input name="productId" type="hidden" value={productId} />
      <input
        name="isPublished"
        type="hidden"
        value={String(nextPublicationState)}
      />
      <button
        className="rounded-xl border border-emerald-900 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-50 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Actualizando..."
          : nextPublicationState
            ? "Publicar en catálogo"
            : "Retirar del catálogo"}
      </button>
      {state.message && (
        <p
          className={state.ok ? "mt-2 text-sm text-emerald-900" : "mt-2 text-sm text-red-800"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      {state.sellerProfileRequired && (
        <a
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
          href="/mi-cuenta/perfil-vendedor"
        >
          Completar perfil de vendedor
        </a>
      )}
    </form>
  );
}
