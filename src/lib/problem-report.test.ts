import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendProblemReportEmail } from "./email/brevo";
import {
  createProblemReportRateLimiter,
  handleProblemReport,
} from "./problem-report";

const validReport = {
  title: "No puedo publicar el producto",
  description:
    "Cuando intento publicar el producto, aparece un mensaje de error y no puedo continuar.",
};

function createRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://agricultor.example.test/api/reportar-problema", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Problem report endpoint", () => {
  it("sends a valid report without requiring account or database access", async () => {
    const sentReports: unknown[] = [];
    const response = await handleProblemReport(createRequest(validReport), {
      sendEmail: async (report) => {
        sentReports.push(report);
      },
      allowRequest: () => ({ allowed: true }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(sentReports, [validReport]);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("validates title and description before sending", async () => {
    const response = await handleProblemReport(
      createRequest({ title: "Bug", description: "No funciona." }),
      {
        sendEmail: async () => {
          assert.fail("Invalid reports must not be sent.");
        },
        allowRequest: () => ({ allowed: true }),
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(
      (await response.json() as { fieldErrors: Record<string, string> }).fieldErrors,
      {
        title: "Escribe un título de entre 5 y 120 caracteres.",
        description:
          "Cuéntanos qué pasó en al menos 20 caracteres (máximo 4.000).",
      },
    );
  });

  it("silently discards honeypot submissions", async () => {
    let sent = false;
    const response = await handleProblemReport(
      createRequest({ ...validReport, website: "spam.example" }),
      {
        sendEmail: async () => {
          sent = true;
        },
        allowRequest: () => ({ allowed: true }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(sent, false);
  });

  it("rejects cross-origin and oversized requests", async () => {
    const dependencies = {
      sendEmail: async () => assert.fail("Request must not send."),
      allowRequest: () => ({ allowed: true }),
    };
    const crossOrigin = await handleProblemReport(
      createRequest(validReport, { origin: "https://evil.example" }),
      dependencies,
    );
    const oversized = await handleProblemReport(
      createRequest({
        ...validReport,
        description: "x".repeat(21_000),
      }),
      dependencies,
    );

    assert.equal(crossOrigin.status, 403);
    assert.equal(oversized.status, 413);
  });

  it("returns a retry delay when the client exceeds the request limit", async () => {
    const limited = await handleProblemReport(createRequest(validReport), {
      sendEmail: async () => assert.fail("Rate-limited reports must not send."),
      allowRequest: () => ({ allowed: false, retryAfter: 120 }),
    });

    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "120");
  });

  it("reports delivery failures without exposing provider details", async () => {
    const response = await handleProblemReport(createRequest(validReport), {
      sendEmail: async () => {
        throw new Error("sensitive provider response");
      },
      allowRequest: () => ({ allowed: true }),
    });

    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /sensitive provider response/);
  });
});

describe("Problem report rate limiter", () => {
  it("limits each client and allows a new window after expiration", () => {
    let currentTime = 0;
    const allow = createProblemReportRateLimiter({
      now: () => currentTime,
      maxRequests: 2,
      windowMs: 60_000,
    });
    const request = createRequest(validReport, { "x-real-ip": "192.0.2.1" });

    assert.deepEqual(allow(request), { allowed: true });
    assert.deepEqual(allow(request), { allowed: true });
    assert.deepEqual(allow(request), { allowed: false, retryAfter: 60 });
    assert.deepEqual(
      allow(createRequest(validReport, { "x-real-ip": "192.0.2.2" })),
      { allowed: true },
    );
    currentTime = 60_001;
    assert.deepEqual(allow(request), { allowed: true });
  });
});

describe("Brevo problem report email", () => {
  it("sends the report to the configured mailbox and escapes HTML", async () => {
    let request: RequestInit | undefined;

    await sendProblemReportEmail(
      {
        title: "Error <script>alert(1)</script>",
        description: "No carga <img src=x>\nSigue sin funcionar.",
      },
      {
        apiKey: "test-api-key",
        senderEmail: "no-reply@example.test",
        fetcher: async (_url, init) => {
          request = init;
          return new Response(null, { status: 201 });
        },
      },
    );

    const body = JSON.parse(String(request?.body)) as {
      to: { email: string }[];
      subject: string;
      htmlContent: string;
      textContent: string;
    };
    assert.deepEqual(body.to, [{ email: "andresdario.2001@gmail.com" }]);
    assert.equal(body.subject, "[Agricultor] Reporte: Error <script>alert(1)</script>");
    assert.match(body.htmlContent, /&lt;script&gt;/);
    assert.doesNotMatch(body.htmlContent, /<script>/);
    assert.match(body.htmlContent, /&lt;img src=x&gt;<br>/);
    assert.match(body.textContent, /No carga <img src=x>/);
  });
});
