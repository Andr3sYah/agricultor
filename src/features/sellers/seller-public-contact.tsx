import type { SellerPublicContactProfile } from "./seller-contact";
import { getSellerPublicContact } from "./seller-contact";

export function SellerPublicContact({ profile }: { profile: SellerPublicContactProfile }) {
  const contact = getSellerPublicContact(profile);
  if (!contact) return null;

  return (
    <section aria-label="Contacto y ubicación aproximada" className="rounded-xl border border-slate-200 p-3">
      <p className="font-semibold">Contacto del vendedor</p>
      <p className="mt-1 text-sm text-slate-700">
        Ubicación aproximada: {contact.neighborhood}, {contact.municipality}
      </p>
      <a className="mt-2 block min-h-11 break-all font-semibold text-emerald-900 underline" href={`tel:+${contact.phone}`}>
        Celular: +57 {contact.phone.slice(2)}
      </a>
      <a className="block min-h-11 break-all font-semibold text-emerald-900 underline" href={`mailto:${contact.email}`}>
        Correo: {contact.email}
      </a>
    </section>
  );
}
