import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BrevoConfigurationError,
  sendOrderNotificationEmail,
  sendPasswordResetEmail,
} from "./brevo";

describe("Brevo password reset email", () => {
  it("sends a reset link through the injected local stub", async () => {
    let requestUrl = "";
    let request: RequestInit | undefined;

    await sendPasswordResetEmail(
      {
        email: "ana@example.test",
        name: 'Ana <script>alert("x")</script>',
        url: "https://agricultor.example.test/restablecer-contrasena?token=test-token",
      },
      {
        apiKey: "test-api-key",
        senderEmail: "no-reply@example.test",
        fetcher: async (url, init) => {
          requestUrl = String(url);
          request = init;
          return new Response(null, { status: 201 });
        },
      },
    );

    assert.equal(requestUrl, "https://api.brevo.com/v3/smtp/email");
    assert.equal(request?.method, "POST");
    assert.equal(
      new Headers(request?.headers).get("api-key"),
      "test-api-key",
    );
    const body = JSON.parse(String(request?.body)) as {
      sender: { email: string };
      to: { email: string }[];
      htmlContent: string;
      textContent: string;
    };
    assert.equal(body.sender.email, "no-reply@example.test");
    assert.deepEqual(body.to, [{ email: "ana@example.test" }]);
    assert.match(body.htmlContent, /Ana &lt;script&gt;/);
    assert.doesNotMatch(body.htmlContent, /<script>/);
    assert.match(body.textContent, /test-token/);
  });

  describe("Brevo order notification email", () => {
    it("sends a Spanish, escaped order notice through the injected stub", async () => {
      let request: RequestInit | undefined;
      await sendOrderNotificationEmail(
        {
          email: "vendedor@example.test",
          name: "Samanta",
          productName: "Papa <script>",
          quantity: "5",
          unit: "KG",
          priceCOP: 1200,
          orderUrl: "https://agricultor.example.test/mi-cuenta/pedidos#recibida-test",
          event: "REQUEST_CREATED",
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
        subject: string;
        to: { email: string }[];
        htmlContent: string;
        textContent: string;
      };
      assert.equal(body.subject, "Tienes una nueva solicitud de pedido");
      assert.deepEqual(body.to, [{ email: "vendedor@example.test", name: "Samanta" }]);
      assert.match(body.htmlContent, /Papa &lt;script&gt;/);
      assert.doesNotMatch(body.htmlContent, /<script>/);
      assert.match(body.textContent, /Revisa la solicitud/);
      assert.match(body.textContent, /1\.200/);
    });

    it("exposes a provider rejection without returning its response body", async () => {
      await assert.rejects(
        sendOrderNotificationEmail(
          {
            email: "buyer@example.test",
            name: "Comprador",
            productName: "Papa",
            quantity: "1",
            unit: "KG",
            priceCOP: 1000,
            orderUrl: "https://example.test/mi-cuenta/pedidos",
            event: "REQUEST_ACCEPTED",
          },
          {
            apiKey: "test-api-key",
            senderEmail: "no-reply@example.test",
            fetcher: async () => new Response("sensitive provider response", { status: 503 }),
          },
        ),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes("HTTP 503") &&
          !error.message.includes("sensitive provider response"),
      );
    });

    it("requires mail credentials before making a provider request", async () => {
      await assert.rejects(
        sendOrderNotificationEmail(
          {
            email: "seller@example.test",
            name: "Seller",
            productName: "Papa",
            quantity: "1",
            unit: "KG",
            priceCOP: 1000,
            orderUrl: "https://example.test/mi-cuenta/pedidos",
            event: "REQUEST_CREATED",
          },
          {
            apiKey: "",
            senderEmail: "no-reply@example.test",
            fetcher: async () => {
              assert.fail("Should not contact the email provider.");
            },
          },
        ),
        (error: unknown) =>
          error instanceof BrevoConfigurationError &&
          error.code === "CONFIGURATION_MISSING",
      );
    });
  });

  it("fails explicitly when Brevo rejects the message", async () => {
    await assert.rejects(
      sendPasswordResetEmail(
        {
          email: "ana@example.test",
          name: "Ana",
          url: "https://example.test/reset?token=test",
        },
        {
          apiKey: "test-api-key",
          senderEmail: "no-reply@example.test",
          fetcher: async () => new Response(null, { status: 401 }),
        },
      ),
      /Brevo rechazó el correo de recuperación \(HTTP 401\)/,
    );
  });

  it("requires both server-side Brevo settings", async () => {
    await assert.rejects(
      sendPasswordResetEmail(
        { email: "ana@example.test", name: "Ana", url: "https://example.test" },
        {
          apiKey: "",
          senderEmail: "no-reply@example.test",
          fetcher: async () => {
            throw new Error("Unexpected network request in test.");
          },
        },
      ),
      /API_KEY_BREVO debe estar configurada/,
    );
    await assert.rejects(
      sendPasswordResetEmail(
        { email: "ana@example.test", name: "Ana", url: "https://example.test" },
        {
          apiKey: "test-api-key",
          senderEmail: "",
          fetcher: async () => {
            throw new Error("Unexpected network request in test.");
          },
        },
      ),
      /BREVO_SENDER_EMAIL debe estar configurada/,
    );
  });
});
