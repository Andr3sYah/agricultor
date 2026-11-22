import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface-muted text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-9">
        <p className="text-sm">Agricultor · Conectando el campo y el mercado</p>
        <Link
          className="inline-flex min-h-11 items-center font-bold text-primary underline decoration-primary underline-offset-4 hover:text-primary-hover"
          href="/reportar-problema"
        >
          Reportar un problema
        </Link>
      </div>
    </footer>
  );
}
