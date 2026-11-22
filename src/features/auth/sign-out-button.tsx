"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  return (
    <div className="text-right">
      <button
        className="min-h-12 rounded-xl border border-control-border bg-surface px-4 py-3 font-semibold text-foreground underline underline-offset-4 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={async () => {
          setMessage("");
          try {
            const result = await authClient.signOut();
            if (result.error) {
              setMessage("No pudimos cerrar la sesión. Inténtalo de nuevo.");
              return;
            }
            router.push("/");
            router.refresh();
          } catch {
            setMessage("No pudimos conectarnos. Inténtalo de nuevo.");
          }
        }}
        type="button"
      >
        Cerrar sesión
      </button>
      {message && (
        <p className="mt-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
