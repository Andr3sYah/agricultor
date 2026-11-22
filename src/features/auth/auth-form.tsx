"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { LoadingIndicator } from "@/components/loading-indicator";
import { isInAppBrowser } from "./oauth-browser";
import { ResendVerificationForm } from "./resend-verification-form";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
  producerIntent?: boolean;
  redirectTo?: string | null;
  googleAuthEnabled?: boolean;
};

export function AuthForm({
  mode,
  producerIntent = false,
  redirectTo,
  googleAuthEnabled = false,
}: AuthFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<"email" | "google" | null>(
    null,
  );
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const isSignUp = mode === "sign-up";
  const postAuthDestination =
    redirectTo ?? (producerIntent ? "/mi-cuenta?intent=producer" : "/mi-cuenta");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPendingAction("email");
    setMessage("");

    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
            callbackURL: postAuthDestination,
          })
        : await authClient.signIn.email({
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
            callbackURL: postAuthDestination,
          });

      if (result.error) {
        if (!isSignUp && result.error.code === "EMAIL_NOT_VERIFIED") {
          setVerificationEmail(String(formData.get("email") ?? ""));
          setMessage("Confirma tu correo para iniciar sesión. Puedes pedir otro enlace.");
          return;
        }
        setMessage(
          isSignUp
            ? "No pudimos crear la cuenta. Revisa los datos o intenta iniciar sesión."
            : "No pudimos iniciar sesión con esos datos.",
        );
        return;
      }

      if (isSignUp) {
        setVerificationEmail(String(formData.get("email") ?? ""));
        setRegistrationComplete(true);
        return;
      }

      router.push(postAuthDestination);
      router.refresh();
    } catch {
      setMessage(
        "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function signInWithGoogle() {
    if (isInAppBrowser(window.navigator.userAgent)) {
      setMessage(
        "Google no permite iniciar sesión desde el navegador integrado de esta aplicación. Abre este sitio en Safari o Chrome y vuelve a intentarlo.",
      );
      return;
    }

    setPendingAction("google");
    setMessage("");

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: postAuthDestination,
      });

      if (result.error) {
        setMessage(
          "No pudimos iniciar sesión con Google. Comprueba que tu correo de Google esté confirmado o prueba otra opción de acceso.",
        );
      }
    } catch {
      setMessage(
        "No pudimos conectarnos con Google. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  const authPage = isSignUp ? "/iniciar-sesion" : "/crear-cuenta";
  const authQuery = new URLSearchParams();
  if (redirectTo) authQuery.set("redirectTo", redirectTo);
  if (producerIntent) authQuery.set("intent", "producer");
  const authQueryString = authQuery.toString();
  const authPageHref = authQueryString
    ? `${authPage}?${authQueryString}`
    : authPage;
  const signInQuery = new URLSearchParams();
  if (redirectTo) signInQuery.set("redirectTo", redirectTo);
  if (producerIntent) signInQuery.set("intent", "producer");
  const signInQueryString = signInQuery.toString();
  const signInHref = signInQueryString
    ? `/iniciar-sesion?${signInQueryString}`
    : "/iniciar-sesion";

  if (isSignUp && registrationComplete) {
    return (
      <section
        aria-labelledby="registration-success-title"
        className="mt-8 space-y-5 rounded-2xl border border-emerald-800/20 bg-emerald-50 p-5"
        role="status"
      >
        <div>
          <h2
            className="text-xl font-semibold text-emerald-950"
            id="registration-success-title"
          >
            Registro recibido
          </h2>
          <p className="mt-2 leading-7 text-slate-700">
            Si es una cuenta nueva, revisa tu bandeja de entrada y confirma el correo. Al abrir el enlace, iniciarás sesión automáticamente. Si ya tienes cuenta, usa el mismo método con el que la creaste o recupera tu contraseña.
          </p>
        </div>
        <ResendVerificationForm callbackURL={postAuthDestination} initialEmail={verificationEmail} />
        <Link
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 text-center font-semibold text-white hover:bg-emerald-900"
          href={signInHref}
        >
          {producerIntent
            ? "Iniciar sesión para vender"
            : "Ir a iniciar sesión"}
        </Link>
      </section>
    );
  }

  return (
    <>
    <form
      method="post" onSubmit={submit}
      className="mt-8 space-y-5"
      aria-describedby={message ? "auth-message" : undefined}
      aria-busy={Boolean(pendingAction)}
    >
      {isSignUp && (
        <div>
          <label className="block text-sm font-medium" htmlFor="name">
            Nombre
          </label>
          <input
            autoComplete="name"
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3"
            id="name"
            maxLength={100}
            minLength={2}
            name="name"
            required
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Correo electrónico
        </label>
        <input
          autoCapitalize="none"
          autoComplete="email"
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Contraseña
        </label>
        <input
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 py-3"
          id="password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          aria-describedby={isSignUp ? "password-hint" : undefined}
          type="password"
        />
        {isSignUp && (
          <p className="mt-2 text-sm text-slate-600" id="password-hint">
            Usa al menos 8 caracteres.
          </p>
        )}
      </div>
      {message && (
        <p className="text-sm text-red-800" id="auth-message" role="alert">
          {message}
        </p>
      )}
      <button
        aria-busy={pendingAction === "email"}
        className="min-h-12 w-full rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
        disabled={pendingAction !== null}
        type="submit"
      >
        {pendingAction === "email"
          ? <LoadingIndicator label={isSignUp ? "Creando cuenta…" : "Iniciando sesión…"} />
          : isSignUp
            ? "Crear cuenta"
            : "Iniciar sesión"}
      </button>
      {googleAuthEnabled ? (
        <button
          aria-label="Continuar con Google"
          aria-busy={pendingAction === "google"}
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          disabled={pendingAction !== null}
          onClick={signInWithGoogle}
          type="button"
        >
          {pendingAction === "google"
            ? <LoadingIndicator label="Conectando con Google…" />
            : "Continuar con Google"}
        </button>
      ) : (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700" role="status">
          El acceso con Google no está disponible por ahora. Puedes continuar con tu correo.
        </p>
      )}
      {!isSignUp && (
        <p className="text-sm leading-6 text-slate-700">
          Si creaste tu cuenta con Google y quieres entrar con contraseña, usa
          “¿Olvidaste tu contraseña?” para crear una de forma segura.
        </p>
      )}
      {!isSignUp && (
        <p className="text-center text-sm">
          <Link
            className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
            href="/recuperar-contrasena"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      )}
      <p className="text-center text-sm text-slate-700">
        {isSignUp ? "¿Ya tienes cuenta?" : "¿Primera vez por aquí?"}{" "}
        <Link
          className="inline-flex min-h-12 items-center font-semibold text-emerald-900 underline"
          href={authPageHref}
        >
          {isSignUp ? "Inicia sesión" : "Crea tu cuenta"}
        </Link>
      </p>
    </form>
    {!isSignUp && (
      <details className="mt-5 rounded-xl border border-slate-200 p-4" open={verificationEmail ? true : undefined}>
        <summary className="min-h-11 cursor-pointer font-semibold text-emerald-900">¿No te llegó el correo de confirmación?</summary>
        <ResendVerificationForm callbackURL={postAuthDestination} initialEmail={verificationEmail} key={verificationEmail} />
      </details>
    )}
    </>
  );
}
