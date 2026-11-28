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
          ? <>Ubicación exacta: {contact.exactLocation}, {contact.municipality}{contact.department ? `, ${contact.department}` : ""}</>
          : <>Ubicación aproximada: {contact.neighborhood ? `${contact.neighborhood}, ` : ""}{contact.municipality}{contact.department ? `, ${contact.department}` : ""}</>}
      </p>
      {negotiating && (
        <p className="mt-2 text-sm text-foreground/75">
          Contacta al vendedor para acordar el precio. La negociación y el pago se hacen fuera de Agricultor.
        </p>
      )}
      {contact.whatsappUrl && (
        <a
          aria-label="Contactar al vendedor por WhatsApp"
          className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white underline-offset-2 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href={contact.whatsappUrl}
          rel="noreferrer"
          target="_blank"
        >
          Escribir por WhatsApp
        </a>
      )}
      <a aria-label="Llamar al vendedor" className="mt-2 block min-h-11 break-all font-semibold text-primary underline underline-offset-2" href={`tel:+${contact.phone}`}>
        Teléfono de contacto: +57 {contact.phone.slice(2)}
      </a>
      <a aria-label="Enviar correo al vendedor" className="block min-h-11 break-all font-semibold text-primary underline underline-offset-2" href={`mailto:${contact.email}`}>
        Correo: {contact.email}
      </a>
    </section>
  );
}
