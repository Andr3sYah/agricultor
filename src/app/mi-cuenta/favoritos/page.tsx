import Link from "next/link";
import { redirect } from "next/navigation";
import { FavoriteControl } from "@/features/favorites/favorite-control";
import { listFavorites } from "@/features/favorites/favorite-service";
import { getPublicProductHref } from "@/features/catalog/public-products";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
} from "@/features/products/product-validation";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 3,
});

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const identity = await getCurrentIdentity();

  if (!identity) {
    redirect("/iniciar-sesion");
  }

  if (!identity.roles.includes("BUYER")) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold">Mis favoritos</h1>
        <p className="mt-4 text-slate-700">
          Agrega el perfil de comprador a tu cuenta para guardar y consultar
          productos favoritos.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-emerald-900 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-50"
          href="/mi-cuenta"
        >
          Ir a mi cuenta
        </Link>
      </main>
    );
  }

  const result = await listFavorites(identity, prisma);
  const products = result.ok ? result.products : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <Link className="font-semibold text-emerald-900 underline" href="/mi-cuenta">
        Volver a mi cuenta
      </Link>
      <section className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Mis favoritos</h1>
        <p className="mt-3 text-slate-700">
          Esta lista es privada. Aquí aparecen las ofertas que guardaste y que
          todavía tienen cantidad disponible.
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-emerald-900 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-50"
          href="/catalogo"
        >
          Explorar catálogo
        </Link>
      </section>
      {products.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-700">
          Aún no tienes productos favoritos disponibles. Puedes guardar una
          oferta desde el catálogo o desde su ficha.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const category =
              PRODUCT_CATEGORIES.find(({ value }) => value === product.category)
                ?.label ?? product.category;
            const unit =
              PRODUCT_UNITS.find(({ value }) => value === product.unit)?.label ??
              product.unit;

            return (
              <li
                className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm"
                key={product.id}
              >
                <h2 className="text-xl font-semibold">{product.name}</h2>
                <dl className="mt-4 space-y-3 text-sm text-slate-700">
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
                    <dd>
                      {product.pricingType === "FIXED" && product.priceCOP !== null
                        ? copFormatter.format(product.priceCOP)
                        : "Consultar precio"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Municipio</dt>
                    <dd>{product.municipality}</dd>
                  </div>
                </dl>
                <Link
                  aria-label={`Ver oferta de ${product.name}`}
                  className="mt-4 inline-flex min-h-11 items-center font-semibold text-emerald-900 underline"
                  href={getPublicProductHref(product.id)}
                >
                  Ver oferta
                </Link>
                <FavoriteControl isFavorite productId={product.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
