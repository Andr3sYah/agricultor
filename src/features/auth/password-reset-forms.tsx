"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { LoadingIndicator } from "@/components/loading-indicator";

export function RequestPasswordResetForm({
  redirectTo,
  producerIntent,
}: {
  redirectTo: string | null;
  producerIntent: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const contextQuery = new URLSearchParams();
  if (redirectTo) contextQuery.set("redirectTo", redirectTo);
  if (producerIntent) contextQuery.set("intent", "producer");
  const contextQueryString = contextQuery.toString();
  const contextQuerySuffix = contextQueryString ? `?${contextQueryString}` : "";
  const resetPasswordURL = `/restablecer-contrasena${contextQuerySuffix}`;
  const signInHref = `/iniciar-sesion${contextQuerySuffix}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");

    try {
      const result = await authClient.requestPasswordReset({
        email: String(formData.get("email") ?? ""),
        redirectTo: resetPasswordURL,
      });

      if (result.error) {
        setMessage(
          "No pudimos procesar la solicitud. Inténtalo de nuevo más tarde.",
        );
        return;
      }

      setMessage(
        "Si existe una cuenta con ese correo, recibirás un enlace. Revisa correo no deseado y vuelve a solicitarlo si no llega.",
      );
    } catch {
      setMessage(
        "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} aria-busy={pending} className="mt-8 space-y-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Correo electrónico
        </label>
        <input
          autoCapitalize="none"
          autoComplete="email"
          className="mt-2 min-h-12 w-full rounded-xl border border-control-border bg-surface-muted px-4 py-3 text-slate-950 hover:border-slate-700 focus-visible:border-primary"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      {message && (
        <p
          className="rounded-xl border border-slate-300 bg-surface-muted p-3 text-sm text-slate-800"
          role="status"
        >
          {message}
        </p>
      )}
      <button
        className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-slate-500"
        disabled={pending}
        type="submit"
      >
        {pending ? <LoadingIndicator label="Solicitando enlace…" /> : message ? "Solicitar otro enlace" : "Enviar instrucciones"}
      </button>
      <p className="text-center text-sm text-slate-700">
        <Link
          className="inline-flex min-h-12 items-center font-semibold text-primary underline hover:text-primary-hover"
          href={signInHref}
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({
  token,
  redirectTo,
  producerIntent,
}: {
  token: string;
  redirectTo: string | null;
  producerIntent: boolean;
}) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const contextQuery = new URLSearchParams();
  if (redirectTo) contextQuery.set("redirectTo", redirectTo);
  if (producerIntent) contextQuery.set("intent", "producer");
  const contextQueryString = contextQuery.toString();
  const contextQuerySuffix = contextQueryString ? `?${contextQueryString}` : "";
  const signInHref = `/iniciar-sesion${contextQuerySuffix}`;
  const recoveryHref = `/recuperar-contrasena${contextQuerySuffix}`;

  useEffect(() => {
    if (token) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    }
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    if (password !== confirmation) {
      setPasswordMismatch(true);
      setMessage("");
      setSuccess(false);
      return;
    }
    setPasswordMismatch(false);
    if (!token) {
      setMessage("El enlace no es válido. Solicita uno nuevo.");
      setSuccess(false);
      return;
    }

    setPending(true);
    setMessage("");

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        setMessage("El enlace venció o no es válido. Solicita uno nuevo.");
        return;
      }

      setMessage("Tu contraseña se actualizó. Ya puedes iniciar sesión.");
      setSuccess(true);
    } catch {
      setMessage(
        "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="mt-8 space-y-5">
        <p className="text-sm text-red-800" role="alert">
          Este enlace no es válido o está incompleto. Solicita uno nuevo.
        </p>
        <Link
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href={recoveryHref}
        >
          Solicitar otro enlace
        </Link>
        <p className="text-center text-sm text-slate-700">
          <Link
            className="inline-flex min-h-12 items-center font-semibold text-primary underline hover:text-primary-hover"
            href={signInHref}
          >
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={submit} aria-busy={pending} className="mt-8 space-y-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Nueva contraseña
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 min-h-12 w-full rounded-xl border border-control-border bg-surface-muted px-4 py-3 text-slate-950 hover:border-slate-700 focus-visible:border-primary aria-[invalid=true]:border-rose-700"
          id="password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          aria-describedby={
            passwordMismatch
              ? "reset-password-hint password-mismatch"
              : "reset-password-hint"
          }
          aria-invalid={passwordMismatch}
          onChange={() => {
            setPasswordMismatch(false);
            setMessage("");
          }}
          type="password"
        />
        <p className="mt-2 text-sm text-slate-600" id="reset-password-hint">
          Usa al menos 8 caracteres.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="confirmation">
          Confirma la nueva contraseña
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 min-h-12 w-full rounded-xl border border-control-border bg-surface-muted px-4 py-3 text-slate-950 hover:border-slate-700 focus-visible:border-primary aria-[invalid=true]:border-rose-700"
          id="confirmation"
          maxLength={128}
          minLength={8}
          name="confirmation"
          required
          aria-describedby={
            passwordMismatch
              ? "reset-password-hint password-mismatch"
              : "reset-password-hint"
          }
          aria-invalid={passwordMismatch}
          onChange={() => {
            setPasswordMismatch(false);
            setMessage("");
          }}
          type="password"
        />
      </div>
      {passwordMismatch && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950" id="password-mismatch" role="alert">
          Las contraseñas no coinciden.
        </p>
      )}
      {message && (
        <p
          className={success ? "rounded-xl border border-emerald-300 bg-surface-accent p-3 text-sm text-emerald-950" : "rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950"}
          role={success ? "status" : "alert"}
        >
          {message}
        </p>
      )}
      {success ? (
        <Link
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href="/iniciar-sesion"
        >
          Iniciar sesión
        </Link>
      ) : (
        <button
          className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-slate-500"
          disabled={pending}
          type="submit"
        >
          {pending ? <LoadingIndicator label="Guardando contraseña…" /> : "Guardar contraseña"}
        </button>
      )}
      {!success && (
        <p className="text-center text-sm text-slate-700">
          <Link
            className="inline-flex min-h-12 items-center font-semibold text-primary underline hover:text-primary-hover"
            href={recoveryHref}
          >
            Solicitar otro enlace
          </Link>
        </p>
      )}
    </form>
  );
}
