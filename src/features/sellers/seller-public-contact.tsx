import type { SellerPublicContactProfile } from "./seller-contact";
import { getSellerPublicContact } from "./seller-contact";

export function SellerPublicContact({
  profile,
  negotiating = false,
}: {
  profile: SellerPublicContactProfile;
  negotiating?: boolean;
}) {
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
      {negotiating && (
        <p className="mt-2 text-sm text-foreground/75">
          La negociación y compra continúan directamente con el vendedor, fuera de
          Agricultor. No se crea una solicitud ni se procesa un pago aquí.
        </p>
      )}
      {contact.whatsapp && (
        <a
          aria-label="Contactar al vendedor por WhatsApp"
          className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white underline-offset-2 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href={`https://wa.me/${contact.whatsapp}`}
          rel="noreferrer"
          target="_blank"
        >
          Escribir por WhatsApp
        </a>
      )}
      <a aria-label="Llamar al vendedor" className="mt-2 block min-h-11 break-all font-semibold text-primary underline underline-offset-2" href={`tel:+${contact.phone}`}>
        Celular: +57 {contact.phone.slice(2)}
      </a>
      <a aria-label="Enviar correo al vendedor" className="block min-h-11 break-all font-semibold text-primary underline underline-offset-2" href={`mailto:${contact.email}`}>
        Correo: {contact.email}
      </a>
    </section>
  );
}
