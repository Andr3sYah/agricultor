type PasswordResetEmail = {
  email: string;
  name: string;
  url: string;
};

type ProblemReportEmail = {
  title: string;
  description: string;
};

type BrevoEmailDependencies = {
  apiKey?: string;
  senderEmail?: string;
  fetcher?: typeof fetch;
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getBrevoApiUrl(): string {
  const testApiUrl = process.env.BREVO_TEST_API_URL;
  if (!testApiUrl) {
    return BREVO_API_URL;
  }

  try {
    const databaseUrl = new URL(process.env.TEST_DATABASE_URL ?? "");
    const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
    const apiUrl = new URL(testApiUrl);

    if (
      !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
      !LOCAL_HOSTS.has(databaseUrl.hostname) ||
      !/^agricultor_test(?:_|$)/.test(databaseName) ||
      apiUrl.protocol !== "http:" ||
      !LOCAL_HOSTS.has(apiUrl.hostname) ||
      apiUrl.username ||
      apiUrl.password ||
      apiUrl.pathname !== "/v3/smtp/email" ||
      apiUrl.search
    ) {
      throw new Error();
    }

    return apiUrl.toString();
  } catch {
    throw new Error(
      "BREVO_TEST_API_URL solo se permite con un TEST_DATABASE_URL local y desechable.",
    );
  }
}

async function sendAccountEmail(
  { email, name, url }: PasswordResetEmail,
  dependencies: BrevoEmailDependencies,
  purpose: "reset" | "verify",
): Promise<void> {
  const apiKey = dependencies.apiKey ?? process.env.API_KEY_BREVO;
  const senderEmail = dependencies.senderEmail ?? process.env.BREVO_SENDER_EMAIL;

  if (!apiKey) {
    throw new Error("API_KEY_BREVO debe estar configurada para enviar correos.");
  }
  if (!senderEmail) {
    throw new Error(
      "BREVO_SENDER_EMAIL debe estar configurada para enviar correos.",
    );
  }

  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  const verify = purpose === "verify";
  const subject = verify ? "Confirma tu correo en Agricultor" : "Recupera tu contraseña de Agricultor";
  const intro = verify
    ? "Confirma tu correo para iniciar sesión en Agricultor. Usa este enlace dentro de una hora:"
    : "Recibimos una solicitud para cambiar la contraseña de tu cuenta de Agricultor. Usa este enlace dentro de una hora:";
  const action = verify ? "Confirmar correo" : "Cambiar contraseña";
  const closing = verify ? "Si no creaste esta cuenta, puedes ignorar este mensaje." : "Si no solicitaste este cambio, puedes ignorar este mensaje.";
  const response = await (dependencies.fetcher ?? fetch)(
    getBrevoApiUrl(),
    {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        sender: { email: senderEmail, name: "Agricultor" },
        to: [{ email }],
        subject,
        htmlContent: `<p>Hola ${safeName},</p><p>${intro}</p><p><a href="${safeUrl}">${action}</a></p><p>${closing}</p>`,
        textContent: `Hola ${name},\n\n${intro}\n${url}\n\n${closing}`,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Brevo rechazó el correo de ${verify ? "confirmación" : "recuperación"} (HTTP ${response.status}).`);
  }
}

export function sendPasswordResetEmail(email: PasswordResetEmail, dependencies: BrevoEmailDependencies = {}) {
  return sendAccountEmail(email, dependencies, "reset");
}

export function sendVerificationEmail(email: PasswordResetEmail, dependencies: BrevoEmailDependencies = {}) {
  return sendAccountEmail(email, dependencies, "verify");
}

export async function sendProblemReportEmail(
  report: ProblemReportEmail,
  dependencies: BrevoEmailDependencies = {},
): Promise<void> {
  const apiKey = dependencies.apiKey ?? process.env.API_KEY_BREVO;
  const senderEmail = dependencies.senderEmail ?? process.env.BREVO_SENDER_EMAIL;

  if (!apiKey) {
    throw new Error("API_KEY_BREVO debe estar configurada para enviar correos.");
  }
  if (!senderEmail) {
    throw new Error(
      "BREVO_SENDER_EMAIL debe estar configurada para enviar correos.",
    );
  }

  const subject = report.title.replace(/[\r\n]+/g, " ").trim();
  const safeTitle = escapeHtml(report.title);
  const safeDescription = escapeHtml(report.description).replace(/\n/g, "<br>");
  const response = await (dependencies.fetcher ?? fetch)(getBrevoApiUrl(), {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      sender: { email: senderEmail, name: "Agricultor" },
      to: [{ email: "andresdario.2001@gmail.com" }],
      subject: `[Agricultor] Reporte: ${subject}`,
      htmlContent: `<h1>${safeTitle}</h1><p>${safeDescription}</p>`,
      textContent: `${report.title}\n\n${report.description}`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Brevo rechazó el reporte de problema (HTTP ${response.status}).`,
    );
  }
}
