"use client";

import { useActionState } from "react";
import {
  toggleFavoriteAction,
  type FavoriteFormState,
} from "./favorite-actions";

export function FavoriteControl({
  productId,
  isFavorite,
}: {
  productId: string;
  isFavorite: boolean;
}) {
  const [state, action, pending] = useActionState<FavoriteFormState, FormData>(
    toggleFavoriteAction,
    { isFavorite },
  );
  const saved = state.isFavorite ?? isFavorite;

  return (
    <form action={action} className="mt-4">
      <input name="productId" type="hidden" value={productId} />
      <input name="isFavorite" type="hidden" value={String(saved)} />
      {state.message ? (
        <p
          className={state.ok ? "mb-2 text-sm text-emerald-900" : "mb-2 text-sm text-red-800"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      ) : null}
      <button
        aria-pressed={saved}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-primary/40 px-4 py-2 font-semibold text-primary transition-colors hover:bg-surface-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Guardando…"
          : saved
            ? "Quitar de favoritos"
            : "Guardar en favoritos"}
      </button>
    </form>
  );
}
