import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

export type EmailConfirmationNoticeState =
  | "anonymous"
  | "authenticated"
  | "error"
  | null;

export function getEmailConfirmationNoticeState(
  params: SearchParams,
  authenticated: boolean,
): EmailConfirmationNoticeState {
  if (params.correo !== "confirmado") {
    return null;
  }

  if (params.error) {
    return "error";
  }

  return authenticated ? "authenticated" : "anonymous";
}

export function EmailConfirmationNotice({
  state,
}: {
  state: EmailConfirmationNoticeState;
}) {
  if (state === "error") {
    return (
      <p
        className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-950"
        role="alert"
      >
        El enlace de confirmación venció o es inválido. Puedes pedir otro abajo.
      </p>
    );
  }

  if (!state) {
    return null;
  }

  return (
    <div
      className="mt-3 rounded-xl border border-emerald-300 bg-surface-accent p-3 text-emerald-950"
      role="status"
    >
      <p>
        {state === "authenticated"
          ? "Correo confirmado. Tu sesión está activa."
          : "Correo confirmado. Ya puedes iniciar sesión con tu correo y contraseña."}
      </p>
      {state === "authenticated" && (
        <Link
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline hover:text-primary-hover"
          href="/mi-cuenta"
        >
          Ir a mi cuenta
        </Link>
      )}
    </div>
  );
}
