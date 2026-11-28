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
import { getPublicCatalogMunicipalities } from "@/features/catalog/public-municipalities";
import { FavoriteControl } from "@/features/favorites/favorite-control";
import { ProductQuantityEstimate } from "@/features/catalog/product-quantity-estimate";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from "@/features/products/product-validation";
import { prisma } from "@/lib/db";
import { getCurrentIdentity } from "@/lib/auth/server";
import { SiteHeader } from "@/components/site-header";
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
  const municipalities = await getPublicCatalogMunicipalities();
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
      pricingType: true,
      priceCOP: true,
      municipality: true,
      isPublished: true,
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
  const fixedPriceProducts = products.filter(
    (product): product is typeof product & { pricingType: "FIXED"; priceCOP: number } =>
      product.pricingType === "FIXED" && product.priceCOP !== null,
  );
  const priceDates = await getProductPriceDates(fixedPriceProducts);
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
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
      <SiteHeader authenticated={Boolean(identity)} />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-foreground/75 transition-colors hover:bg-surface-accent hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href="/"
        >
          <span aria-hidden="true">←</span> Inicio
        </Link>
        {identity?.roles.includes("BUYER") && (
        <Link
          className="inline-flex min-h-11 items-center rounded-lg border border-primary/25 bg-surface px-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href="/mi-cuenta/favoritos"
        >
          Ver mis favoritos →
        </Link>
        )}
      </div>
      <section className="mt-4 overflow-hidden rounded-3xl border border-[#d8dfce] bg-surface-accent px-5 py-7 sm:px-8 sm:py-9">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary sm:text-sm">
          Productos del campo colombiano
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Catálogo del campo</h1>
            <p className="mt-3 max-w-2xl leading-relaxed text-foreground/80">
              Busca productos por municipio, categoría o cantidad.
            </p>
          </div>
          <p className="max-w-sm rounded-2xl border border-primary/15 bg-surface/80 p-3.5 text-sm leading-relaxed text-foreground/80">
            <span className="font-bold text-foreground">Contacto y ubicación:</span>{" "}
            solo se muestran con autorización del vendedor. Sin autorización, vemos barrio o vereda y municipio.
          </p>
        </div>
      </section>
      <form
        action="/catalogo"
        className="mt-5 grid gap-4 rounded-3xl border border-border bg-surface p-4 shadow-sm sm:grid-cols-2 sm:items-end sm:p-6 lg:grid-cols-[1fr_1fr_1fr_auto]"
        key={
          quantityError || filters.priceFilterError
            ? `${filterHref}:${quantityInput}:${minimumPriceInput}:${maximumPriceInput}`
            : filterHref
        }
        method="get"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="mb-2 block text-sm font-bold" htmlFor="producto">
            Nombre del producto
          </label>
          <input
            className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5 text-foreground placeholder:text-foreground/45"
            defaultValue={filters.name ?? ""}
            id="producto"
            maxLength={100}
            name="producto"
            placeholder="Por ejemplo, papa"
            type="search"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-bold" htmlFor="categoria">
            Categoría
          </label>
          <select
            className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
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
          <label className="mb-2 block text-sm font-bold" htmlFor="orden">
            Ordenar por
          </label>
          <select
            className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
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
          <label className="mb-2 block text-sm font-bold" htmlFor="municipio">
            Municipio
          </label>
          <p className="mb-2 text-sm text-foreground/70" id="municipio-ayuda">
            Usa el nombre del municipio de la oferta.
          </p>
          <input
            autoComplete="address-level2"
            className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
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
          className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-4"
        >
          <legend className="px-1 text-sm font-bold">Precio por unidad (COP)</legend>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="precio-min">
              Precio mínimo
            </label>
            <input
              aria-describedby={filters.priceFilterError ? "precio-error" : undefined}
              aria-invalid={Boolean(filters.priceFilterError)}
              className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
              defaultValue={minimumPriceInput}
              id="precio-min"
              inputMode="numeric"
              maxLength={10}
              name="precioMin"
              placeholder="Por ejemplo, 2000"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="precio-max">
              Precio máximo
            </label>
            <input
              aria-describedby={filters.priceFilterError ? "precio-error" : undefined}
              aria-invalid={Boolean(filters.priceFilterError)}
              className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
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
        <fieldset className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-4">
          <legend className="px-1 text-sm font-bold">Buscar por cantidad</legend>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="cantidad">
              Cantidad que necesitas
            </label>
            <input
              aria-describedby={quantityError ? "cantidad-error" : undefined}
              aria-invalid={Boolean(quantityError && filters.unit)}
              className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
              defaultValue={filters.minimumQuantity?.replace(".", ",") ?? quantityInput}
              id="cantidad"
              inputMode="decimal"
              maxLength={13}
              name="cantidad"
              placeholder="Por ejemplo, 50"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="unidad">
              Unidad de venta
            </label>
            <select
              aria-describedby={quantityError && !filters.unit ? "cantidad-error" : undefined}
              aria-invalid={Boolean(quantityError && !filters.unit)}
              className="min-h-12 w-full rounded-xl border border-control-border/60 bg-white px-3.5"
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
          className="min-h-12 w-full rounded-xl bg-primary px-6 py-2 font-bold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
          type="submit"
        >
          Buscar
        </button>
      </form>
      {filterHref !== "/catalogo" || quantityError || filters.priceFilterError ? (
        <Link
          className="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
          href="/catalogo"
        >
          Restablecer filtros y orden
        </Link>
      ) : null}
      {total > 0 && products.length > 0 ? (
        <p className="mt-6 text-sm font-semibold text-foreground/75" role="status">
          {total === 1
            ? "1 oferta encontrada"
            : `${resultCountFormatter.format(total)} ofertas encontradas`}
        </p>
      ) : null}
      {products.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-border bg-surface p-6 text-foreground/80 shadow-sm sm:p-8">
          <p>
            {hasFilters
              ? "No encontramos productos con estos filtros."
              : "No hay productos publicados y disponibles en este momento."}
          </p>
          {filters.minimumQuantity && (
            <>
              <p className="mt-2 text-sm">
                Quita la cantidad mínima para ver más ofertas.
              </p>
              <Link
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                href={getCatalogPageHref({ ...filters, minimumQuantity: undefined }, 1)}
              >
                Quitar solo la cantidad mínima
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul aria-label="Ofertas disponibles" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                className="flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
                key={product.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex max-w-full rounded-full bg-surface-accent px-3 py-1 text-xs font-bold text-primary">
                    {category}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      Number(product.availableQuantity) > 0
                        ? "bg-[#e8f0e5] text-[#285632]"
                        : "bg-[#f4eadb] text-[#764b1e]"
                    }`}
                  >
                    {Number(product.availableQuantity) > 0 ? "Disponible" : "En reserva"}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-bold leading-snug tracking-tight sm:text-2xl">
                  <Link
                    className="inline-block min-h-6 max-w-full break-words align-middle underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    href={getPublicProductHref(product.id, {
                      ...filters,
                      page: pagination.page,
                    })}
                  >
                    {product.name}
                  </Link>
                </h2>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-foreground/75">
                  <div className="col-span-2 rounded-2xl bg-background px-4 py-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-foreground/65">
                      {product.pricingType === "FIXED" ? `Precio por ${unit}` : "Precio"}
                    </dt>
                    <dd className="mt-1 text-2xl font-bold tracking-tight text-primary sm:text-[1.7rem]">
                      {product.pricingType === "FIXED" && product.priceCOP !== null
                        ? copFormatter.format(product.priceCOP)
                        : "Consultar precio"}
                    </dd>
                    {product.pricingType === "FIXED" && (
                      <ProductPriceDate date={priceDates.get(product.id)} />
                    )}
                  </div>
                  <div className="rounded-2xl border border-border/80 p-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-foreground/65">
                      Disponible
                    </dt>
                    <dd className="mt-1 font-bold text-foreground">
                      {quantityFormatter.format(Number(product.availableQuantity))} {unit}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-border/80 p-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-foreground/65">
                      Municipio
                    </dt>
                    <dd className="mt-1 break-words font-bold text-foreground">
                      {product.municipality}
                    </dd>
                  </div>
                  {filters.minimumQuantity &&
                    product.pricingType === "FIXED" &&
                    product.priceCOP !== null && (
                    <ProductQuantityEstimate
                      quantity={filters.minimumQuantity}
                      unit={unit}
                      priceCOP={product.priceCOP}
                    />
                  )}
                </dl>
                {sellerProfile && (
                  <SellerPublicContact profile={sellerProfile} />
                )}
                {product.pricingType === "NEGOTIABLE" ? (
                  <p className="mt-5 rounded-xl border border-primary/20 bg-surface-accent p-3 text-sm text-foreground/80">
                    Contacta al vendedor para acordar el precio. La compra se
                    continúa fuera de Agricultor.
                  </p>
                ) : Number(product.availableQuantity) > 0 ? (
                  <Link
                    aria-label={`Solicitar este producto: ${product.name}`}
                    className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-center font-bold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    href={getPublicProductOrderHref(product.id, {
                      ...filters,
                      page: pagination.page,
                    })}
                  >
                    Solicitar este producto
                  </Link>
                ) : null}
                {identity?.roles.includes("BUYER") ? (
                  <FavoriteControl
                    isFavorite={savedProductIds.has(product.id)}
                    productId={product.id}
                  />
                ) : (
                  <p className="mt-4 text-sm text-foreground/75">
                    <Link
                      className="inline-flex min-h-11 items-center font-semibold text-primary underline"
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
          className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3"
        >
          {pagination.page > 1 ? (
            <Link
              className="inline-flex min-h-12 items-center rounded-xl border border-primary/40 px-4 py-2 font-bold text-primary transition-colors hover:bg-surface-accent"
              href={getCatalogPageHref(filters, pagination.page - 1)}
            >
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span aria-live="polite" className="text-sm font-semibold text-foreground/75">
            Página {pagination.page} de {pagination.pageCount}
          </span>
          {pagination.page < pagination.pageCount ? (
            <Link
              className="inline-flex min-h-12 items-center rounded-xl border border-primary/40 px-4 py-2 font-bold text-primary transition-colors hover:bg-surface-accent"
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
