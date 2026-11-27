import type { SellerPublicContactProfile } from "./seller-contact";
import { getSellerPublicContact } from "./seller-contact";

export function SellerPublicContact({ profile }: { profile: SellerPublicContactProfile }) {
  const contact = getSellerPublicContact(profile);
  if (!contact) return null;

  return (
    <section aria-label="Contacto y ubicación del vendedor" className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
      <p className="font-semibold">Contacto del vendedor</p>
      <p className="mt-1 text-sm text-foreground/75">
        {contact.exactLocation
          ? <>Ubicación exacta: {contact.exactLocation}, {contact.municipality}</>
          : <>Ubicación aproximada: {contact.neighborhood}, {contact.municipality}</>}
      </p>
      <a className="mt-2 block min-h-11 break-all font-semibold text-primary underline underline-offset-2" href={`tel:+${contact.phone}`}>
        Celular: +57 {contact.phone.slice(2)}
      </a>
      <a className="block min-h-11 break-all font-semibold text-primary underline underline-offset-2" href={`mailto:${contact.email}`}>
        Correo: {contact.email}
      </a>
    </section>
  );
}
