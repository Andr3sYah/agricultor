"use client";

import { useState, type FormEvent } from "react";
import { LoadingIndicator } from "@/components/loading-indicator";
import { authClient } from "@/lib/auth-client";

export function ResendVerificationForm({ callbackURL, initialEmail = "" }: { callbackURL: string; initialEmail?: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const result = await authClient.sendVerificationEmail({
        email: String(data.get("email") ?? "").trim(),
        callbackURL,
      });
      setMessage(result.error
        ? "No pudimos solicitar otro enlace. Espera un minuto e inténtalo de nuevo."
        : "Si la cuenta espera confirmación, te llegará un enlace. Revisa correo no deseado.");
    } catch {
      setMessage("No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} aria-busy={pending} className="space-y-3">
      <label className="block text-sm font-medium">
        Correo para reenviar la confirmación
        <input className="mt-2 min-h-12 w-full rounded-xl border border-control-border bg-surface-muted px-4 text-slate-950 hover:border-slate-700 focus-visible:border-primary" autoComplete="email" defaultValue={initialEmail} name="email" required type="email" />
      </label>
      <button className="min-h-12 w-full rounded-xl border border-control-border bg-surface px-4 font-semibold text-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-700" disabled={pending} type="submit">
        {pending ? <LoadingIndicator label="Solicitando enlace…" /> : "Reenviar enlace de confirmación"}
      </button>
      {message && <p className="text-sm text-slate-700" role="status">{message}</p>}
    </form>
  );
}
