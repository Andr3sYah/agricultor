import { randomBytes } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCatalogPageHref,
  getPublicProductOrderHref,
  parseCatalogFilters,
} from "@/features/catalog/public-products";
import { OrderRequestForm } from "@/features/orders/order-request-form";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from "@/features/products/product-validation";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { getPublicSellerOfferCondition } from "@/features/sellers/seller-contact";
import { SellerPublicContact } from "@/features/sellers/seller-public-contact";

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

export const dynamic = "force-dynamic";

export default async function RequestOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { productId } = await params;
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isPublished: true,
      ...getPublicSellerOfferCondition(),
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      category: true,
      availableQuantity: true,
      unit: true,
      priceCOP: true,
      pricingType: true,
      municipality: true,
      owner: {
        select: {
          sellerProfile: {
            select: {
              municipality: true,
              neighborhood: true,
              exactLocation: true,
              exactLocationPublic: true,
              exactLocationConsentAt: true,
              whatsapp: true,
              whatsappLink: true,
              whatsappPublic: true,
              phone: true,
              phonePublic: true,
              email: true,
              emailPublic: true,
              publicContactConsentAt: true,
            },
          },
        },
      },
    },
  });

  if (!product) {
    notFound();
  }

  const identity = await getCurrentIdentity();
  const isBuyer = identity?.roles.includes("BUYER") ?? false;
  const isOwner = identity?.userId === product.ownerId;
  const category =
    PRODUCT_CATEGORIES.find(({ value }) => value === product.category)?.label ??
    product.category;
  const unit =
    PRODUCT_UNITS.find(({ value }) => value === product.unit)?.label ??
    product.unit;
  const availableQuantityLabel = `${quantityFormatter.format(
    product.availableQuantity.toNumber(),
  )} ${unit}`;
  const hasAvailableStock = product.availableQuantity.gt(0);
  const sellerProfile = product.owner.sellerProfile;
  const filters = parseCatalogFilters(await searchParams);
  const searchedQuantity = filters.unit === product.unit ? filters.minimumQuantity : undefined;
  const initialQuantity =
    searchedQuantity && product.availableQuantity.gte(searchedQuantity)
      ? searchedQuantity.replace(".", ",")
      : "";
  const accountQuery = `?redirectTo=${encodeURIComponent(
    getPublicProductOrderHref(product.id, filters),
  )}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
        href={getCatalogPageHref(filters, filters.page)}
      >
        Volver al catálogo
      </Link>
      <section className="mt-4 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:mt-6 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          {product.pricingType === "NEGOTIABLE"
            ? "Precio a convenir"
            : "Solicitud de compra"}
        </p>
        <h1 className="mt-4 text-3xl font-semibold wrap-anywhere">
          {product.name}
        </h1>
        <dl className="mt-6 grid gap-4 text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="font-medium">Categoría</dt>
            <dd>{category}</dd>
          </div>
          <div>
            <dt className="font-medium">Disponible</dt>
            <dd>{availableQuantityLabel}</dd>
          </div>
          <div>
            <dt className="font-medium">Precio por unidad</dt>
            <dd>
              {product.pricingType === "FIXED" && product.priceCOP !== null
                ? copFormatter.format(product.priceCOP)
                : "Precio a convenir"}
            </dd>
            {product.pricingType === "FIXED" && (
              <p className="mt-1 text-sm text-slate-600">
                Precio publicado por el productor. El pedido es una solicitud; el productor debe aceptarlo y confirmar el precio.
              </p>
            )}
          </div>
          <div>
            <dt className="font-medium">Municipio</dt>
            <dd className="wrap-anywhere">{product.municipality}</dd>
          </div>
        </dl>
        {sellerProfile && (
          <SellerPublicContact
            negotiating={product.pricingType === "NEGOTIABLE"}
            profile={sellerProfile}
          />
        )}
        {product.pricingType === "NEGOTIABLE" ? (
          <p className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
            Acuerda el precio directamente con el vendedor. Aquí no se crea una solicitud ni se procesa un pago.
          </p>
        ) : product.priceCOP === null || product.priceCOP < 1 ? (
          <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            El precio de esta oferta no está disponible para solicitudes. Contacta
            al vendedor para confirmar los datos publicados.
          </p>
        ) : !hasAvailableStock ? (
          <p
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
            role="status"
          >
            No hay disponibilidad para nuevas solicitudes en este momento.
            Vuelve a consultar más tarde.
          </p>
        ) : isBuyer && !isOwner ? (
          <>
            {searchedQuantity && (
              <p className="mt-6 text-sm text-slate-700">
                {initialQuantity
                  ? "Cargamos la cantidad que buscaste. Puedes cambiarla antes de solicitar."
                  : "La cantidad que buscaste supera lo disponible. Escribe cuánto necesitas dentro de lo que queda."}
              </p>
            )}
            <OrderRequestForm
              availableQuantity={product.availableQuantity.toString()}
              availableQuantityLabel={availableQuantityLabel}
              idempotencyKey={randomBytes(32).toString("base64url")}
              initialQuantity={initialQuantity}
              priceCOP={product.priceCOP}
              productId={product.id}
              suggestAvailableQuantity={Boolean(searchedQuantity && !initialQuantity)}
              unit={product.unit}
            />
          </>
        ) : !identity ? (
          <div className="mt-6 space-y-3">
            <p className="text-slate-700">
              Crea una cuenta de comprador para solicitar este producto, ver las respuestas del vendedor y consultar tus pedidos después.
            </p>
            <Link
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 sm:w-auto"
              href={`/crear-cuenta${accountQuery}`}
            >
              Crear cuenta de comprador
            </Link>
            <Link
              className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4"
              href={`/iniciar-sesion${accountQuery}`}
            >
              Inicia sesión
            </Link>
          </div>
        ) : isOwner ? (
          <p className="mt-6 text-slate-700">
            No puedes solicitar tu propio producto.
          </p>
        ) : (
          <p className="mt-6 text-slate-700">
            Agrega el perfil de comprador a tu cuenta para solicitar este
            producto.
          </p>
        )}
      </section>
    </main>
  );
}
