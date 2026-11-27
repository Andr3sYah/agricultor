import Link from "next/link";

export function SiteHeader({
  authenticated,
}: {
  authenticated: boolean;
}) {
  return (
    <header className="flex min-h-20 items-center justify-between gap-3 border-b border-border/80 sm:gap-6">
      <Link
        aria-label="Agricultor, inicio"
        className="inline-flex min-h-14 items-center gap-3 rounded-xl text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        href="/"
      >
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-sm">
          <svg fill="none" height="23" viewBox="0 0 24 24" width="23">
            <path d="M19.5 4.5c-7.2.1-12 2.4-12 7.1a4.2 4.2 0 0 0 4.2 4.2c4.8 0 7.2-4.8 7.8-11.3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            <path d="M4.5 20c2.4-5.3 5.3-7.7 10.1-10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="block font-serif text-2xl font-bold tracking-tight sm:text-[1.7rem]">Agricultor</span>
          <span className="mt-0.5 hidden text-[0.68rem] font-semibold tracking-[0.12em] text-foreground/65 sm:block">CAMPO COLOMBIANO</span>
        </span>
      </Link>
      <nav aria-label="Navegación principal" className="flex items-center gap-1 sm:gap-3">
        <Link
          className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-bold text-foreground transition-colors hover:bg-surface-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:inline-flex sm:px-4 sm:text-base"
          href="/catalogo"
        >
          Catálogo
        </Link>
        <Link
          className="inline-flex min-h-11 items-center rounded-xl border border-primary/30 px-3 text-sm font-bold text-primary transition-colors hover:bg-surface-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-12 sm:px-5 sm:text-base"
          href={authenticated ? "/mi-cuenta" : "/iniciar-sesion"}
        >
          {authenticated ? "Inicio" : "Inicia sesión"}
        </Link>
      </nav>
    </header>
  );
}
