import { AuthForm } from "@/features/auth/auth-form";
import { getOrderRequestRedirect } from "@/features/auth/order-redirect";
import Link from "next/link";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = getOrderRequestRedirect(params.redirectTo);
  const producerIntent = params.intent === "producer";
  const googleAuthEnabled = Boolean(
    process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8 sm:px-6 sm:py-12">
      <section className="w-full rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-sm sm:p-10">
        <Link
          className="mb-5 inline-flex min-h-12 items-center font-semibold text-emerald-900 underline underline-offset-4"
          href="/"
        >
          Volver al inicio
        </Link>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Inicia sesión</h1>
        {params.correo === "confirmado" && (
          params.error ? (
            <p className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-950" role="alert">
              El enlace de confirmación venció o es inválido. Puedes pedir otro abajo.
            </p>
          ) : (
            <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-950" role="status">
              <p>Correo confirmado. Tu sesión se inició automáticamente.</p>
              <Link className="mt-2 inline-flex min-h-11 items-center font-semibold underline" href="/mi-cuenta">
                Ir a mi cuenta
              </Link>
            </div>
          )
        )}
        <p className="mt-3 leading-7 text-slate-700">
          Ingresa con el correo y la contraseña de tu cuenta.
        </p>
        <AuthForm
          mode="sign-in"
          googleAuthEnabled={googleAuthEnabled}
          producerIntent={producerIntent}
          redirectTo={redirectTo}
        />
      </section>
    </main>
  );
}
