import { AuthForm } from "@/features/auth/auth-form";
import {
  EmailConfirmationNotice,
  getEmailConfirmationNoticeState,
} from "@/features/auth/email-confirmation-notice";
import { getOrderRequestRedirect } from "@/features/auth/order-redirect";
import { getCurrentSession } from "@/lib/auth/server";
import Link from "next/link";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const redirectTo = getOrderRequestRedirect(params.redirectTo);
  const producerIntent = params.intent === "producer";
  const isSuccessfulConfirmation =
    params.correo === "confirmado" && !params.error;
  const session = isSuccessfulConfirmation ? await getCurrentSession() : null;
  const confirmationState = getEmailConfirmationNoticeState(
    params,
    Boolean(session),
  );
  const googleAuthEnabled = Boolean(
    process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8 sm:px-6 sm:py-12">
      <section className="w-full rounded-3xl border border-border bg-surface p-6 shadow-lg shadow-slate-900/5 sm:p-10">
        <Link
          className="mb-5 inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
          href="/"
        >
          Volver al inicio
        </Link>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Agricultor
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Inicia sesión</h1>
        <EmailConfirmationNotice state={confirmationState} />
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
