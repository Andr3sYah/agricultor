import { redirect } from "next/navigation";
import { SellForm } from "@/features/auth/role-form";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { getCurrentIdentity } from "@/lib/auth/server";
import { canManageProducts } from "@/features/products/product-access";
import { getProducerDashboardSummary } from "@/features/dashboard/producer-dashboard";
import { countFarmActivitiesToday } from "@/features/farm-agenda/farm-agenda-service";
import { prisma } from "@/lib/db";
import { isSellerProfileAvailable } from "@/features/sellers/seller-profile";
import Link from "next/link";

const button = "inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-3 text-center font-semibold";
const primary = `${button} bg-primary text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`;
const secondary = `${button} border border-control-border bg-surface text-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`;
const card = "border-t border-border py-5 sm:py-6";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const producerIntent = params.intent === "producer";
  const identity = await getCurrentIdentity();

  if (!identity) {
    redirect(producerIntent ? "/iniciar-sesion?intent=producer" : "/iniciar-sesion");
  }

  const canSell = canManageProducts(identity.roles);
  if (producerIntent && canSell) redirect("/mi-cuenta/productos");

  const [dashboard, todayCount, sellerProfileAvailable] = canSell
    ? await Promise.all([
        getProducerDashboardSummary(identity, prisma),
        countFarmActivitiesToday(identity, prisma, new Date()),
        isSellerProfileAvailable(),
      ])
    : [null, 0, false] as const;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <h1 className="font-serif text-4xl font-bold">Mi cuenta</h1>
          <SignOutButton />
        </header>

        <nav aria-label="Compras y pedidos" className={`${card} grid grid-cols-2 gap-3 sm:grid-cols-4`}>
          <Link className={primary} href="/catalogo">Comprar</Link>
          <Link className={secondary} href="/mi-cuenta/pedidos">Mis pedidos</Link>
          <Link className={secondary} href="/mi-cuenta/favoritos">Favoritos</Link>
          <Link className={secondary} href="/mi-cuenta/avisos">Avisos</Link>
        </nav>

        <section aria-labelledby="sales-title" className={card}>
          <h2 id="sales-title" className="font-serif text-2xl font-bold">Ventas</h2>
          {dashboard ? (
            <>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                <div className="border-l-2 border-emerald-700 pl-3">
                  <dt className="text-sm">Publicados</dt>
                  <dd className="text-xl font-bold">{dashboard.products.published}</dd>
                </div>
                <div className="border-l-2 border-amber-700 pl-3">
                  <dt className="text-sm">Agotados</dt>
                  <dd className="text-xl font-bold">{dashboard.products.soldOut}</dd>
                </div>
                <div className="border-l-2 border-blue-700 pl-3">
                  <dt className="text-sm">Por responder</dt>
                  <dd className="text-xl font-bold">{dashboard.orders.PENDING}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link className={primary} href="/mi-cuenta/productos#formulario-producto">Vender producto</Link>
                <Link className={secondary} href="/mi-cuenta/productos">Gestionar inventario</Link>
                <Link
                  className={secondary}
                  href={dashboard.orders.PENDING > 0
                    ? "/mi-cuenta/pedidos#pedidos-por-responder"
                    : "/mi-cuenta/pedidos#pedidos-recibidos"}
                >
                  {dashboard.orders.PENDING === 1
                    ? "Responder 1 pedido"
                    : dashboard.orders.PENDING > 1
                      ? `Responder ${dashboard.orders.PENDING} pedidos`
                      : "Ver pedidos recibidos"}
                </Link>
                {sellerProfileAvailable && (
                  <Link className={secondary} href="/mi-cuenta/perfil-vendedor">Editar perfil de vendedor</Link>
                )}
                <Link className={secondary} href="/mi-cuenta/analitica">Analítica manual</Link>
              </div>
            </>
          ) : <SellForm />}
        </section>

        {dashboard && (
          <section aria-labelledby="tools-title" className={card}>
            <h2 id="tools-title" className="font-serif text-2xl font-bold">Herramientas</h2>
            {todayCount > 0 && (
              <p className="mt-2 text-sm text-emerald-950">
                {todayCount === 1 ? "1 labor para hoy" : `${todayCount} labores para hoy`}
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Link className={secondary} href="/mi-cuenta/agenda#farm-activities-title">Abrir mi agenda</Link>
              <Link className={secondary} href="/mi-cuenta/conversor">Abrir conversor</Link>
              <Link className={secondary} href="/mi-cuenta/calculadora">Calcular costos y margen</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
