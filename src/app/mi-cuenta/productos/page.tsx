import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductForm } from "@/features/products/product-form";
import { canManageProducts } from "@/features/products/product-access";
import { PublicationToggle } from "@/features/products/publication-toggle";
import {
  setProductPriceReferenceOptIn,
  updateProductAvailability,
  updateProductPrice,
} from "@/features/products/product-actions";
import { QuickProductFieldForm } from "@/features/products/quick-product-field-form";
import { PriceReferenceOptIn } from "@/features/products/price-reference-opt-in";
import {
  getAvailabilityLabel,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from "@/features/products/product-validation";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import {
  isSellerProfileAvailable,
  isSellerProfileCompleteForSales,
} from "@/features/sellers/seller-profile";
import { inferColombianLocation } from "@/features/sellers/colombian-location";

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sellIntent = params.intent === "sell";
  const identity = await getCurrentIdentity();

  if (!identity) {
    redirect("/iniciar-sesion");
  }

  if (!canManageProducts(identity.roles)) {
    redirect("/mi-cuenta");
  }

  const profileAvailable = await isSellerProfileAvailable();
  const sellerProfile = profileAvailable
    ? await prisma.sellerProfile.findUnique({ where: { ownerId: identity.userId } })
    : null;
  const sellerLocation = sellerProfile
    ? inferColombianLocation(
        sellerProfile.municipality,
        sellerProfile.department,
      )
    : null;
  const sellerProfileComplete = isSellerProfileCompleteForSales(sellerProfile);
  if (sellIntent && !sellerProfileComplete) {
    redirect(
      `/mi-cuenta/perfil-vendedor?returnTo=${encodeURIComponent("/mi-cuenta/productos?intent=sell")}`,
    );
  }

  const products = await prisma.product.findMany({
    where: { ownerId: identity.userId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        className="font-semibold text-emerald-900 underline"
        href="/mi-cuenta"
      >
        Volver a mi cuenta
      </Link>
      <section className="mt-6 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Mis productos</h1>
        <p className="mt-3 text-slate-700">
          «Guardar en inventario» mantiene el producto privado. «Vender producto»
          crea el registro de inventario y publica la oferta en catálogo en un solo paso.
          Las solicitudes recibidas aparecerán en el seguimiento de pedidos.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Si eliges «Precio a convenir», los compradores se comunicarán contigo y
          acordarán la compra fuera de Agricultor.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          «Disponible» o «Agotado» indica si tienes existencias. «Publicado» o
          «Privado» indica si las personas pueden ver tu oferta en el catálogo.
        </p>
        <nav
          aria-label="Acciones de productor"
          className="mt-4 flex flex-wrap gap-4"
        >
          <Link
            className="font-semibold text-emerald-900 underline underline-offset-4"
            href="/mi-cuenta/productos?intent=sell#formulario-producto"
          >
            Vender producto
          </Link>
          <Link
            className="font-semibold text-emerald-900 underline underline-offset-4"
            href="/mi-cuenta/pedidos"
          >
            Ver pedidos recibidos
          </Link>
          <Link
            className="font-semibold text-emerald-900 underline underline-offset-4"
            href="/catalogo"
          >
            Ver catálogo publicado
          </Link>
        </nav>
        <ProductForm
          allowSell={sellerProfileComplete}
          draftStorageKey={identity.userId}
          sellerDepartment={sellerProfileComplete ? sellerLocation?.department : ""}
          sellerMunicipality={sellerProfileComplete ? sellerLocation?.municipality : ""}
        />
      </section>
      <section className="mt-8 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-12">
        <h2 className="text-2xl font-semibold">Tus productos</h2>
        {products.length === 0 ? (
          <p className="mt-4 text-slate-700">
            Aún no tienes productos. Usa el formulario para guardar uno en privado o
            venderlo y publicarlo de una vez.
          </p>
        ) : (
          <ul className="mt-5 space-y-4">
            {products.map((product) => {
              const category =
                PRODUCT_CATEGORIES.find(({ value }) => value === product.category)
                  ?.label ?? product.category;
              const unit =
                PRODUCT_UNITS.find(({ value }) => value === product.unit)?.label ??
                product.unit;

              return (
                <li
                  className="scroll-mt-4 rounded-2xl border border-slate-200 p-4 sm:p-5"
                  id={`producto-${product.id}`}
                  key={product.id}
                  tabIndex={-1}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{product.name}</h3>
                      <p className="mt-1 text-sm text-slate-700">{category}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900">
                      {getAvailabilityLabel(product.availableQuantity.toString())}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {product.isPublished
                      ? "Oferta pública en el catálogo"
                      : "Inventario privado; no es una oferta pública"}
                  </p>
                  <dl className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div>
                      <dt className="font-medium">Disponible para nuevos pedidos</dt>
                      <dd>
                        {quantityFormatter.format(product.availableQuantity.toNumber())}{" "}
                        {unit}
                      </dd>
                    </div>
                    {product.reservedQuantity.gt(0) && (
                      <div>
                        <dt className="font-medium">Reservado en pedidos pendientes</dt>
                        <dd>
                          {quantityFormatter.format(product.reservedQuantity.toNumber())}{" "}
                          {unit}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="font-medium">Precio por unidad</dt>
                      <dd>
                        {product.pricingType === "FIXED" && product.priceCOP !== null
                          ? copFormatter.format(product.priceCOP)
                          : "Precio a convenir"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium">Municipio o localidad</dt>
                      <dd>{product.municipality}</dd>
                    </div>
                  </dl>
                  {product.pricingType === "FIXED" && product.priceCOP !== null && (
                    <>
                      <QuickProductFieldForm
                        field="priceCOP"
                        label={`Precio en pesos por ${unit}`}
                        productId={product.id}
                        saveAction={updateProductPrice.bind(null, product.id, product.unit, product.priceCOP)}
                        value={String(product.priceCOP)}
                      />
                      <PriceReferenceOptIn
                        action={setProductPriceReferenceOptIn}
                        enabled={product.priceReferenceEnabled}
                        productId={product.id}
                      />
                    </>
                  )}
                  <QuickProductFieldForm
                    field="availableQuantity"
                    hint="Escribe cuánto puedes vender en pedidos nuevos. Si ya agotaste el producto, escribe 0."
                    label={`Cantidad disponible en ${unit}`}
                    productId={product.id}
                    saveAction={updateProductAvailability.bind(null, product.id, product.unit, product.availableQuantity.toString())}
                    value={product.availableQuantity.toString().replace(".", ",")}
                  />
                  <Link
                    className="mt-4 inline-flex rounded-xl border border-emerald-900 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-50"
                    href={`/mi-cuenta/productos/${encodeURIComponent(product.id)}/editar`}
                  >
                    Editar producto
                  </Link>
                  {sellerProfileComplete ? (
                    <PublicationToggle
                      isPublished={product.isPublished}
                      productId={product.id}
                    />
                  ) : (
                    <p className="mt-4 text-sm text-slate-700">
                      Para publicar este producto,{" "}
                      <Link
                        className="font-semibold text-emerald-900 underline"
                        href={`/mi-cuenta/perfil-vendedor?returnTo=${encodeURIComponent("/mi-cuenta/productos?intent=sell")}`}
                      >
                        completa tus datos de vendedor
                      </Link>
                      .
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
