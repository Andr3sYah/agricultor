import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductForm } from "@/features/products/product-form";
import { canManageProducts } from "@/features/products/product-access";
import { PRODUCT_UNITS } from "@/features/products/product-validation";
import { formatAgriculturalValue } from "@/features/unit-converter/agricultural-units";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

type EditProductPageProps = {
  params: Promise<{ productId: string }>;
};

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const identity = await getCurrentIdentity();

  if (!identity) {
    redirect("/iniciar-sesion");
  }

  if (!canManageProducts(identity.roles)) {
    redirect("/mi-cuenta");
  }

  const { productId } = await params;
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      ownerId: identity.userId,
    },
  });

  if (!product) {
    notFound();
  }
  const unit = PRODUCT_UNITS.find(({ value }) => value === product.unit)?.label ?? product.unit;
  const hasReservations = product.reservedQuantity.gt(0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        className="font-semibold text-emerald-900 underline"
        href="/mi-cuenta/productos"
      >
        Volver a mis productos
      </Link>
      <section className="mt-6 rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Editar producto</h1>
        {hasReservations && (
          <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">Reservado en pedidos pendientes</p>
            <p className="mt-1 font-semibold">
              {formatAgriculturalValue(product.reservedQuantity.toString())} {unit}
            </p>
            <p className="mt-1">
              En «Cantidad disponible», escribe solo lo que puedes ofrecer a nuevos compradores.
            </p>
          </div>
        )}
        <ProductForm
          unitLocked={hasReservations}
          product={{
            id: product.id,
            name: product.name,
            category: product.category,
            availableQuantity: product.availableQuantity.toString(),
            unit: product.unit,
            pricingType: product.pricingType,
            priceCOP: product.priceCOP?.toString() ?? "",
            municipality: product.municipality,
          }}
        />
      </section>
    </main>
  );
}
