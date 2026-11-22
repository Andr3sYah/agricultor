"use client";

import { useActionState } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import { enableSelling } from "./role-actions";

export function SellForm() {
  const [state, action, pending] = useActionState(enableSelling, { message: "" });

  return (
    <form action={action} aria-busy={pending} className="mt-4 space-y-2">
      <button
        className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-slate-500 sm:w-auto"
        disabled={pending}
        type="submit"
      >
        {pending ? <LoadingIndicator label="Abriendo ventas…" /> : "Vender productos"}
      </button>
      {state.message && <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950" role="alert">{state.message}</p>}
    </form>
  );
}
