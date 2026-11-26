import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/lib/auth/server";
import { prisma } from "@/lib/db";

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export const dynamic = "force-dynamic";

export default async function SellerAnalyticsPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect("/iniciar-sesion");
  if (!identity.roles.includes("PRODUCER")) redirect("/mi-cuenta");

  const changes = await prisma.productPriceChange.findMany({
    where: { actorId: identity.userId },
    include: { product: { select: { name: true, unit: true } } },
    orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <Link className="inline-flex min-h-11 items-center font-semibold text-emerald-900 underline" href="/mi-cuenta">
        Volver a mi cuenta
      </Link>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">Analítica manual</p>
        <h1 className="mt-2 text-3xl font-semibold">Historial de precios y contexto</h1>
        <p className="mt-3 text-slate-700">
          El historial registra cambios confirmados por el productor. No se realiza actualización automática ni scraping.
        </p>
      </header>

      <section aria-labelledby="manual-history" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold" id="manual-history">Cambios manuales recientes</h2>
        {changes.length === 0 ? (
          <p className="mt-3 text-slate-700">Todavía no hay cambios de precio registrados.</p>
        ) : (
          <ol className="mt-4 divide-y divide-slate-200">
            {changes.map((change) => (
              <li className="py-3" key={change.id}>
                <p className="font-semibold wrap-anywhere">{change.product.name}</p>
                <p className="mt-1 text-sm text-slate-700">
                  {copFormatter.format(change.oldPriceCOP)} → {copFormatter.format(change.newPriceCOP)} por {change.product.unit}
                </p>
                <p className="mt-1 text-sm text-slate-600">{dateFormatter.format(change.appliedAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="official-context" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold" id="official-context">Noticias y fuentes oficiales</h2>
        <p className="mt-2 text-sm text-slate-700">
          Enlaces atribuidos para consulta manual. No se copian datos ni se automatiza su actualización.
        </p>
        <ul className="mt-3 space-y-3">
          <li>
            <a className="font-semibold text-emerald-900 underline" href="https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas" rel="noreferrer" target="_blank">
              DANE - Precios mayoristas SIPSA
            </a>
            <p className="text-sm text-slate-700">Observaciones mayoristas; verificar producto, mercado, unidad y fecha antes de compararlas.</p>
          </li>
          <li>
            <a className="font-semibold text-emerald-900 underline" href="https://upra.gov.co/" rel="noreferrer" target="_blank">
              UPRA - Contexto de producción
            </a>
            <p className="text-sm text-slate-700">Consultar evaluación agropecuaria y contexto oficial sin convertirlo automáticamente en un precio de venta.</p>
          </li>
          <li>
            <a className="font-semibold text-emerald-900 underline" href="https://www.agronet.gov.co/" rel="noreferrer" target="_blank">
              Agronet - Información oficial y enlaces
            </a>
            <p className="text-sm text-slate-700">Usar solo como fuente atribuida y enlace de consulta; no reproducir contenido protegido.</p>
          </li>
        </ul>
      </section>
    </main>
  );
}
