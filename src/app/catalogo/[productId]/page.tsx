import type { Metadata } from "next";
import Link from "next/link";
import { getProductPriceDates, ProductPriceDate } from "@/features/catalog/product-price-date";
import { ProductQuantityEstimate } from "@/features/catalog/product-quantity-estimate";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ShareProductButton } from "@/features/catalog/share-product-button";
import {
  getCatalogPageHref,
  getPublicProductHref,
  getPublicProductMetadata,
  getPublicProductOrderHref,
  getPublicProducts,
  parseCatalogFilters,
} from "@/features/catalog/public-products";
import { FavoriteControl } from "@/features/favorites/favorite-control";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from "@/features/products/product-validation";
import { prisma } from "@/lib/db";
import { getCurrentIdentity } from "@/lib/auth/server";
import { getSellerProfileHref, isSellerProfileAvailable } from "@/features/sellers/seller-profile";

const metadataBase = new URL(
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000",
);

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

export const dynamic = "force-dynamic";

const getPublicProduct = cache(async (productId: string) => {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isPublished: true,
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
      reservedQuantity: true,
      unit: true,
      priceCOP: true,
      municipality: true,
    },
  });

  if (!product) {
    return null;
  }

  const publicProduct = getPublicProducts([
      {
        ...product,
        availableQuantity: product.availableQuantity.toString(),
        reservedQuantity: product.reservedQuantity.toString(),
        isPublished: true,
      },
    ])[0];
  return publicProduct ? { ...publicProduct, ownerId: product.ownerId } : null;
});

type PublicProductPageProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PublicProductPageProps): Promise<Metadata> {
  const { productId } = await params;
  const product = await getPublicProduct(productId);

  if (!product) {
    return {
      title: "Producto no disponible | Agricultor",
      robots: { index: false, follow: false },
    };
  }

  return {
    metadataBase,
    ...getPublicProductMetadata(product, metadataBase),
  };
}

export default async function PublicProductPage({
  params,
  searchParams,
}: PublicProductPageProps) {
  const { productId } = await params;
  const product = await getPublicProduct(productId);

  if (!product) {
    notFound();
  }

  const priceDates = await getProductPriceDates([product]);
  const seller = await isSellerProfileAvailable() ? await prisma.sellerProfile.findFirst({
    where: { ownerId: product.ownerId, published: true, owner: { userRoles: { some: { role: "PRODUCER" } } } },
    select: { id: true, name: true },
  }) : null;
  const filters = parseCatalogFilters(await searchParams);
  const searchedQuantity = filters.unit === product.unit ? filters.minimumQuantity : undefined;
  const hasEnoughStock = Boolean(searchedQuantity &&
    Number(searchedQuantity) <= Number(product.availableQuantity));
  const identity = await getCurrentIdentity();
  const buyerId = identity?.roles.includes("BUYER") ? identity.userId : undefined;
  const favorite = buyerId
    ? await prisma.favorite.findUnique({
        where: { userId_productId: { userId: buyerId, productId: product.id } },
        select: { productId: true },
      })
    : null;
  const category =
    PRODUCT_CATEGORIES.find(({ value }) => value === product.category)?.label ??
    product.category;
  const unit =
    PRODUCT_UNITS.find(({ value }) => value === product.unit)?.label ??
    product.unit;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
        href={getCatalogPageHref(filters, filters.page)}
      >
        Volver al catálogo
      </Link>
      <article className="mt-4 rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-sm sm:mt-6 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Producto publicado
        </p>
        <h1 className="mt-4 text-3xl font-semibold">{product.name}</h1>
        {seller && (
          <Link className="mt-2 inline-flex min-h-11 items-center break-words font-semibold text-emerald-900 underline" href={getSellerProfileHref(seller.id)}>
            Ver perfil de {seller.name}
          </Link>
        )}
        <dl className="mt-6 grid gap-4 text-slate-700 sm:grid-cols-2">
          <div>
            <dt className="font-medium">Categoría</dt>
            <dd>{category}</dd>
          </div>
          <div>
            <dt className="font-medium">Cantidad disponible</dt>
            <dd>
              {quantityFormatter.format(Number(product.availableQuantity))}{" "}
              {unit}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Precio por unidad</dt>
            <dd>{copFormatter.format(product.priceCOP)}</dd>
            <ProductPriceDate date={priceDates.get(product.id)} />
            <p className="mt-1 text-sm text-slate-600">
              Precio publicado por el productor; las solicitudes requieren su
              confirmación. No es una cotización oficial ni una garantía de
              precio.
            </p>
          </div>
          <div>
            <dt className="font-medium">Municipio</dt>
            <dd>{product.municipality}</dd>
          </div>
          {searchedQuantity && hasEnoughStock && (
            <ProductQuantityEstimate quantity={searchedQuantity} unit={unit} priceCOP={product.priceCOP} />
          )}
        </dl>
        {searchedQuantity && !hasEnoughStock && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
            <p>Esta oferta tiene menos de la cantidad que buscaste.</p>
            <Link
              className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              href={getCatalogPageHref({ ...filters, minimumQuantity: undefined }, 1)}
            >
              Ver ofertas sin cantidad mínima
            </Link>
          </div>
        )}
        <ShareProductButton
          href={new URL(
            getPublicProductHref(product.id),
            metadataBase,
          ).toString()}
          productName={product.name}
        />
        <Link
          aria-label={`Solicitar este producto: ${product.name}`}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-800 px-4 py-2 text-center font-semibold text-white underline-offset-4 hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 sm:w-auto"
          href={getPublicProductOrderHref(product.id, filters)}
        >
          Solicitar este producto
        </Link>
        {buyerId && (
          <div className="mt-5 border-t border-slate-200 pt-1">
            <FavoriteControl isFavorite={Boolean(favorite)} productId={product.id} />
            <Link
              className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
              href="/mi-cuenta/favoritos"
            >
              Ver mis favoritos
            </Link>
          </div>
        )}
      </article>
    </main>
  );
}
