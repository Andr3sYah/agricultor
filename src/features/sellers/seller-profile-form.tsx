"use client";

import { useActionState } from "react";
import type { SellerProfile } from "@/generated/prisma/client";
import { saveSellerProfile } from "./seller-profile-action";

const fieldClass = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2";

export function SellerProfileForm({ profile }: { profile: SellerProfile | null }) {
  const [state, action, pending] = useActionState(saveSellerProfile, { message: "" });
  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block font-medium">Nombre comercial
        <input className={fieldClass} defaultValue={profile?.name} maxLength={80} minLength={2} name="name" required />
      </label>
      <label className="block font-medium">Municipio
        <input className={fieldClass} defaultValue={profile?.municipality} maxLength={100} minLength={2} name="municipality" required />
      </label>
      <label className="block font-medium">Descripción
        <textarea className={fieldClass} defaultValue={profile?.description} maxLength={600} name="description" placeholder="Cuenta qué productos distribuyes o qué zonas atiendes." required rows={4} />
      </label>
      <label className="flex min-h-11 items-center gap-3 font-medium">
        <input className="size-5" defaultChecked={profile?.published} name="published" type="checkbox" />
        Mostrar mi perfil en el catálogo
      </label>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 font-semibold">Datos de contacto públicos</legend>
        <p className="text-sm text-slate-700">Todos están privados hasta que marques su casilla. Puedes retirarlos cuando quieras.</p>
        <label className="block font-medium">WhatsApp
          <input className={fieldClass} defaultValue={profile?.whatsapp?.slice(2)} maxLength={24} name="whatsapp" placeholder="Celular de 10 dígitos" type="tel" />
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input className="size-5" defaultChecked={profile?.whatsappPublic} name="whatsappPublic" type="checkbox" />
          Publicar WhatsApp
        </label>
        <label className="block font-medium">Teléfono
          <input className={fieldClass} defaultValue={profile?.phone?.slice(2)} maxLength={24} name="phone" placeholder="Teléfono de 10 dígitos" type="tel" />
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input className="size-5" defaultChecked={profile?.phonePublic} name="phonePublic" type="checkbox" />
          Publicar teléfono
        </label>
        <label className="block font-medium">Correo de coordinación
          <input className={fieldClass} defaultValue={profile?.email ?? ""} maxLength={254} name="email" type="email" />
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input className="size-5" defaultChecked={profile?.emailPublic} name="emailPublic" type="checkbox" />
          Publicar correo
        </label>
      </fieldset>
      <button className="min-h-11 rounded-lg bg-emerald-800 px-4 font-semibold text-white" disabled={pending} type="submit">
        Guardar perfil
      </button>
      {state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}
    </form>
  );
}
