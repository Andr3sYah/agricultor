"use client";

import { useActionState, useState } from "react";
import type { SellerProfile } from "@/generated/prisma/client";
import {
  COLOMBIA_DEPARTMENTS,
  inferColombianLocation,
  selectColombianDepartment,
} from "./colombian-location";
import { saveSellerProfile } from "./seller-profile-action";

const fieldClass = "mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2";

function ColombiaLocationFields({
  profile,
}: {
  profile: SellerProfile | null;
}) {
  const savedLocation = inferColombianLocation(
    profile?.municipality,
    profile?.department,
  );
  const [department, setDepartment] = useState(savedLocation?.department ?? "");
  const [municipality, setMunicipality] = useState(savedLocation?.municipality ?? "");
  const municipalities =
    COLOMBIA_DEPARTMENTS.find((option) => option.name === department)?.municipalities ?? [];

  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Ubicación</legend>
      <label className="block font-medium" htmlFor="department">
        Departamento
        <select
          className={fieldClass}
          id="department"
          name="department"
          onChange={(event) => {
            const selection = selectColombianDepartment(event.target.value);
            setDepartment(selection.department);
            setMunicipality(selection.municipality);
          }}
          required
          value={department}
        >
          <option value="">Elige un departamento</option>
          {COLOMBIA_DEPARTMENTS.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block font-medium" htmlFor="municipality">
        Municipio
        <select
          className={fieldClass}
          disabled={!department}
          id="municipality"
          name="municipality"
          onChange={(event) => setMunicipality(event.target.value)}
          required
          value={municipality}
        >
          <option value="">
            {department ? "Elige un municipio" : "Elige primero un departamento"}
          </option>
          {municipalities.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {profile?.municipality && !savedLocation && (
        <p className="text-sm text-slate-600">
          Conservamos tu ubicación anterior ({profile.municipality}). Elige su departamento y municipio para actualizarla.
        </p>
      )}
    </fieldset>
  );
}

export function SellerProfileForm({
  profile,
  displayName = null,
  returnTo = "",
}: {
  profile: SellerProfile | null;
  displayName?: string | null;
  returnTo?: string;
}) {
  const [state, action, pending] = useActionState(saveSellerProfile, { message: "" });

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      {returnTo && <input name="returnTo" type="hidden" value={returnTo} />}
      <p className="text-sm text-slate-700">
        {returnTo
          ? "Para continuar, completa teléfono, correo y ubicación y acepta compartir tus datos de contacto."
          : "Completa estos datos una sola vez. La ubicación se usará en tus ofertas."}
      </p>
      <label className="block font-medium" htmlFor="seller-name">
        Nombre del vendedor o negocio
        <input
          className={fieldClass}
          defaultValue={profile?.name ?? displayName ?? ""}
          id="seller-name"
          maxLength={80}
          minLength={2}
          name="name"
          required
        />
      </label>
      <ColombiaLocationFields profile={profile} />
      <label className="block font-medium" htmlFor="phone">
        Teléfono de contacto
        <input
          className={fieldClass}
          autoComplete="tel-national"
          defaultValue={profile?.phonePublic ? profile.phone?.slice(2) : ""}
          id="phone"
          inputMode="tel"
          maxLength={24}
          name="phone"
          placeholder="Celular colombiano de 10 dígitos"
          required
          type="tel"
        />
      </label>
      <label className="block font-medium" htmlFor="email">
        Correo de contacto
        <input
          className={fieldClass}
          defaultValue={profile?.emailPublic ? profile.email ?? "" : ""}
          id="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <label className="block font-medium" htmlFor="neighborhood">
        Barrio o vereda <span className="font-normal text-slate-600">(opcional)</span>
        <input
          className={fieldClass}
          defaultValue={profile?.neighborhood ?? ""}
          id="neighborhood"
          maxLength={100}
          name="neighborhood"
          placeholder="Por ejemplo, El Porvenir"
        />
        <span className="mt-1 block text-sm font-normal text-slate-600">
          No incluyas calles, números ni puntos de referencia.
        </span>
      </label>
      <label className="flex min-h-11 items-start gap-3">
        <input
          className="mt-1 size-5"
          defaultChecked={Boolean(profile?.publicContactConsentAt && profile.phonePublic && profile.emailPublic)}
          name="publishContacts"
          type="checkbox"
        />
        Acepto publicar mi teléfono y correo para recibir consultas de compradores.
      </label>
      <label className="flex min-h-11 items-center gap-3 font-medium">
        <input className="size-5" defaultChecked={profile?.published} name="published" type="checkbox" />
        Mostrar mi perfil en el catálogo
      </label>
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Más opciones del perfil
        </summary>
        <div className="mt-3 space-y-4">
          <label className="block font-medium" htmlFor="description">
            Descripción <span className="font-normal text-slate-600">(opcional)</span>
            <textarea
              className={fieldClass}
              defaultValue={profile?.description ?? ""}
              id="description"
              maxLength={600}
              name="description"
              placeholder="Cuenta qué productos distribuyes o qué zonas atiendes."
              rows={4}
            />
          </label>
          <label className="block font-medium" htmlFor="exactLocation">
            Ubicación exacta <span className="font-normal text-slate-600">(opcional)</span>
            <input
              className={fieldClass}
              autoComplete="off"
              defaultValue={profile?.exactLocation ?? ""}
              id="exactLocation"
              maxLength={240}
              name="exactLocation"
              placeholder="Déjala vacía si no quieres compartirla"
            />
          </label>
          <label className="flex min-h-11 items-start gap-3">
            <input
              className="mt-1 size-5"
              defaultChecked={profile?.exactLocationPublic ?? false}
              name="publishExactLocation"
              type="checkbox"
            />
            Acepto publicar mi ubicación exacta. Será visible para cualquier persona.
          </label>
        </div>
      </details>
      <p className="text-sm text-slate-600">
        Puedes retirar el permiso de publicar tus datos cuando quieras. Al hacerlo, se ocultarán tus ofertas.
      </p>
      <button
        className="min-h-11 rounded-lg bg-emerald-800 px-4 font-semibold text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Guardando..." : returnTo ? "Guardar y continuar" : "Guardar perfil"}
      </button>
      {state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}
    </form>
  );
}
