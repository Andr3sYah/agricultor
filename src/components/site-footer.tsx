import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[#b7ab96] bg-[#f8f1e4] text-[#253528]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-9">
        <p className="text-sm">Agricultor · Conectando el campo y el mercado</p>
        <Link
          className="inline-flex min-h-11 items-center font-bold underline decoration-[#91612e] underline-offset-4"
          href="/reportar-problema"
        >
          Reportar un problema
        </Link>
      </div>
    </footer>
  );
}
