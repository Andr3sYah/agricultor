"use client";

import { useState, type FormEvent } from "react";

type ReportFormResult = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export function ProblemReportForm() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ReportFormResult>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setResult({});

    try {
      const response = await fetch("/api/reportar-problema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          description: data.get("description"),
          website: data.get("website"),
        }),
      });
      const responseBody = (await response.json()) as ReportFormResult;

      if (!response.ok) {
        setResult(responseBody);
        return;
      }

      form.reset();
      setResult({
        ok: true,
        message: "¡Gracias! Recibimos tu reporte y lo revisaremos pronto.",
      });
    } catch {
      setResult({
        message: "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      aria-busy={pending}
      className="mt-7 space-y-5"
      method="post"
      onSubmit={submit}
    >
      <div>
        <label className="block font-semibold" htmlFor="problem-title">
          Título del problema
        </label>
        <p className="mt-1 text-sm text-slate-600" id="problem-title-help">
          Resume lo que ocurrió. Por ejemplo: «No puedo publicar mi producto».
        </p>
        <input
          aria-describedby={
            result.fieldErrors?.title
              ? "problem-title-help problem-title-error"
              : "problem-title-help"
          }
          aria-invalid={Boolean(result.fieldErrors?.title)}
          autoComplete="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          id="problem-title"
          maxLength={120}
          minLength={5}
          name="title"
          required
          type="text"
        />
        {result.fieldErrors?.title && (
          <p className="mt-1 text-sm text-red-800" id="problem-title-error" role="alert">
            {result.fieldErrors.title}
          </p>
        )}
      </div>

      <div>
        <label className="block font-semibold" htmlFor="problem-description">
          Cuéntanos qué pasó
        </label>
        <p className="mt-1 text-sm text-slate-600" id="problem-description-help">
          Si puedes, dinos qué estabas haciendo y qué esperabas que ocurriera.
        </p>
        <textarea
          aria-describedby={
            result.fieldErrors?.description
              ? "problem-description-help problem-description-error"
              : "problem-description-help"
          }
          aria-invalid={Boolean(result.fieldErrors?.description)}
          className="mt-2 min-h-36 w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
          id="problem-description"
          maxLength={4000}
          minLength={20}
          name="description"
          required
          rows={6}
        />
        {result.fieldErrors?.description && (
          <p className="mt-1 text-sm text-red-800" id="problem-description-error" role="alert">
            {result.fieldErrors.description}
          </p>
        )}
      </div>

      <div
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px overflow-hidden"
      >
        <label htmlFor="problem-website">Deja este campo vacío</label>
        <input
          autoComplete="off"
          id="problem-website"
          name="website"
          tabIndex={-1}
          type="text"
        />
      </div>

      <p className="text-sm text-slate-600">
        No necesitas una cuenta. No incluyas contraseñas ni datos bancarios.
      </p>
      {result.message && (
        <p
          className={result.ok ? "text-emerald-900" : "text-red-800"}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      )}
      <button
        className="min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 sm:w-auto"
        disabled={pending}
        type="submit"
      >
        {pending ? "Enviando reporte…" : "Enviar reporte"}
      </button>
    </form>
  );
}
