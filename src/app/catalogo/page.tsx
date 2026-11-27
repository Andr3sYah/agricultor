import Link from "next/link";
import { getProductPriceDates, ProductPriceDate } from "@/features/catalog/product-price-date";
import {
  getCatalogPageHref,
  getCatalogOrderBy,
  getCatalogPagination,
  getPublicProductHref,
  getPublicProductWhere,
  getPublicProductOrderHref,
  getPublicProducts,
  parseCatalogFilters,
} from "@/features/catalog/public-products";
import { FavoriteControl } from "@/features/favorites/favorite-control";
import { ProductQuantityEstimate } from "@/features/catalog/product-quantity-estimate";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from "@/features/products/product-validation";
import { prisma } from "@/lib/db";
import { getCurrentIdentity } from "@/lib/auth/server";
import { SiteHeader } from "@/components/site-header";
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
const resultCountFormatter = new Intl.NumberFormat("es-CO");

export const metadata = {
  title: "Catálogo público | Agricultor",
  description: "Ofertas publicadas con inventario disponible o reservado.",
};

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const filters = parseCatalogFilters(params);
  const quantityInput = typeof params.cantidad === "string" ? params.cantidad.trim().slice(0, 13) : "";
  const quantityError = quantityInput && !filters.minimumQuantity
    ? filters.unit
      ? "Escribe una cantidad mayor que cero, con máximo 3 decimales."
      : "Elige una unidad para buscar por cantidad."
    : undefined;
  const minimumPriceInput =
    typeof params.precioMin === "string" ? params.precioMin.trim().slice(0, 20) : "";
  const maximumPriceInput =
    typeof params.precioMax === "string" ? params.precioMax.trim().slice(0, 20) : "";
  const municipalityRows = await prisma.product.findMany({
    where: {
      isPublished: true,
      ...getPublicSellerOfferCondition(),
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
      municipality: { not: "" },
    },
    distinct: ["municipality"],
    select: { municipality: true },
    orderBy: { municipality: "asc" },
  });
  const municipalities = municipalityRows.map(({ municipality }) => municipality);
  const hasFilters = Boolean(
    filters.name ||
    filters.category ||
    filters.municipality ||
    filters.unit ||
    filters.minimumPrice !== undefined ||
    filters.maximumPrice !== undefined ||
    filters.priceFilterError,
  );
  const filterHref = getCatalogPageHref(filters, 1);
  const where = getPublicProductWhere(filters);
  const total = await prisma.product.count({ where });
  const pagination = getCatalogPagination(total, filters.page);
  const records = await prisma.product.findMany({
    where,
    skip: pagination.skip,
    take: pagination.take,
    select: {
      id: true,
      name: true,
      category: true,
      availableQuantity: true,
      reservedQuantity: true,
      unit: true,
      priceCOP: true,
      municipality: true,
      isPublished: true,
      owner: {
        select: {
          sellerProfile: {
            select: {
              municipality: true,
              neighborhood: true,
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
    orderBy: getCatalogOrderBy(filters.sort),
  });
  const products = getPublicProducts(
    records.map((product) => ({
      ...product,
      availableQuantity: product.availableQuantity.toString(),
      reservedQuantity: product.reservedQuantity.toString(),
    })),
  );
  const sellerProfilesByProductId = new Map(
    records.map(({ id, owner }) => [id, owner.sellerProfile]),
  );
  const priceDates = await getProductPriceDates(products);
  const identity = await getCurrentIdentity();
  const favoriteIds =
    identity?.roles.includes("BUYER") && products.length > 0
      ? await prisma.favorite.findMany({
          where: {
            userId: identity.userId,
            productId: { in: products.map(({ id }) => id) },
          },
          select: { productId: true },
        })
      : [];
  const savedProductIds = new Set(favoriteIds.map(({ productId }) => productId));

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <SiteHeader authenticated={Boolean(identity)} />
      <Link
        className="mt-3 inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
        href="/"
      >
        Volver al inicio
      </Link>
      {identity?.roles.includes("BUYER") && (
        <Link
          className="ml-4 inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
          href="/mi-cuenta/favoritos"
        >
          Ver mis favoritos
        </Link>
      )}
      <section className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Catálogo público</h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Consulta ofertas publicadas con inventario disponible o reservado. Cada oferta muestra el celular, correo y ubicación aproximada (barrio o vereda y municipio) que el vendedor aceptó compartir. No publicamos direcciones exactas.
        </p>
      </section>
      <form
        action="/catalogo"
        className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:items-end sm:p-6 lg:grid-cols-[1fr_1fr_1fr_auto]"
        key={
          quantityError || filters.priceFilterError
            ? `${filterHref}:${quantityInput}:${minimumPriceInput}:${maximumPriceInput}`
            : filterHref
        }
        method="get"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="mb-2 block text-sm font-medium" htmlFor="producto">
            Nombre del producto
          </label>
          <input
            className="min-h-12 w-full rounded-lg border border-slate-300 px-3"
            defaultValue={filters.name ?? ""}
            id="producto"
            maxLength={100}
            name="producto"
            placeholder="Por ejemplo, papa"
            type="search"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="categoria">
            Categoría
          </label>
          <select
            className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3"
            defaultValue={filters.category ?? ""}
            id="categoria"
            name="categoria"
          >
            <option value="">Todas las categorías</option>
            {PRODUCT_CATEGORIES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="orden">
            Ordenar por
          </label>
          <select
            className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3"
            defaultValue={filters.sort ?? ""}
            id="orden"
            name="orden"
          >
            <option value="">Más recientes</option>
            <option value="precio-asc">Menor precio</option>
            <option value="precio-desc">Mayor precio</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="municipio">
            Municipio
          </label>
          <p className="mb-2 text-sm text-slate-700" id="municipio-ayuda">
            Escribe el nombre del municipio tal como aparece en la oferta.
          </p>
          <input
            autoComplete="address-level2"
            className="min-h-12 w-full rounded-lg border border-slate-300 px-3"
            defaultValue={filters.municipality ?? ""}
            aria-describedby="municipio-ayuda"
            id="municipio"
            list="municipios-disponibles"
            maxLength={100}
            name="municipio"
            type="text"
          />
          <datalist id="municipios-disponibles">
            {municipalities.map((municipality) => (
              <option key={municipality} value={municipality} />
            ))}
          </datalist>
        </div>
        <fieldset
          aria-describedby={filters.priceFilterError ? "precio-error" : undefined}
          aria-invalid={Boolean(filters.priceFilterError)}
          className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4"
        >
          <legend className="px-1 text-sm font-semibold">Precio por unidad (COP)</legend>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="precio-min">
              Precio mínimo
            </label>
            <input
              aria-describedby={filters.priceFilterError ? "precio-error" : undefined}
              aria-invalid={Boolean(filters.priceFilterError)}
              className="min-h-12 w-full rounded-lg border border-slate-300 px-3"
              defaultValue={minimumPriceInput}
              id="precio-min"
              inputMode="numeric"
              maxLength={10}
              name="precioMin"
              placeholder="Por ejemplo, 2000"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="precio-max">
              Precio máximo
            </label>
            <input
              aria-describedby={filters.priceFilterError ? "precio-error" : undefined}
              aria-invalid={Boolean(filters.priceFilterError)}
              className="min-h-12 w-full rounded-lg border border-slate-300 px-3"
              defaultValue={maximumPriceInput}
              id="precio-max"
              inputMode="numeric"
              maxLength={10}
              name="precioMax"
              placeholder="Por ejemplo, 10000"
            />
          </div>
          {filters.priceFilterError && (
            <p className="text-sm text-rose-800 sm:col-span-2" id="precio-error" role="alert">
              {filters.priceFilterError} El catálogo no aplicó el rango de precios.
            </p>
          )}
        </fieldset>
        <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-4">
          <legend className="px-1 text-sm font-semibold">Buscar por cantidad</legend>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="cantidad">
              Cantidad que necesitas
            </label>
            <input
              aria-describedby={quantityError ? "cantidad-error" : undefined}
              aria-invalid={Boolean(quantityError && filters.unit)}
              className="min-h-12 w-full rounded-lg border border-slate-300 px-3"
              defaultValue={filters.minimumQuantity?.replace(".", ",") ?? quantityInput}
              id="cantidad"
              inputMode="decimal"
              maxLength={13}
              name="cantidad"
              placeholder="Por ejemplo, 50"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="unidad">
              Unidad de venta
            </label>
            <select
              aria-describedby={quantityError && !filters.unit ? "cantidad-error" : undefined}
              aria-invalid={Boolean(quantityError && !filters.unit)}
              className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3"
              defaultValue={filters.unit ?? ""}
              id="unidad"
              name="unidad"
            >
              <option value="">Todas las unidades</option>
              {PRODUCT_UNITS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {quantityError && (
            <p id="cantidad-error" className="text-sm text-rose-800 sm:col-span-2" role="alert">
              {quantityError} La cantidad aún no se aplicó a los resultados.
            </p>
          )}
        </fieldset>
        <button
          className="min-h-12 w-full rounded-lg bg-emerald-800 px-5 py-2 font-semibold text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 sm:w-auto"
          type="submit"
        >
          Buscar
        </button>
      </form>
      {filterHref !== "/catalogo" || quantityError || filters.priceFilterError ? (
        <Link
          className="mt-2 inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4"
          href="/catalogo"
        >
          Restablecer filtros y orden
        </Link>
      ) : null}
      {total > 0 && products.length > 0 ? (
        <p className="mt-6 text-sm text-slate-700" role="status">
          {total === 1
            ? "1 oferta encontrada"
            : `${resultCountFormatter.format(total)} ofertas encontradas`}
        </p>
      ) : null}
      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 sm:p-6">
          <p>
            {hasFilters
              ? "No encontramos productos con estos filtros."
              : "No hay productos publicados y disponibles en este momento."}
          </p>
          {filters.minimumQuantity && (
            <>
              <p className="mt-2 text-sm">
                Puedes quitar la cantidad mínima para ver si hay ofertas con menos existencias.
              </p>
              <Link
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-emerald-900 underline underline-offset-4"
                href={getCatalogPageHref({ ...filters, minimumQuantity: undefined }, 1)}
              >
                Quitar solo la cantidad mínima
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const category =
              PRODUCT_CATEGORIES.find(({ value }) => value === product.category)
                ?.label ?? product.category;
            const unit =
              PRODUCT_UNITS.find(({ value }) => value === product.unit)?.label ??
              product.unit;
            const sellerProfile = sellerProfilesByProductId.get(product.id);

            return (
              <li
                className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-6"
                key={product.id}
              >
                <h2 className="text-xl font-semibold">
                  <Link
                    className="inline-block min-h-6 max-w-full break-words align-middle leading-6 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                    href={getPublicProductHref(product.id, {
                      ...filters,
                      page: pagination.page,
                    })}
                  >
                    {product.name}
                  </Link>
                </h2>
                <dl className="mt-4 space-y-3 text-sm text-slate-700">
                  <div>
                    <dt className="font-medium">Categoría</dt>
                    <dd>{category}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Cantidad disponible</dt>
                    <dd>
                      {quantityFormatter.format(
                        Number(product.availableQuantity),
                      )}{" "}
                      {unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Precio por unidad</dt>
                    <dd>{copFormatter.format(product.priceCOP)}</dd>
                    <ProductPriceDate date={priceDates.get(product.id)} />
                  </div>
                  {filters.minimumQuantity && (
                    <ProductQuantityEstimate
                      quantity={filters.minimumQuantity}
                      unit={unit}
                      priceCOP={product.priceCOP}
                    />
                  )}
                  <div>
                    <dt className="font-medium">Municipio</dt>
                    <dd>{product.municipality}</dd>
                  </div>
                </dl>
                {sellerProfile && (
                  <SellerPublicContact profile={sellerProfile} />
                )}
                {Number(product.availableQuantity) > 0 && (
                  <Link
                    aria-label={`Solicitar este producto: ${product.name}`}
                    className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-800 px-4 py-2 text-center font-semibold text-white underline-offset-4 hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900 sm:w-auto"
                    href={getPublicProductOrderHref(product.id, {
                      ...filters,
                      page: pagination.page,
                    })}
                  >
                    Solicitar este producto
                  </Link>
                )}
                {identity?.roles.includes("BUYER") ? (
                  <FavoriteControl
                    isFavorite={savedProductIds.has(product.id)}
                    productId={product.id}
                  />
                ) : (
                  <p className="mt-4 text-sm text-slate-700">
                    <Link
                      className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
                      href={identity ? "/mi-cuenta" : "/iniciar-sesion"}
                    >
                      {identity ? "Agrega el perfil de comprador" : "Inicia sesión"}
                    </Link>{" "}
                    para guardar favoritos.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {total > 0 && pagination.pageCount > 1 ? (
        <nav
          aria-label="Paginación del catálogo"
          className="mt-8 flex items-center justify-between gap-4"
        >
          {pagination.page > 1 ? (
            <Link
              className="inline-flex min-h-12 items-center rounded-lg border border-emerald-900 px-4 py-2 font-semibold text-emerald-900"
              href={getCatalogPageHref(filters, pagination.page - 1)}
            >
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span aria-live="polite" className="text-sm text-slate-700">
            Página {pagination.page} de {pagination.pageCount}
          </span>
          {pagination.page < pagination.pageCount ? (
            <Link
              className="inline-flex min-h-12 items-center rounded-lg border border-emerald-900 px-4 py-2 font-semibold text-emerald-900"
              href={getCatalogPageHref(filters, pagination.page + 1)}
            >
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}
