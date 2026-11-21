import type { Metadata } from "next";
import Link from "next/link";
import { ProblemReportForm } from "@/features/problem-report/problem-report-form";

export const metadata: Metadata = {
  title: "Reportar un problema | Agricultor",
  description: "Cuéntanos si encontraste un error o tienes un problema en Agricultor.",
};

export default function ReportProblemPage() {
  return (
    <main className="min-h-screen flex-1 bg-[#f8f1e4] px-5 py-8 text-[#253528] sm:px-9 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          className="font-semibold underline decoration-[#91612e] underline-offset-4"
          href="/"
        >
          Volver al inicio
        </Link>
        <section
          aria-labelledby="report-problem-title"
          className="mt-6 rounded-2xl border border-[#d6cab4] bg-white/80 p-5 shadow-sm sm:p-8"
        >
          <h1
            className="font-serif text-3xl font-bold tracking-tight sm:text-4xl"
            id="report-problem-title"
          >
            Reportar un problema
          </h1>
          <p className="mt-3 leading-relaxed text-slate-700">
            ¿Algo no funciona como esperabas? Cuéntanos y nos ayudará a mejorar
            Agricultor.
          </p>
          <ProblemReportForm />
        </section>
      </div>
    </main>
  );
}
