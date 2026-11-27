import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProductHref } from "@/features/catalog/public-products";
import {
  isSellerProfileAvailable,
} from "@/features/sellers/seller-profile";
import { PUBLIC_SELLER_CONTACT_CONDITION } from "@/features/sellers/seller-contact";
import { SellerPublicContact } from "@/features/sellers/seller-public-contact";
import { isOrderReceiptAvailable } from "@/features/orders/order-receipt";
import { prisma } from "@/lib/db";

export default async function PublicSellerProfile({ params }: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await params;
  if (!await isSellerProfileAvailable()) notFound();
  const profile = await prisma.sellerProfile.findFirst({
    where: {
      id: sellerId,
      published: true,
      ...PUBLIC_SELLER_CONTACT_CONDITION,
      owner: { userRoles: { some: { role: "PRODUCER" } } },
    },
    select: {
      name: true,
      description: true,
      municipality: true,
      neighborhood: true,
      ownerId: true,
      whatsapp: true,
      whatsappPublic: true,
      phone: true,
      phonePublic: true,
      email: true,
      emailPublic: true,
      publicContactConsentAt: true,
    },
  });
  if (!profile) notFound();
  const ratings = await isOrderReceiptAvailable() ? await prisma.orderReceipt.aggregate({
    where: { rating: { not: null }, order: { producerId: profile.ownerId, status: "ACCEPTED" } },
    _avg: { rating: true },
    _count: { rating: true },
  }) : null;
  const offers = await prisma.product.findMany({
    where: {
      ownerId: profile.ownerId,
      isPublished: true,
      owner: {
        is: {
          sellerProfile: {
            is: PUBLIC_SELLER_CONTACT_CONDITION,
          },
        },
      },
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8">
      <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href="/catalogo">Volver al catálogo</Link>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h1 className="text-3xl font-semibold wrap-anywhere">{profile.name}</h1>
        <p className="font-medium wrap-anywhere">{profile.municipality}</p>
        <p className="whitespace-pre-wrap wrap-anywhere">{profile.description}</p>
        <SellerPublicContact profile={profile} />
        {profile.whatsappPublic && profile.whatsapp && (
          <a className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href={`https://wa.me/${profile.whatsapp}`}>
            WhatsApp
          </a>
        )}
        {ratings && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
            {ratings._avg.rating === null ? "Todavía no hay calificaciones de pedidos recibidos." : (
              <><strong>{new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(ratings._avg.rating)} de 5</strong> · {ratings._count.rating} {ratings._count.rating === 1 ? "calificación" : "calificaciones"} de pedidos recibidos</>
            )}
          </p>
        )}
      </section>
      <section aria-labelledby="seller-offers">
        <h2 className="text-xl font-semibold" id="seller-offers">Ofertas disponibles</h2>
        {offers.length === 0 ? <p className="mt-2">Este vendedor no tiene ofertas disponibles.</p> : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl bg-white px-4">
            {offers.map((offer) => (
              <li key={offer.id}><Link className="flex min-h-11 items-center py-2 font-semibold text-emerald-900 underline wrap-anywhere" href={getPublicProductHref(offer.id)}>{offer.name}</Link></li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
