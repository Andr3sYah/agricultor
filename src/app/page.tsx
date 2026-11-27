import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCurrentSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Agricultor | Productos del campo",
  description: "Compra y vende productos del campo en Colombia.",
};

export default async function Home() {
  const session = await getCurrentSession();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-5 pb-12 sm:px-9 sm:pb-16">
        <SiteHeader authenticated={Boolean(session)} />

        <section aria-labelledby="welcome-title" className="grid items-center gap-9 py-9 sm:py-14 lg:grid-cols-[0.94fr_1.06fr] lg:gap-14 lg:py-16">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-surface-accent px-3.5 py-2 text-xs font-bold uppercase tracking-[0.13em] text-primary sm:text-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              Del campo colombiano
            </p>
            <h1 id="welcome-title" className="mt-5 max-w-2xl text-balance font-serif text-[clamp(2.7rem,6vw,5.2rem)] leading-[0.98] font-bold tracking-[-0.045em]">
              El campo, más cerca.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-foreground/80 sm:text-xl">
              Encuentra productos del campo colombiano, compara precios y consulta cantidades sin registrarte.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                className="inline-flex min-h-13 items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-14"
                href="/catalogo"
              >
                Explorar el catálogo
              </Link>
              {!session && (
                <Link
                  className="inline-flex min-h-13 items-center justify-center rounded-xl border border-control-border bg-surface px-6 py-3 font-bold text-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-14"
                  href="/crear-cuenta"
                >
                  Crear cuenta
                </Link>
              )}
            </div>
            <ul className="mt-8 grid gap-3 border-t border-border/80 pt-6 text-sm sm:grid-cols-2 sm:gap-x-5">
              <li className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-surface-accent text-xs font-bold text-primary">✓</span>
                <span>Ofertas publicadas en un solo lugar</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-surface-accent text-xs font-bold text-primary">✓</span>
                <span>Precios y cantidades fáciles de consultar</span>
              </li>
            </ul>
          </div>

          <figure className="relative">
            <div aria-hidden="true" className="absolute -inset-2 -rotate-2 rounded-[2rem] bg-[#e8d7b6]/70 sm:-inset-3" />
            <Image
              alt="Dos vendedoras atienden un puesto de frutas y verduras en la plaza de mercado."
              className="relative aspect-[4/3] w-full rounded-[1.6rem] border-4 border-surface bg-surface-muted object-cover object-[50%_28%] shadow-lg sm:rounded-[1.8rem] sm:border-[6px]"
              preload
              sizes="(min-width: 1280px) 590px, (min-width: 1024px) 48vw, 100vw"
              src="/mercado-potrerillo.webp"
            />
            <figcaption className="relative mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 px-1 text-xs text-foreground/70 sm:text-sm">
              <span className="font-semibold text-foreground/85">Mercado El Potrerillo · Pasto, Nariño</span>
              <span className="flex flex-wrap gap-x-1">
                Foto <a className="inline-flex min-h-6 min-w-6 items-center justify-center underline underline-offset-2" href="https://commons.wikimedia.org/wiki/File:El_Potrerillo,_frutas_y_verduras.jpg">Υ.Γ.</a>
                {" · "}
                <a className="inline-flex min-h-6 min-w-6 items-center justify-center underline underline-offset-2" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
                {" · recorte"}
              </span>
            </figcaption>
          </figure>
        </section>

        <section aria-label="Cómo te ayuda Agricultor" className="grid gap-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:grid-cols-3 sm:gap-0 sm:p-2">
          <div className="flex items-center gap-3 p-2 sm:px-5 sm:py-4">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-accent text-primary">
              <svg fill="none" height="22" viewBox="0 0 24 24" width="22"><path d="M4 19.5h16M6.5 16V9.5L12 5l5.5 4.5V16M9.5 16v-3.5h5V16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
            </span>
            <div><h2 className="font-bold">Compra y venta</h2><p className="mt-0.5 text-sm text-foreground/70">Para quienes producen y buscan.</p></div>
          </div>
          <div className="flex items-center gap-3 border-t border-border p-2 sm:border-t-0 sm:border-l sm:px-5 sm:py-4">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f7eee3] text-[#915326]">
              <svg fill="none" height="22" viewBox="0 0 24 24" width="22"><path d="M4 7h16M6 4.5h12A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5ZM8 11h3m-3 3h8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
            </span>
            <div><h2 className="font-bold">Información clara</h2><p className="mt-0.5 text-sm text-foreground/70">Precios, cantidades y ubicación.</p></div>
          </div>
          <div className="flex items-center gap-3 border-t border-border p-2 sm:border-t-0 sm:border-l sm:px-5 sm:py-4">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-accent text-primary">
              <svg fill="none" height="22" viewBox="0 0 24 24" width="22"><path d="M12 20s7-3.5 7-9V5.5L12 3 5 5.5V11c0 5.5 7 9 7 9Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /><path d="m9 11.5 2 2 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>
            </span>
            <div><h2 className="font-bold">Contacto con permiso</h2><p className="mt-0.5 text-sm text-foreground/70">Respetamos la privacidad del vendedor.</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}
