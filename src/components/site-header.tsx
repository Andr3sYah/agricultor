import Link from "next/link";

export function SiteHeader({
  authenticated,
}: {
  authenticated: boolean;
}) {
  return (
    <header className="flex min-h-20 items-center justify-between gap-4 border-b border-[#b7ab96]">
      <Link
        aria-label="Agricultor, inicio"
        className="font-serif text-3xl font-bold leading-none tracking-tight"
        href="/"
      >
        Agricultor
      </Link>
      <Link
        aria-label={authenticated ? "Ir a Mi cuenta" : undefined}
        className="inline-flex min-h-12 items-center px-2 text-right text-sm font-bold underline decoration-[#91612e] underline-offset-4 sm:text-base"
        href={authenticated ? "/mi-cuenta" : "/iniciar-sesion"}
      >
        {authenticated ? "Mi cuenta" : "Inicia sesión"}
      </Link>
    </header>
  );
}
