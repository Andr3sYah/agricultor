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
    <main className="min-h-screen bg-[#f8f1e4] text-[#253528]">
      <div className="mx-auto max-w-7xl px-5 pb-8 sm:px-9">
        <SiteHeader authenticated={Boolean(session)} />

        <section aria-labelledby="welcome-title" className="grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-[1fr_1.04fr] lg:gap-14">
          <div>
            <h1 id="welcome-title" className="max-w-2xl text-balance font-serif text-[clamp(2.5rem,6vw,5.4rem)] leading-[0.98] font-bold tracking-[-0.04em]">
              Compra y vende productos del campo
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-[#414b3e]">
              Consulta precios y cantidades sin registrarte.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex min-h-12 items-center rounded-md bg-[#314b32] px-5 py-3 font-bold text-[#fff9e9] hover:bg-[#213623]"
                href="/catalogo"
              >
                Explorar el catálogo
              </Link>
              {!session && (
                <Link
                  className="inline-flex min-h-12 items-center rounded-md bg-[#edc574] px-5 py-3 font-bold text-[#322714] hover:bg-[#e4b65b]"
                  href="/crear-cuenta"
                >
                  Crear cuenta
                </Link>
              )}
            </div>
          </div>

          <figure>
            <Image
              alt="Dos vendedoras atienden un puesto de frutas y verduras en la plaza de mercado."
              className="aspect-[4/3] w-full bg-[#d5baa0] object-cover object-[50%_28%]"
              preload
              sizes="(min-width: 1280px) 590px, (min-width: 1024px) 48vw, 100vw"
              src="/mercado-potrerillo.webp"
            />
            <figcaption className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-[#514738]">
              <span>Mercado El Potrerillo · Pasto, Nariño</span>
              <span>
                Foto <a className="underline underline-offset-2" href="https://commons.wikimedia.org/wiki/File:El_Potrerillo,_frutas_y_verduras.jpg">Υ.Γ.</a>
                {" · "}
                <a className="underline underline-offset-2" href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>
                {" · recorte"}
              </span>
            </figcaption>
          </figure>
        </section>
      </div>
    </main>
  );
}
