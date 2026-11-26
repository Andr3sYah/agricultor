"use client";

export default function OrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8">
      <section
        aria-labelledby="orders-error-title"
        className="rounded-2xl border border-amber-300 bg-white p-5"
      >
        <h1 className="text-xl font-semibold" id="orders-error-title">
          No pudimos cargar tus pedidos
        </h1>
        <p className="mt-3 text-slate-700" role="alert">
          La operación no se confirmó ni se modificó desde esta pantalla. Revisa tu conexión e inténtalo de nuevo.
        </p>
        {error.digest && (
          <p className="mt-3 text-sm text-slate-600">
            Referencia técnica: {error.digest}
          </p>
        )}
        <button
          className="mt-5 min-h-12 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white"
          onClick={reset}
          type="button"
        >
          Intentar de nuevo
        </button>
      </section>
    </main>
  );
}
