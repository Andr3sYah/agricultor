type ProblemReport = {
  title: string;
  description: string;
};

type ProblemReportDependencies = {
  sendEmail: (report: ProblemReport) => Promise<void>;
  allowRequest?: (request: Request) => { allowed: boolean; retryAfter?: number };
};

type RateLimiterOptions = {
  now?: () => number;
  maxRequests?: number;
  windowMs?: number;
};

const MAX_BODY_BYTES = 20_000;
const REPORT_WINDOW_MS = 10 * 60 * 1_000;
const REPORT_LIMIT = 3;

export function createProblemReportRateLimiter({
  now = Date.now,
  maxRequests = REPORT_LIMIT,
  windowMs = REPORT_WINDOW_MS,
}: RateLimiterOptions = {}) {
  const requestsByClient = new Map<string, number[]>();

  return (request: Request): { allowed: boolean; retryAfter?: number } => {
    const clientId =
      request.headers.get("x-real-ip")?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const currentTime = now();
    const recentRequests = (requestsByClient.get(clientId) ?? []).filter(
      (timestamp) => currentTime - timestamp < windowMs,
    );
    if (recentRequests.length >= maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.ceil((recentRequests[0] + windowMs - currentTime) / 1_000),
        ),
      };
    }

    if (!requestsByClient.has(clientId) && requestsByClient.size >= 5_000) {
      const oldestClient = requestsByClient.keys().next().value;
      if (oldestClient) {
        requestsByClient.delete(oldestClient);
      }
    }
    requestsByClient.set(clientId, [...recentRequests, currentTime]);
    return { allowed: true };
  };
}

const allowProblemReport = createProblemReportRateLimiter();

async function readBoundedBody(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function jsonResponse(
  body: object,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...Object.fromEntries(new Headers(headers)) },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function validateReport(value: unknown):
  | { ok: true; report: ProblemReport; website: string }
  | { ok: false; fieldErrors: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      fieldErrors: { form: "Revisa los datos e inténtalo de nuevo." },
    };
  }

  const data = value as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const website = typeof data.website === "string" ? data.website.trim() : "";
  const fieldErrors: Record<string, string> = {};

  if (title.length < 5 || title.length > 120) {
    fieldErrors.title = "Escribe un título de entre 5 y 120 caracteres.";
  }
  if (description.length < 20 || description.length > 4_000) {
    fieldErrors.description =
      "Cuéntanos qué pasó en al menos 20 caracteres (máximo 4.000).";
  }

  if (Object.keys(fieldErrors).length) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, report: { title, description }, website };
}

export async function handleProblemReport(
  request: Request,
  { sendEmail, allowRequest = allowProblemReport }: ProblemReportDependencies,
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return jsonResponse({ message: "Solicitud no válida." }, 403);
  }

  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return jsonResponse({ message: "Formato de solicitud no válido." }, 415);
  }

  const body = await readBoundedBody(request);
  if (body === null) {
    return jsonResponse({ message: "El reporte es demasiado largo." }, 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return jsonResponse({ message: "No pudimos leer el reporte." }, 400);
  }

  const validation = validateReport(value);
  if (!validation.ok) {
    return jsonResponse(
      {
        message: "Revisa la información marcada e inténtalo de nuevo.",
        fieldErrors: validation.fieldErrors,
      },
      400,
    );
  }

  if (validation.website) {
    return jsonResponse({ ok: true });
  }

  const rateLimit = allowRequest(request);
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        message: "Ya recibimos varios reportes desde tu conexión. Inténtalo más tarde.",
      },
      429,
      rateLimit.retryAfter
        ? { "retry-after": String(rateLimit.retryAfter) }
        : undefined,
    );
  }

  try {
    await sendEmail(validation.report);
  } catch {
    console.error("No se pudo enviar un reporte de problema de Agricultor.");
    return jsonResponse(
      {
        message:
          "No pudimos enviar tu reporte en este momento. Inténtalo de nuevo más tarde.",
      },
      503,
    );
  }

  return jsonResponse({ ok: true });
}
