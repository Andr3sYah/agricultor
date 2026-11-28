"use client";

import { useActionState } from "react";
import { saveOrderSellerContact } from "./order-seller-contact-action";

export function OrderSellerContactForm({ orderId, phoneShared }: { orderId: string; phoneShared: boolean }) {
  const [state, action, pending] = useActionState(saveOrderSellerContact.bind(null, orderId), { message: "" });
  return (
    <form action={action} aria-label="Teléfono de contacto del pedido" className="mt-4 space-y-2 rounded-xl border border-slate-200 p-3">
      <p className="block font-medium">Teléfono de contacto</p>
      <p className="text-sm text-slate-700">
        Al compartirlo, solo el comprador de este pedido podrá usar el número de tu perfil para contactarte.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="min-h-11 rounded-lg bg-emerald-800 px-3 font-semibold text-white" disabled={pending} name="operation" type="submit" value="share">
          Compartir teléfono
        </button>
        {phoneShared && (
          <button className="min-h-11 rounded-lg border border-slate-300 px-3 font-semibold" disabled={pending} name="operation" type="submit" value="remove">
            Dejar de compartir
          </button>
        )}
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}
    </form>
  );
}
