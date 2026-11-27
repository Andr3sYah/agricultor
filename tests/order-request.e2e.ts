import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  chromium,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type Request,
} from "@playwright/test";
import { Pool } from "pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getColombianAgendaDate } from "@/features/farm-agenda/farm-agenda-service";

type CapturedResetEmail = {
  to: { email: string }[];
  textContent: string;
};

const E2E_BREVO_API_KEY = "local-e2e-brevo-key";

function assertDisposableDatabase(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !localHosts.has(url.hostname) ||
    !/^agricultor_test(?:_|$)/.test(databaseName)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must point to a local disposable agricultor_test database.",
    );
  }
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a local port for the E2E server.");
  }
  server.close();
  await once(server, "close");
  return address.port;
}

function isCapturedResetEmail(value: unknown): value is CapturedResetEmail {
  return (
    typeof value === "object" &&
    value !== null &&
    "to" in value &&
    Array.isArray(value.to) &&
    value.to.every(
      (recipient) =>
        typeof recipient === "object" &&
        recipient !== null &&
        "email" in recipient &&
        typeof recipient.email === "string",
    ) &&
    "textContent" in value &&
    typeof value.textContent === "string"
  );
}

async function startBrevoStub() {
  const messages: CapturedResetEmail[] = [];
  const rejected: CapturedResetEmail[] = [];
  const server = createHttpServer((request, response) => {
    if (
      request.method !== "POST" ||
      request.url !== "/v3/smtp/email" ||
      request.headers["api-key"] !== E2E_BREVO_API_KEY
    ) {
      response.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        response.writeHead(400).end();
        return;
      }

      if (!isCapturedResetEmail(payload)) {
        response.writeHead(400).end();
        return;
      }

      if (payload.textContent.includes("/verify-email?") &&
          payload.to.some(({ email }) => email.startsWith("order-e2e-buyer-")) &&
          rejected.length === 0) {
        rejected.push(payload);
        response.writeHead(503).end();
        return;
      }
      messages.push(payload);
      response
        .writeHead(201, { "content-type": "application/json" })
        .end(JSON.stringify({ messageId: "local-e2e-message" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not start the local Brevo E2E stub.");
  }

  return {
    apiUrl: `http://127.0.0.1:${address.port}/v3/smtp/email`,
    messages,
    rejected,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function waitForAccountEmail(
  messages: CapturedResetEmail[],
  email: string,
  path: string,
): Promise<CapturedResetEmail> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const message = messages.find((candidate) =>
      candidate.to.some((recipient) => recipient.email === email) &&
      candidate.textContent.includes(path),
    );
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The local Brevo E2E stub did not capture the expected email.");
}

async function startServer(
  port: number,
  databaseUrl: string,
  brevoApiUrl: string,
): Promise<ChildProcess> {
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        AUTH_SECRET:
          process.env.AUTH_SECRET ?? randomBytes(32).toString("base64url"),
        DATABASE_URL: databaseUrl,
        NODE_ENV: "production",
        TZ: "UTC",
        TEST_DATABASE_URL: databaseUrl,
        AUTH_E2E_BASE_URL: `http://localhost:${port}`,
        OAUTH_CLIENT_ID: `e2e-${randomUUID()}`,
        OAUTH_CLIENT_SECRET: randomBytes(32).toString("base64url"),
        API_KEY_BREVO: E2E_BREVO_API_KEY,
        BREVO_SENDER_EMAIL: "no-reply@example.test",
        BREVO_TEST_API_URL: brevoApiUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const baseUrl = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`The E2E server exited before starting:\n${output}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return server;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  server.kill();
  throw new Error(`The E2E server did not start in time:\n${output}`);
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Set TEST_DATABASE_URL to run the E2E test against disposable PostgreSQL.",
    );
  }
  assertDisposableDatabase(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });
  const database = new PrismaClient({ adapter: new PrismaPg(pool) });
  let browser: Browser | undefined;
  let server: ChildProcess | undefined;
  let producerApi: APIRequestContext | undefined;
  let brevoStub: Awaited<ReturnType<typeof startBrevoStub>> | undefined;
  const fixtureUserIds: string[] = [];

  try {
    await database.$connect();
    const suffix = randomUUID();
    const port = await getFreePort();
    brevoStub = await startBrevoStub();
    server = await startServer(port, databaseUrl, brevoStub.apiUrl);
    const baseURL = `http://localhost:${port}`;
    producerApi = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Origin: baseURL,
        Referer: `${baseURL}/crear-cuenta`,
      },
    });
    const producerEmail = `order-e2e-producer-${suffix}@example.test`;
    const producerPassword = `E2e-${randomUUID()}-pass`;
    const producerSignup = await producerApi.post("/api/auth/sign-up/email", {
      data: {
        name: "Productor de prueba E2E",
        email: producerEmail,
        password: producerPassword,
        callbackURL: "/mi-cuenta",
      },
    });
    assert.equal(
      producerSignup.ok(),
      true,
      `Producer signup failed: ${await producerSignup.text()}`,
    );
    const producerVerification = await waitForAccountEmail(brevoStub.messages, producerEmail, "/verify-email?");
    const producerVerificationUrl = producerVerification.textContent.match(/https?:\/\/\S+/)?.[0];
    assert.ok(producerVerificationUrl);
    const producerVerificationResponse = await producerApi.get(
      producerVerificationUrl,
    );
    assert.ok(
      producerVerificationResponse.ok(),
      `Producer verification failed: ${await producerVerificationResponse.text()}`,
    );
    const producerSession = await producerApi.get("/api/auth/get-session");
    assert.equal(
      producerSession.status(),
      200,
      `Producer session lookup failed: ${await producerSession.text()}`,
    );
    const producerSessionData = await producerSession.json();
    assert.ok(
      producerSessionData,
      "Email verification should establish a producer session.",
    );
    assert.equal(producerSessionData.user.email, producerEmail);
    const producerSignout = await producerApi.post("/api/auth/sign-out", {
      data: {},
    });
    assert.equal(
      producerSignout.status(),
      200,
      `Producer sign-out failed: ${await producerSignout.text()}`,
    );
    assert.equal(await (await producerApi.get("/api/auth/get-session")).json(), null);
    const producerSignin = await producerApi.post("/api/auth/sign-in/email", {
      data: { email: producerEmail, password: producerPassword },
    });
    assert.equal(
      producerSignin.status(),
      200,
      `Producer sign-in failed: ${await producerSignin.text()}`,
    );
    assert.equal(
      (await (await producerApi.get("/api/auth/get-session")).json()).user.email,
      producerEmail,
    );
    const producer = await database.user.findUniqueOrThrow({
      where: { email: producerEmail },
      select: { id: true },
    });
    fixtureUserIds.push(producer.id);
    await database.userRole.create({
      data: { userId: producer.id, role: "PRODUCER" },
    });

    const municipality = `Municipio E2E ${suffix}`;
    const catalogProduct = {
      ownerId: producer.id,
      category: "OTHER",
      availableQuantity: new Prisma.Decimal("5"),
      unit: "KG",
      priceCOP: 1000,
      municipality,
      isPublished: true,
      updatedAt: new Date(),
    } as const;
    const product = await database.product.create({
      data: {
        ...catalogProduct,
        id: `${suffix}-last`,
        name: `Producto E2E ${suffix}`,
      },
      select: { id: true, name: true },
    });
    await database.$executeRaw`
      UPDATE "Product" SET "priceUpdatedAt" = NULL WHERE "id" = ${product.id}
    `;
    await database.product.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        ...catalogProduct,
        id: `${suffix}-${index}`,
        name: `Oferta E2E ${index}`,
        priceCOP: index === 11 ? 1450 : catalogProduct.priceCOP,
      })),
    });
    const email = `order-e2e-buyer-${suffix}@example.test`;
    const password = `E2e-${randomUUID()}-pass`;
    const api = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Origin: baseURL,
        Referer: `${baseURL}/iniciar-sesion`,
      },
    });

    try {
      const signup = await api.post("/api/auth/sign-up/email", {
        data: {
          name: "Comprador E2E",
          email,
          password,
          callbackURL: "/mi-cuenta",
        },
      });
      assert.equal(signup.ok(), true, `Signup failed: ${await signup.text()}`);

      const buyer = await database.user.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });
      fixtureUserIds.push(buyer.id);
      await database.userRole.deleteMany({ where: { userId: buyer.id, role: "BUYER" } });
      await waitForAccountEmail(brevoStub.rejected, email, "/verify-email?");
      const unverifiedSignin = await api.post("/api/auth/sign-in/email", { data: { email, password } });
      assert.equal(unverifiedSignin.status(), 403);
      const resend = await api.post("/api/auth/send-verification-email", {
        data: { email, callbackURL: "/mi-cuenta" },
      });
      assert.ok(resend.ok());
      const buyerVerification = await waitForAccountEmail(brevoStub.messages, email, "/verify-email?");
      const buyerVerificationUrl = buyerVerification.textContent.match(/https?:\/\/\S+/)?.[0];
      assert.ok(buyerVerificationUrl);
      const verified = await api.get(buyerVerificationUrl);
      assert.ok(verified.ok());
      const buyerSession = await api.get("/api/auth/get-session");
      assert.equal(buyerSession.ok(), true);
      const buyerSessionData = await buyerSession.json();
      assert.ok(buyerSessionData, "Email verification should establish a buyer session.");
      assert.equal(buyerSessionData.user.email, email);

      const resetRequest = await api.post(
        "/api/auth/request-password-reset",
        {
          data: {
            email,
            redirectTo: `${baseURL}/restablecer-contrasena`,
          },
        },
      );
      assert.equal(
        resetRequest.ok(),
        true,
        `Password reset request failed: ${await resetRequest.text()}`,
      );
      const resetEmail = await waitForAccountEmail(brevoStub.messages, email, "/reset-password/");
      const resetUrl = resetEmail.textContent.match(/https?:\/\/\S+/)?.[0];
      assert.ok(resetUrl, "The local reset email did not contain a link.");

      const localResetUrl = new URL(resetUrl);
      assert.ok(
        ["localhost", "127.0.0.1"].includes(localResetUrl.hostname),
        "The reset email did not contain a local E2E link.",
      );
      assert.equal(
        localResetUrl.protocol,
        "http:",
        "Local E2E reset links must use HTTP.",
      );

      const newPassword = `Reset-${randomUUID()}-pass`;
      browser = await chromium.launch({ headless: true });

      const googleOnlyEmail = `google-e2e-${suffix}@example.test`;
      const googleOnlyUser = await database.user.create({
        data: {
          id: randomUUID(),
          name: "Cuenta de prueba Google",
          email: googleOnlyEmail,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: `google-${suffix}`,
              providerId: "google",
            },
          },
        },
        select: { id: true },
      });
      fixtureUserIds.push(googleOnlyUser.id);
      const googleApi = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: {
          Origin: baseURL,
          Referer: `${baseURL}/iniciar-sesion`,
        },
      });
      const googleResetRequest = await googleApi.post(
        "/api/auth/request-password-reset",
        {
          data: {
            email: googleOnlyEmail,
            redirectTo: `${baseURL}/restablecer-contrasena`,
          },
        },
      );
      assert.equal(googleResetRequest.ok(), true);
      const googleResetEmail = await waitForAccountEmail(
        brevoStub.messages,
        googleOnlyEmail,
        "/reset-password/",
      );
      const googleResetLink = googleResetEmail.textContent.match(/https?:\/\/\S+/)?.[0];
      assert.ok(googleResetLink);
      const googleResetPage = await googleApi.get(googleResetLink);
      assert.ok(googleResetPage.ok());
      const googleResetToken = new URL(googleResetPage.url()).searchParams.get("token");
      assert.ok(googleResetToken);
      const googlePassword = `Google-${randomUUID()}-pass`;
      const googlePasswordReset = await googleApi.post(
        "/api/auth/reset-password",
        { data: { newPassword: googlePassword, token: googleResetToken } },
      );
      assert.equal(googlePasswordReset.ok(), true);
      assert.equal(
        await database.user.count({ where: { email: googleOnlyEmail } }),
        1,
      );
      const googleCredentialCount = await database.account.count({
        where: { userId: googleOnlyUser.id, providerId: "credential" },
      });
      assert.equal(googleCredentialCount, 1);
      const googlePasswordSignin = await googleApi.post(
        "/api/auth/sign-in/email",
        { data: { email: googleOnlyEmail, password: googlePassword } },
      );
      assert.equal(googlePasswordSignin.ok(), true);
      await googleApi.dispose();

      const googlePage = await browser.newPage();
      await googlePage.goto(`${baseURL}/iniciar-sesion`);
      const googleButton = googlePage.getByRole("button", {
        name: "Continuar con Google",
      });
      let releaseGoogleError!: () => void;
      const googleErrorGate = new Promise<void>((resolve) => {
        releaseGoogleError = resolve;
      });
      await googlePage.route(
        "**/api/auth/sign-in/social",
        async (route) => {
          await googleErrorGate;
          await route.fulfill({
            status: 500,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "mock Google failure" }),
          });
        },
      );
      await googleButton.click();
      await expect(googleButton).toContainText("Conectando con Google");
      releaseGoogleError();
      await expect(googlePage.locator("#auth-message")).toContainText(
        /No pudimos (iniciar sesión|conectarnos) con Google/,
      );
      await googlePage.close();

      const anonymousContext = await browser.newContext();
      const anonymousPage = await anonymousContext.newPage();
      const catalogQuery = new URLSearchParams({
        producto: "e2e",
        categoria: "OTHER",
        municipio: municipality,
      });
      await anonymousPage.goto(`${baseURL}/catalogo?${catalogQuery}`);
      await expect(anonymousPage.getByText(/Total estimado por/)).toHaveCount(0);
      const minimumStock = anonymousPage.getByLabel("Cantidad que necesitas");
      await minimumStock.fill("5,001");
      await anonymousPage.getByLabel("Unidad de venta").selectOption("KG");
      await anonymousPage.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(anonymousPage.getByText("No encontramos productos con estos filtros.")).toBeVisible();
      await expect(minimumStock).toHaveValue("5,001");
      await anonymousPage.getByRole("link", { name: "Quitar solo la cantidad mínima" }).click();
      const relaxedQuery = new URLSearchParams(catalogQuery);
      relaxedQuery.set("unidad", "KG");
      await expect(anonymousPage).toHaveURL(`${baseURL}/catalogo?${relaxedQuery}`);
      await expect(minimumStock).toHaveValue("");
      await expect(anonymousPage.getByLabel("Unidad de venta")).toHaveValue("KG");
      await expect(anonymousPage.getByRole("status").filter({ hasText: "13 ofertas encontradas" })).toBeVisible();
      await minimumStock.fill("5");
      await anonymousPage.getByRole("button", { name: "Buscar", exact: true }).click();
      catalogQuery.set("unidad", "KG");
      catalogQuery.set("cantidad", "5");
      const resultCount = anonymousPage.getByRole("status").filter({
        hasText: "13 ofertas encontradas",
      });
      await expect(resultCount).toBeVisible();
      const comparison = anonymousPage.getByRole("listitem").filter({ hasText: "Oferta E2E 11" });
      await expect(comparison).toContainText(/Total estimado por 5 Kilogramo \(kg\)\s*\$\s*7\.250 COP/);
      await anonymousPage.getByRole("link", { name: "Siguiente" }).click();
      catalogQuery.set("pagina", "2");
      const catalogUrl = `${baseURL}/catalogo?${catalogQuery}`;
      const orderContextUrl = `${baseURL}/catalogo/${product.id}/pedido?${catalogQuery}`;
      await anonymousPage.waitForURL(catalogUrl);
      await expect(resultCount).toBeVisible();
      await expect(anonymousPage.getByRole("listitem").filter({ hasText: product.name }))
        .toContainText(/Total estimado por 5 Kilogramo \(kg\)\s*\$\s*5\.000 COP/);
      const productLink = anonymousPage.getByRole("link", {
        name: product.name,
        exact: true,
      });
      await productLink.click();
      await anonymousPage.waitForURL(
        `${baseURL}/catalogo/${product.id}?${catalogQuery}`,
      );
      await expect(anonymousPage.getByRole("article"))
        .toContainText(/Total estimado por 5 Kilogramo \(kg\)\s*\$\s*5\.000 COP/);
      await expect(anonymousPage.getByRole("button", { name: "Guardar en favoritos" }))
        .toHaveCount(0);
      await anonymousPage
        .getByRole("link", { name: "Volver al catálogo" })
        .click();
      await anonymousPage.waitForURL(catalogUrl);
      const productPath = `${baseURL}/catalogo/${product.id}`;
      const insufficientQuery = new URLSearchParams(catalogQuery);
      insufficientQuery.set("cantidad", "5.001");
      await anonymousPage.goto(`${productPath}?${insufficientQuery}`);
      await expect(anonymousPage.getByText("Esta oferta tiene menos de la cantidad que buscaste.")).toBeVisible();
      await expect(anonymousPage.getByText(/Total estimado por/)).toHaveCount(0);
      await anonymousPage.getByRole("link", { name: "Ver ofertas sin cantidad mínima" }).click();
      await expect(anonymousPage).toHaveURL(`${baseURL}/catalogo?${relaxedQuery}`);
      await expect(resultCount).toBeVisible();
      await anonymousPage.goto(`${productPath}?unidad=BULTO&cantidad=2`);
      await expect(anonymousPage.getByText(/Total estimado por/)).toHaveCount(0);
      await anonymousPage.goto(catalogUrl);
      await productLink.waitFor();
      await anonymousPage.getByRole("link", {
        name: `Solicitar este producto: ${product.name}`,
      }).click();
      await anonymousPage.waitForURL(orderContextUrl);
      const createBuyerLink = anonymousPage.getByRole("link", { name: "Crear cuenta de comprador" });
      await expect(createBuyerLink).toBeVisible();
      const signupTarget = new URL(await createBuyerLink.getAttribute("href") ?? "", baseURL);
      assert.equal(signupTarget.pathname, "/crear-cuenta");
      assert.equal(signupTarget.searchParams.get("redirectTo"), orderContextUrl.slice(baseURL.length));
      await anonymousPage.getByRole("link", { name: "Volver al catálogo" }).click();
      await anonymousPage.waitForURL(catalogUrl);
      const sortedCatalogQuery = new URLSearchParams(catalogQuery);
      sortedCatalogQuery.set("orden", "precio-asc");
      await anonymousPage.goto(`${baseURL}/catalogo?${sortedCatalogQuery}`);
      const resetFilters = anonymousPage.getByRole("link", {
        name: "Restablecer filtros y orden",
      });
      await resetFilters.click();
      await anonymousPage.waitForURL(`${baseURL}/catalogo`);
      await expect(anonymousPage.getByLabel("Categoría")).toHaveValue("");
      await expect(anonymousPage.getByLabel("Nombre del producto")).toHaveValue("");
      await expect(anonymousPage.getByLabel("Municipio")).toHaveValue("");
      await expect(anonymousPage.getByLabel("Ordenar por")).toHaveValue("");
      await expect(resetFilters).toHaveCount(0);
      for (const path of ["/mi-cuenta", "/mi-cuenta/pedidos"]) {
        await anonymousPage.goto(`${baseURL}${path}`);
        await expect(
          anonymousPage,
          `${path} should require a session.`,
        ).toHaveURL(`${baseURL}/iniciar-sesion`);
      }
      await anonymousContext.close();
      const producerContext = await browser.newContext({
        storageState: await producerApi.storageState(),
      });
      const producerPage = await producerContext.newPage();
      await producerPage.setViewportSize({ width: 320, height: 640 });
      await producerPage.goto(`${baseURL}/mi-cuenta`);
      await producerPage.getByRole("link", { name: "Abrir conversor" }).click();
      await producerPage.setViewportSize({ width: 1024, height: 768 });
      const converterAmount = await producerPage.getByLabel("Cantidad", { exact: true }).boundingBox();
      const converterFrom = await producerPage.getByLabel("Convertir desde", { exact: true }).boundingBox();
      assert.ok(converterAmount && converterFrom);
      assert.equal(Math.round(converterAmount.y), Math.round(converterFrom.y));
      const swapButton = await producerPage.getByRole("button", { name: "Intercambiar unidades" }).boundingBox();
      const convertButton = await producerPage.getByRole("button", { name: "Convertir unidades" }).boundingBox();
      assert.ok(swapButton && convertButton);
      assert.ok(convertButton.x - (swapButton.x + swapButton.width) >= 20);
      await producerPage.setViewportSize({ width: 320, height: 640 });
      const mobileSwap = await producerPage.getByRole("button", { name: "Intercambiar unidades" }).boundingBox();
      const mobileConvert = await producerPage.getByRole("button", { name: "Convertir unidades" }).boundingBox();
      assert.ok(mobileSwap && mobileConvert);
      assert.ok(mobileConvert.y - (mobileSwap.y + mobileSwap.height) >= 20);
      await producerPage.getByLabel("Cantidad", { exact: true }).fill("10");
      await producerPage.getByLabel("Precio por kilo en pesos").fill("2.000");
      await producerPage.getByRole("button", { name: "Convertir unidades" }).click();
      const conversionResult = producerPage.getByRole("region", { name: "Resultado" });
      await expect(conversionResult).toContainText("10 Libras de 500 g = 5 Kilogramos (kg)");
      await expect(conversionResult).toContainText(/10\.000 COP/);
      await producerPage.getByLabel("Unidad del precio").selectOption("lb500");
      await producerPage.getByLabel("Precio por libra de 500 g en pesos").fill("1.700");
      await producerPage.getByRole("button", { name: "Convertir unidades" }).click();
      await expect(conversionResult).toContainText("10 Libras de 500 g = 5 Kilogramos (kg)");
      await expect(conversionResult).toContainText(/17\.000 COP/);
      await producerPage.getByRole("button", { name: "Intercambiar unidades" }).click();
      await expect(producerPage.getByLabel("Precio por libra de 500 g en pesos"))
        .toHaveValue("");
      await expect(conversionResult).toHaveCount(0);
      await producerPage.getByLabel("Cantidad", { exact: true }).fill("25");
      await producerPage.getByLabel("Convertir a", { exact: true })
        .selectOption({ label: "Arrobas de 12,5 kg" });
      await producerPage.getByLabel("Precio por arroba de 12,5 kg en pesos")
        .fill("32.000");
      await producerPage.getByRole("button", { name: "Convertir unidades" }).click();
      await expect(conversionResult).toContainText("25 Kilogramos (kg) = 2 Arrobas de 12,5 kg");
      await expect(conversionResult).toContainText(/64\.000 COP/);
      await producerPage.getByLabel("Convertir desde", { exact: true }).selectOption("bulto");
      await producerPage.getByLabel("Cantidad de bultos").fill("3");
      const bagWeight = producerPage.getByLabel("Peso de cada bulto en kilos");
      await producerPage.getByRole("button", { name: "Convertir unidades" }).click();
      await expect(bagWeight).toHaveAttribute("aria-invalid", "true");
      await bagWeight.fill("25,5");
      await producerPage.getByLabel("Precio por kilo en pesos").fill("2.000");
      await producerPage.getByRole("button", { name: "Convertir unidades" }).click();
      await expect(conversionResult).toContainText("3 bultos = 76,5 Kilogramos (kg)");
      await expect(conversionResult).toContainText(/153\.000 COP/);
      await producerPage.getByLabel("Unidad del precio").selectOption("lb500");
      await producerPage.getByLabel("Precio por libra de 500 g en pesos").fill("900");
      await producerPage.getByRole("button", { name: "Convertir unidades" }).click();
      await expect(conversionResult).toContainText("3 bultos = 76,5 Kilogramos (kg)");
      await expect(conversionResult).toContainText(/137\.700 COP/);
      await producerPage.goto(`${baseURL}/mi-cuenta`);
      await producerPage.getByRole("link", { name: "Calcular costos y margen" }).click();
      await producerPage.setViewportSize({ width: 1024, height: 768 });
      const productionQuantity = await producerPage.getByLabel("Cantidad de producción").boundingBox();
      const salePrice = await producerPage.getByLabel("Precio de venta por unidad").boundingBox();
      assert.ok(productionQuantity && salePrice);
      assert.equal(Math.round(productionQuantity.y), Math.round(salePrice.y));
      await producerPage.setViewportSize({ width: 320, height: 640 });
      await producerPage.getByLabel("Cantidad de producción").fill("2,5");
      await producerPage.getByLabel("Semillas", { exact: true }).fill("1.250,50");
      await producerPage.getByRole("button", { name: "Calcular costos y margen" }).click();
      const costResult = producerPage.getByRole("region", { name: "Resultado estimado" });
      await expect(costResult).toContainText(/Costo por unidad\s*\$\s*500,2/);
      await expect(costResult).toContainText(/Precio por unidad para cubrir tus costos\s*\$\s*501/);
      await expect(costResult.getByText("Ingreso esperado", { exact: true })).toHaveCount(0);
      await producerPage.getByLabel("Precio de venta por unidad").fill("$2.000");
      await expect(costResult).toContainText(/Ingreso esperado\s*\$\s*5\.000/);
      await expect(costResult).toContainText(/Ganancia o pérdida\s*\$\s*3\.749,5/);
      await producerPage.goto(`${baseURL}/mi-cuenta`);
      await producerPage.getByRole("link", { name: "Editar perfil de vendedor" }).click();
      await producerPage.getByLabel("Nombre comercial").fill("Distribución de prueba");
      await producerPage.getByLabel("Municipio", { exact: true }).fill("La Vega");
      await producerPage.getByLabel("Descripción").fill("Distribuimos papa y hortalizas.");
      await producerPage.getByRole("checkbox", { name: "Mostrar mi perfil en el catálogo" }).check();
      await producerPage.getByRole("button", { name: "Guardar perfil" }).click();
      await expect(producerPage.getByText("Tu perfil está publicado.")).toBeVisible();
      await producerPage.goto(`${baseURL}/mi-cuenta/productos`);
      const harvestName = `Papa E2E ${suffix}`;
      const harvestMunicipality = `Municipio para papa ${suffix}`;
      const cropName = producerPage.getByLabel("Nombre del producto");
      const cropCategory = producerPage.getByLabel("Categoría", { exact: true });
      const cropQuantity = producerPage.getByLabel("Cantidad disponible", { exact: true });
      const cropUnit = producerPage.getByLabel("Unidad de medida");
      const cropPrice = producerPage.getByLabel("Precio en pesos por unidad");
      const cropMunicipality = producerPage.getByLabel("Municipio o localidad");
      await cropName.fill(harvestName);
      await cropCategory.selectOption("TUBERS");
      await cropQuantity.fill("12,5");
      await cropUnit.selectOption("KG");
      await cropPrice.fill("2.00");
      await cropMunicipality.fill(harvestMunicipality);
      const addProduct = producerPage.getByRole("button", { name: "Agregar producto" });
      await addProduct.click();
      await expect(cropPrice).toHaveAttribute("aria-invalid", "true");
      await expect(cropName).toHaveValue(harvestName);
      await expect(cropCategory).toHaveValue("TUBERS");
      await expect(cropQuantity).toHaveValue("12,5");
      await expect(cropUnit).toHaveValue("KG");
      await expect(cropMunicipality).toHaveValue(harvestMunicipality);
      await cropPrice.fill("$2.000");
      await addProduct.click();
      const savedCrop = producerPage.getByRole("listitem").filter({ hasText: harvestName });
      const publicationShortcut = producerPage.getByRole("link", {
        name: "Ir al producto guardado para publicarlo",
      });
      await expect(publicationShortcut).toBeVisible();
      await publicationShortcut.click();
      await expect(savedCrop.getByText("Privado", { exact: true })).toBeVisible();
      const publicCatalog = await browser.newPage();
      const harvestCatalogUrl = `${baseURL}/catalogo?${new URLSearchParams({
        municipio: harvestMunicipality,
      })}`;
      await publicCatalog.goto(harvestCatalogUrl);
      await expect(publicCatalog.getByText("No encontramos productos con estos filtros."))
        .toBeVisible();
      await savedCrop.getByRole("button", { name: "Publicar en catálogo" }).click();
      await expect(savedCrop.getByText("Publicado", { exact: true })).toBeVisible();
      await publicCatalog.reload();
      const publicCrop = publicCatalog.getByRole("listitem").filter({ hasText: harvestName });
      await expect(publicCrop).toContainText("12,5 Kilogramo (kg)");
      await expect(publicCrop).toContainText(/2\.000/);
      await expect(publicCrop.locator("time")).toHaveAttribute("datetime", /Z$/);
      await publicCrop.getByRole("link", { name: harvestName, exact: true }).click();
      await publicCatalog.getByRole("link", { name: "Ver perfil de Distribución de prueba" }).click();
      await expect(publicCatalog.getByRole("heading", { name: "Distribución de prueba" })).toBeVisible();
      await expect(publicCatalog.getByText("Distribuimos papa y hortalizas.")).toBeVisible();
      await expect(publicCatalog.getByRole("link", { name: harvestName })).toBeVisible();
      const publicProfileUrl = publicCatalog.url();
      await publicCatalog.goto(harvestCatalogUrl);
      await publicCatalog.getByLabel("Nombre del producto").fill("pApA");
      await publicCatalog.getByLabel("Municipio").fill("");
      await publicCatalog.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(publicCatalog.getByText("1 oferta encontrada", { exact: true })).toBeVisible();
      await expect(publicCrop).toBeVisible();
      await savedCrop.getByRole("link", { name: "Editar producto" }).click();
      await expect(
        producerPage.getByRole("heading", { name: "Editar producto" }),
      ).toBeVisible();
      await cropQuantity.fill("10,25");
      await cropPrice.fill("$2.500");
      await producerPage.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(producerPage.getByText("Actualizamos el producto.")).toBeVisible();
      const editedCrop = await database.product.findFirstOrThrow({
        where: { ownerId: producer.id, name: harvestName },
        select: { id: true, availableQuantity: true, priceCOP: true },
      });
      assert.ok(editedCrop.availableQuantity.equals("10.25"));
      assert.equal(editedCrop.priceCOP, 2500);
      await publicCatalog.reload();
      await expect(publicCrop).toContainText("10,25 Kilogramo (kg)");
      await expect(publicCrop).toContainText(/2\.500/);
      await producerPage.getByRole("link", { name: "Volver a mis productos" }).click();
      const originalPriceDate = await publicCrop.locator("time").getAttribute("datetime");
      await savedCrop.getByText("Cambiar cantidad disponible", { exact: true }).click();
      const availableStock = savedCrop.getByLabel("Cantidad disponible en Kilogramo (kg)");
      const saveStock = savedCrop.getByRole("button", { name: "Guardar cantidad" });
      await availableStock.fill("0");
      await saveStock.click();
      await expect(savedCrop.getByText("Agotado", { exact: true })).toBeVisible();
      await publicCatalog.reload();
      await expect(publicCrop).toHaveCount(0);
      const unavailableQuery = new URLSearchParams({
        producto: harvestName,
        municipio: harvestMunicipality,
        unidad: "KG",
        cantidad: "5",
      });
      const unavailableOffer = `${baseURL}/catalogo/${editedCrop.id}`;
      for (const path of ["", "/pedido"]) {
        await publicCatalog.goto(`${unavailableOffer}${path}?${unavailableQuery}`);
        await expect(publicCatalog.getByRole("heading", { name: "Producto no disponible" })).toBeVisible();
        const returnLink = publicCatalog.getByRole("link", { name: "Volver al catálogo" });
        await expect(returnLink).toHaveAttribute("href", `/catalogo?${unavailableQuery}`);
        await returnLink.click();
        await expect(publicCatalog).toHaveURL(`${baseURL}/catalogo?${unavailableQuery}`);
      }
      await availableStock.fill("8,75");
      await saveStock.click();
      await expect(savedCrop).toContainText(/Disponible para nuevos pedidos\s*8,75 Kilogramo/);
      await publicCatalog.reload();
      await expect(publicCrop).toContainText("8,75 Kilogramo (kg)");
      await expect(publicCrop.locator("time")).toHaveAttribute("datetime", originalPriceDate!);
      await savedCrop.getByRole("button", { name: "Retirar del catálogo" }).click();
      await expect(savedCrop.getByText("Privado", { exact: true })).toBeVisible();
      await publicCatalog.reload();
      await expect(publicCrop).toHaveCount(0);
      await publicCatalog.close();
      await producerPage.goto(`${baseURL}/mi-cuenta`);
      await producerPage.getByRole("link", { name: "Abrir mi agenda" }).click();
      const comingTasks = producerPage.getByRole("region", { name: "Hoy y próximas labores" });
      await expect(comingTasks.getByText("No tienes próximas labores en la agenda.")).toBeVisible();
      await producerPage.getByRole("link", { name: "Agregar una labor" }).click();
      const agendaForm = producerPage.getByRole("region", { name: "Agregar una labor" });
      await agendaForm.getByLabel("Actividad", { exact: true }).selectOption("HARVEST");
      await agendaForm.getByLabel("Fecha", { exact: true }).fill("2099-01-02");
      await agendaForm.getByLabel("Cultivo o producto").fill("Papa para cosechar");
      await agendaForm.getByRole("button", { name: "Agregar a mi agenda" }).click();
      await expect(comingTasks.getByText("Papa para cosechar")).toBeVisible();
      await agendaForm.getByLabel("Actividad", { exact: true }).selectOption("IRRIGATION");
      await agendaForm.getByLabel("Fecha", { exact: true }).fill(getColombianAgendaDate(new Date()));
      await agendaForm.getByLabel("Cultivo o producto").fill("Papa para regar hoy");
      await agendaForm.getByRole("button", { name: "Agregar a mi agenda" }).click();
      await expect(comingTasks.getByText("Papa para regar hoy", { exact: true })).toBeVisible();
      await producerPage.goto(`${baseURL}/mi-cuenta`);
      await expect(producerPage.getByRole("region", { name: "Herramientas" }))
        .toContainText("1 labor para hoy");
      await producerPage.getByRole("link", { name: "Abrir mi agenda" }).click();
      await expect(comingTasks.getByText("Papa para regar hoy", { exact: true })).toBeVisible();
      await agendaForm.getByLabel("Actividad", { exact: true }).selectOption("SOWING");
      await agendaForm.getByLabel("Fecha", { exact: true }).fill("2000-01-01");
      await agendaForm.getByLabel("Cultivo o producto").fill("Papa de registro anterior");
      await agendaForm.getByRole("button", { name: "Agregar a mi agenda" }).click();
      const history = comingTasks.getByText("Labores de fechas anteriores (1)", { exact: true });
      await expect(history).toBeVisible();
      await expect(comingTasks.getByText("Papa de registro anterior")).toBeHidden();
      await history.click();
      await expect(comingTasks.getByText("Papa de registro anterior")).toBeVisible();
      await comingTasks.getByRole("listitem").filter({ hasText: "Papa de registro anterior" })
        .getByRole("link", { name: "Editar labor" }).click();
      await expect(producerPage.getByRole("heading", { name: "Editar labor" })).toBeVisible();
      const scheduledFor = producerPage.getByLabel("Fecha", { exact: true });
      await expect(scheduledFor).toHaveValue("2000-01-01");
      await scheduledFor.fill("2099-01-03");
      await producerPage.getByLabel("Nota").fill("Revisar lote antes de sembrar");
      await producerPage.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(producerPage.getByText("Guardamos los cambios en tu agenda.")).toBeVisible();
      await producerPage.getByRole("link", { name: "Volver a mi agenda" }).click();
      await expect(comingTasks.getByText("Revisar lote antes de sembrar")).toBeVisible();
      await expect(comingTasks.getByText("Papa de registro anterior")).toHaveCount(1);
      await expect(history).toHaveCount(0);
      const rescheduled = comingTasks.getByRole("listitem").filter({
        hasText: "Papa de registro anterior",
      });
      const removeLabor = rescheduled.getByRole("button", { name: "Eliminar actividad" });
      await removeLabor.click();
      await rescheduled.getByRole("button", { name: "Conservar labor" }).click();
      await expect(removeLabor).toBeFocused();
      await expect(rescheduled).toBeVisible();
      await removeLabor.click();
      await rescheduled.getByRole("button", { name: "Sí, eliminar labor" }).click();
      await expect(rescheduled).toHaveCount(0);
      await expect(comingTasks.getByText("Papa para cosechar")).toBeVisible();
      await producerPage.setViewportSize({ width: 1280, height: 720 });
      await producerPage.goto(`${baseURL}/mi-cuenta/pedidos`);
      const producerOrdersSection = producerPage.getByRole("region", {
        name: "Solicitudes recibidas",
      });
      await producerOrdersSection
        .getByText("Aún no has recibido pedidos.")
        .waitFor();
      await producerOrdersSection
        .getByRole("link", { name: "Gestionar mis productos" })
        .waitFor();
      const resetContext = await browser.newContext();
      const resetPage = await resetContext.newPage();
      try {
        await resetPage.goto(localResetUrl.toString());
        await resetPage
          .getByRole("heading", { name: "Cambia tu contraseña" })
          .waitFor();
      } catch {
        throw new Error(
          "The local reset link did not reach the password reset form.",
        );
      }
      await resetPage
        .getByRole("textbox", { name: "Nueva contraseña", exact: true })
        .fill(newPassword);
      await resetPage
        .getByRole("textbox", {
          name: "Confirma la nueva contraseña",
          exact: true,
        })
        .fill(newPassword);
      await resetPage.getByRole("button", { name: "Guardar contraseña" }).click();
      await resetPage
        .getByRole("status")
        .getByText("Tu contraseña se actualizó.")
        .waitFor();
      await resetContext.close();

      const oldPasswordSignin = await api.post("/api/auth/sign-in/email", {
        data: { email, password },
      });
      assert.equal(oldPasswordSignin.ok(), false);
      const signin = await api.post("/api/auth/sign-in/email", {
        data: { email, password: newPassword },
      });
      assert.equal(signin.ok(), true, `Signin failed: ${await signin.text()}`);

      const context = await browser.newContext({
        viewport: { width: 320, height: 640 },
      });
      const page = await context.newPage();
      await page.goto(orderContextUrl);
      const signInLink = page.getByRole("link", { name: "Inicia sesión" });
      const signInBounds = await signInLink.boundingBox();
      assert.ok(signInBounds && signInBounds.height >= 48);
      await signInLink.click();
      await page.getByLabel("Correo electrónico").fill(email);
      await page.getByLabel("Contraseña").fill(newPassword);
      let releaseSignin!: () => void;
      const signinGate = new Promise<void>((resolve) => { releaseSignin = resolve; });
      await page.route("**/api/auth/sign-in/email", async (route) => {
        await signinGate;
        await route.continue();
      }, { times: 1 });
      try {
        await page.getByRole("button", { name: "Iniciar sesión" }).click();
        const loading = page.getByRole("status").filter({ hasText: "Iniciando sesión…" });
        await expect(loading).toBeVisible();
        await expect(page.getByRole("button").filter({ has: loading })).toBeDisabled();
      } finally {
        releaseSignin();
      }
      await page.waitForURL(orderContextUrl);
      await page.getByRole("heading", { name: product.name }).waitFor();
      await page.getByText("Solicitud de compra", { exact: true }).waitFor();
      await expect(page.getByLabel("Cantidad que solicitas"))
        .toHaveAccessibleDescription("Disponible ahora: 5 Kilogramo (kg)");
      await expect(page.getByLabel("Cantidad que solicitas")).toHaveValue("5");
      await expect(page.getByText(/Valor estimado\s*\$\s*5\.000 COP/)).toBeVisible();
      await page.getByLabel("Cantidad que solicitas").fill("2,5");
      await expect(page.getByText(/Valor estimado\s*\$\s*2\.500 COP/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Volver al catálogo" }))
        .toHaveAttribute("href", catalogUrl.slice(baseURL.length));
      await page.goto(`${baseURL}/catalogo/${product.id}/pedido?unidad=KG&cantidad=5.001`);
      await expect(page.getByLabel("Cantidad que solicitas")).toHaveValue("");
      await expect(page.getByText(/La cantidad que buscaste supera lo disponible/)).toBeVisible();
      await page.getByRole("button", { name: "Usar cantidad disponible" }).click();
      await expect(page.getByLabel("Cantidad que solicitas")).toHaveValue("5");
      await expect(page.getByText(/Valor estimado\s*\$\s*5\.000 COP/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Solicitar producto" })).toBeEnabled();
      await expect(page).toHaveURL(`${baseURL}/catalogo/${product.id}/pedido?unidad=KG&cantidad=5.001`);
      await page.goto(`${baseURL}/catalogo/${product.id}/pedido?unidad=BULTO&cantidad=2`);
      await expect(page.getByLabel("Cantidad que solicitas")).toHaveValue("");
      await expect(page.getByRole("button", { name: "Usar cantidad disponible" })).toHaveCount(0);
      await page.goto(`${baseURL}/catalogo/${product.id}`);
      await expect(
        page.getByRole("link", { name: `Solicitar este producto: ${product.name}` }),
      ).toBeVisible();
      await expect(page.getByText("Fecha del precio no disponible")).toBeVisible();
      await page.getByRole("button", { name: "Guardar en favoritos" }).click();
      await expect(page.getByRole("button", { name: "Quitar de favoritos" })).toBeVisible();
      await page.getByRole("link", { name: "Ver mis favoritos" }).click();
      await expect(page.getByRole("heading", { name: "Mis favoritos" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Explorar catálogo" })).toBeVisible();
      await page.getByRole("link", { name: `Ver oferta de ${product.name}` }).click();
      await page.getByRole("button", { name: "Quitar de favoritos" }).click();
      await expect(page.getByRole("button", { name: "Guardar en favoritos" })).toBeVisible();
      await page.getByRole("link", { name: "Ver mis favoritos" }).click();
      await expect(page.getByText(/Aún no tienes productos favoritos disponibles/)).toBeVisible();
      await page.getByRole("link", { name: "Explorar catálogo" }).click();
      await expect(page).toHaveURL(`${baseURL}/catalogo`);
      assert.equal(
        await page.locator("html").evaluate(
          (root) => root.scrollWidth <= root.clientWidth,
        ),
        true,
        "The order form should fit a 320px viewport without horizontal scrolling.",
      );
      await page.goto(`${baseURL}/mi-cuenta`);
      await page
        .getByRole("heading", { name: "Mi cuenta" })
        .waitFor();
      await page
        .getByRole("link", { name: "Mis pedidos" })
        .waitFor();
      await page.goto(`${baseURL}/mi-cuenta/pedidos`);
      const buyerOrdersSection = page.getByRole("region", {
        name: "Solicitudes que enviaste",
      });
      await buyerOrdersSection
        .getByText("Aún no has solicitado productos.")
        .waitFor();
      await buyerOrdersSection
        .getByRole("link", { name: "Explorar el catálogo" })
        .waitFor();
      await page.goto(`${baseURL}/mi-cuenta/productos`);
      await expect(
        page,
        "A buyer should not access producer product management.",
      ).toHaveURL(`${baseURL}/mi-cuenta`);
      await page.goto(`${baseURL}/catalogo/${product.id}/pedido`);
      await page.getByRole("heading", { name: product.name }).waitFor();

      await producerPage.goto(`${baseURL}/mi-cuenta/productos/${product.id}/editar`);
      const inventoryUnit = producerPage.getByLabel("Unidad de medida");
      await expect(inventoryUnit).toBeEnabled();
      await inventoryUnit.selectOption("BULTO");

      const requestedQuantity = page.getByLabel("Cantidad que solicitas");
      await requestedQuantity.fill("2,5");
      await expect(page.getByText(/Valor estimado\s*\$\s*2\.500 COP/)).toBeVisible();
      const pricePage = await producerContext.newPage();
      await pricePage.setViewportSize({ width: 320, height: 640 });
      await pricePage.goto(`${baseURL}/mi-cuenta/productos`);
      const priceCard = pricePage.getByRole("listitem").filter({ hasText: product.name });
      await priceCard.getByText("Cambiar precio", { exact: true }).click();
      const quickPrice = priceCard.getByLabel("Precio en pesos por Kilogramo (kg)");
      await quickPrice.fill("0");
      await priceCard.getByRole("button", { name: "Guardar precio" }).click();
      await expect(quickPrice).toHaveAttribute("aria-invalid", "true");
      await quickPrice.fill("1.250");
      await priceCard.getByRole("button", { name: "Guardar precio" }).click();
      await expect(priceCard.getByRole("status").getByText("Guardamos el precio.")).toBeVisible();
      await expect(priceCard).toContainText(/Precio por unidad\s*\$\s*1\.250/);
      await page.getByRole("button", { name: "Solicitar producto" }).click();
      await expect(page.getByText(/La oferta cambió/)).toBeVisible();
      await expect(requestedQuantity).toHaveValue("2,5");
      await expect(page.getByText(/Valor estimado\s*\$\s*3\.125 COP/)).toBeVisible();
      assert.equal(await database.order.count({
        where: { buyerId: buyer.id, productId: product.id },
      }), 0);

      const form = page.locator("form");
      const idempotencyKey = await form
        .locator('input[name="idempotencyKey"]')
        .inputValue();
      assert.match(idempotencyKey, /^[A-Za-z0-9_-]{43}$/);
      await requestedQuantity.fill("6,5");
      await expect(page.getByText("Valor estimado", { exact: false })).toHaveCount(0);
      await page.getByRole("button", { name: "Solicitar producto" }).click();
      await expect(page.getByText(/No pudimos reservar esa cantidad/)).toBeVisible();
      await expect(requestedQuantity).toHaveValue("6,5");
      await requestedQuantity.fill("2");

      const isServerAction = (request: Request) =>
        request.method() === "POST" && Boolean(request.headers()["next-action"]);
      const firstAction = page.waitForRequest(isServerAction);
      await page.getByRole("button", { name: "Solicitar producto" }).click();
      const firstRequest = await firstAction;
      assert.ok(firstRequest.postData()?.includes(idempotencyKey));
      await page
        .getByRole("status")
        .getByText("El pedido quedó registrado.")
        .waitFor();
      const firstResponse = await firstRequest.response();
      assert.ok(firstResponse);

      const firstOrder = await database.order.findFirstOrThrow({
        where: { buyerId: buyer.id, productId: product.id },
        include: { history: true },
      });
      assert.equal(firstOrder.history.length, 1);
      assert.ok(firstOrder.requestedQuantity.equals("2"));

      const firstInventory = await database.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      assert.ok(firstInventory.availableQuantity.equals("3"));
      assert.ok(firstInventory.reservedQuantity.equals("2"));
      await producerPage.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(producerPage.getByText(
        "Responde los pedidos pendientes antes de cambiar la unidad de medida.",
        { exact: true },
      )).toBeVisible();
      assert.equal((await database.product.findUniqueOrThrow({
        where: { id: product.id },
      })).unit, "KG");

      const requestBody = firstRequest.postDataBuffer();
      assert.ok(requestBody);
      const firstRequestHeaders = await firstRequest.allHeaders();
      const replayHeaders = Object.fromEntries(
        Object.entries(firstRequestHeaders).filter(([name]) =>
          [
            "accept",
            "content-type",
            "next-action",
            "next-router-state-tree",
            "next-url",
            "origin",
            "referer",
            "rsc",
          ].includes(name),
        ),
      );
      const replayResponse = await api.post(firstRequest.url(), {
        data: requestBody,
        headers: replayHeaders,
        maxRedirects: 0,
      });
      const trackingHref = `/mi-cuenta/pedidos?registrada=${firstOrder.id}#solicitud-${firstOrder.id}`;
      assert.ok([200, 303].includes(firstResponse.status()));
      assert.equal((await firstResponse.headerValue("x-action-redirect"))?.split(";")[0], trackingHref);
      assert.ok([200, 303].includes(replayResponse.status()));
      assert.equal(replayResponse.headers()["x-action-redirect"]?.split(";")[0], trackingHref);

      assert.equal(
        await database.order.count({
          where: { buyerId: buyer.id, productId: product.id },
        }),
        1,
      );
      const replayedOrder = await database.order.findFirstOrThrow({
        where: { buyerId: buyer.id, productId: product.id },
        include: { history: true },
      });
      assert.equal(replayedOrder.id, firstOrder.id);
      assert.equal(replayedOrder.producerId, producer.id);
      assert.equal(replayedOrder.history.length, 1);
      const replayedInventory = await database.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      assert.ok(replayedInventory.availableQuantity.equals("3"));
      assert.ok(replayedInventory.reservedQuantity.equals("2"));

      await expect(page.getByRole("button", { name: "Solicitar producto" })).toHaveCount(0);
      await page.waitForURL(`${baseURL}${trackingHref}`);
      await expect(page.locator(`[id="solicitud-${firstOrder.id}"]`)
        .getByRole("heading", { name: product.name, exact: true })).toBeInViewport();
      await expect(page.getByText("2 Kilogramo (kg)", { exact: true })).toBeVisible();
      await quickPrice.fill("1500");
      await priceCard.getByRole("button", { name: "Guardar precio" }).click();
      await expect(priceCard).toContainText(/Precio por unidad\s*\$\s*1\.500/);
      await pricePage.close();
      await page.reload();
      await expect(page.getByText(/\$\s*2\.500 COP/)).toBeVisible();
      await page
        .getByText("El productor debe revisar la solicitud.")
        .waitFor();
      await page
        .getByRole("list", { name: "Seguimiento de tu solicitud" })
        .getByText("Respuesta del productor")
        .waitFor();
      await page
        .getByRole("list", { name: "Seguimiento de tu solicitud" })
        .getByText("Esperando respuesta")
        .waitFor();

      await producerPage.goto(`${baseURL}/mi-cuenta/productos`);
      const inventoryCard = producerPage.getByRole("listitem").filter({ hasText: product.name });
      await expect(inventoryCard).toContainText(/Disponible para nuevos pedidos\s*3 Kilogramo/);
      await expect(inventoryCard).toContainText(/Reservado en pedidos pendientes\s*2 Kilogramo/);
      await inventoryCard.getByText("Cambiar cantidad disponible", { exact: true }).click();
      await inventoryCard.getByLabel("Cantidad disponible en Kilogramo (kg)").fill("999999999,999");
      await inventoryCard.getByRole("button", { name: "Guardar cantidad" }).click();
      await expect(inventoryCard.getByRole("alert")).toContainText("supera el límite de inventario");
      await expect(inventoryCard).toContainText(/Disponible para nuevos pedidos\s*3 Kilogramo/);
      await inventoryCard.getByRole("link", { name: "Editar producto" }).click();
      await expect(producerPage.getByText("Reservado en pedidos pendientes", { exact: true }))
        .toBeVisible();
      await expect(producerPage.getByText("2 Kilogramo (kg)", { exact: true })).toBeVisible();
      await expect(producerPage.getByLabel("Cantidad disponible", { exact: true })).toHaveValue("3");
      await expect(inventoryUnit).toBeDisabled();
      await producerPage.goto(`${baseURL}/mi-cuenta`);
      await producerPage.getByRole("link", { name: "Responder 1 pedido" }).click();
      await expect(producerPage).toHaveURL(`${baseURL}/mi-cuenta/pedidos#pedidos-por-responder`);
      await expect(
        producerPage.getByText("2 Kilogramo (kg)", { exact: true }),
      ).toBeVisible();
      await expect(producerPage.getByText(/\$\s*2\.500 COP/)).toBeVisible();
      await producerPage
        .getByRole("heading", { name: "Solicitudes recibidas" })
        .waitFor();
      const pendingProducerRequests = producerPage.getByRole("region", { name: "Por responder" });
      await expect(pendingProducerRequests.getByRole("heading", { name: "Por responder" })).toBeInViewport();
      await producerPage.getByRole("link", { name: "Avisos de pedidos" }).click();
      await expect(producerPage.getByRole("heading", { name: "Solicitud por responder" })).toBeVisible();
      await producerPage.getByRole("link", { name: /Abrir pedido.*Solicitud por responder/ }).click();
      await expect(producerPage).toHaveURL(/#recibida-/);
      const answeredProducerRequests = producerPage.getByRole("region", { name: "Ya respondidas" });
      const acceptOrder = pendingProducerRequests.getByRole("button", { name: "Aceptar pedido" });
      await expect(pendingProducerRequests.getByText("Coordinar entrega")).toHaveCount(0);
      await acceptOrder.click();
      await pendingProducerRequests.getByRole("button", { name: "Dejar pendiente" }).click();
      await expect(acceptOrder).toBeFocused();
      await expect(pendingProducerRequests.getByText("Esperando respuesta")).toBeVisible();
      await acceptOrder.click();
      await pendingProducerRequests.getByRole("button", { name: "Confirmar aceptación" }).click();
      await producerPage
        .getByRole("list", { name: "Seguimiento de la solicitud recibida" })
        .getByText("Tu respuesta")
        .waitFor();
      await answeredProducerRequests
        .getByRole("list", { name: "Seguimiento de la solicitud recibida" })
        .getByText("Aceptado")
        .waitFor();
      await expect(pendingProducerRequests).toContainText("No tienes solicitudes por responder.");
      await answeredProducerRequests.getByText("Coordinar entrega", { exact: true }).click();
      const producerSummary = answeredProducerRequests.getByRole("textbox", { name: "Resumen del pedido" });
      await expect(producerSummary).toHaveValue(/Cantidad: 2 Kilogramo \(kg\)/);
      const summary = await producerSummary.inputValue();
      await producerPage.getByRole("link", { name: "Volver a mi cuenta" }).click();
      const receivedOrders = producerPage.getByRole("link", { name: "Ver pedidos recibidos" });
      await expect(receivedOrders).toHaveAttribute("href", "/mi-cuenta/pedidos#pedidos-recibidos");
      await receivedOrders.click();
      await expect(producerPage.getByRole("heading", { name: "Solicitudes recibidas" })).toBeInViewport();
      const acceptedOrder = await database.order.findFirstOrThrow({
        where: { buyerId: buyer.id, productId: product.id },
        include: { history: true },
      });
      assert.equal(acceptedOrder.status, "ACCEPTED");
      assert.equal(acceptedOrder.history.length, 2);
      await answeredProducerRequests.getByText("Registrar datos de entrega", { exact: true }).click();
      await answeredProducerRequests.getByLabel("Forma de entrega").selectOption("SHIPPING");
      await answeredProducerRequests.getByLabel("Cuándo").fill("Viernes, de 8 a 10 a. m.");
      await answeredProducerRequests.getByLabel("Lugar acordado").fill("Bodega local de prueba");
      await answeredProducerRequests.getByLabel("Costo de entrega en pesos").fill("750");
      await answeredProducerRequests.getByRole("button", { name: "Guardar datos de entrega" }).click();
      await expect(answeredProducerRequests.getByText("Guardamos los datos de entrega del pedido.")).toBeVisible();
      const sellerPhone = answeredProducerRequests.getByLabel("WhatsApp del vendedor");
      await sellerPhone.fill("123");
      await answeredProducerRequests.getByRole("button", { name: "Compartir WhatsApp" }).click();
      await expect(answeredProducerRequests.getByRole("alert")).toHaveText("Escribe un celular colombiano de 10 dígitos.");
      await sellerPhone.fill("+57 300 000 0000");
      await answeredProducerRequests.getByRole("button", { name: "Compartir WhatsApp" }).click();
      await expect(answeredProducerRequests.getByRole("status").filter({ hasText: "Compartimos el WhatsApp" })).toBeVisible();
      await expect(answeredProducerRequests.getByText(acceptedOrder.id, { exact: true })).toBeVisible();
      assert.ok(summary.includes(`Referencia: ${acceptedOrder.id}\n`));
      const acceptance = acceptedOrder.history.find(
        (event) => event.toStatus === "ACCEPTED",
      );
      assert.ok(acceptance);
      const colombianTime = new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      });
      assert.ok(summary.includes(`Solicitud: ${colombianTime.format(acceptedOrder.createdAt)} (hora de Colombia)`));

      await page.goto(`${baseURL}/mi-cuenta/avisos`);
      await expect(page.getByRole("heading", { name: "Aceptaron tu solicitud" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Solicitud por responder" })).toHaveCount(0);
      await page.getByRole("link", { name: /Abrir pedido.*Aceptaron tu solicitud/ }).click();
      await expect(page).toHaveURL(`${baseURL}/mi-cuenta/pedidos#solicitud-${acceptedOrder.id}`);
      await page
        .getByText("El productor aceptó esta solicitud.")
        .waitFor();
      await page.getByText("Coordinar entrega", { exact: true }).click();
      const delivery = page.getByRole("region", { name: "Datos de entrega" });
      await expect(delivery.getByText("Bodega local de prueba")).toBeVisible();
      await expect(delivery).toContainText(/Total estimado con entrega\s*\$\s*3\.250 COP/);
      await expect(page.getByText("Actualizar datos de entrega", { exact: true })).toHaveCount(0);
      await delivery.getByRole("button", { name: "Confirmar datos de entrega" }).click();
      await expect(delivery.getByText("Datos confirmados por el comprador.")).toBeVisible();
      await producerPage.reload();
      await expect(producerPage.getByText("Datos confirmados por el comprador.")).toBeVisible();
      await producerPage.getByText("Configurar pago del pedido", { exact: true }).click();
      await producerPage.getByLabel("Forma de pago", { exact: true }).selectOption("TRANSFER");
      await producerPage.getByRole("button", { name: "Guardar forma de pago" }).click();
      await expect(producerPage.getByRole("region", { name: "Forma de pago acordada" }).getByText("Transferencia directa", { exact: true })).toBeVisible();
      await page.reload();
      const paymentInstructions = page.getByRole("region", { name: "Forma de pago acordada" });
      await expect(paymentInstructions.getByText("Transferencia directa", { exact: true })).toBeVisible();
      await producerPage.getByLabel("Forma de pago", { exact: true }).selectOption("ON_DELIVERY");
      await producerPage.getByRole("button", { name: "Guardar forma de pago" }).click();
      await expect(producerPage.getByRole("region", { name: "Forma de pago acordada" }).getByText("Pago contra entrega", { exact: true })).toBeVisible();
      await page.reload();
      await expect(paymentInstructions.getByText("Pago contra entrega", { exact: true })).toBeVisible();
      await producerPage.getByLabel("Forma de pago", { exact: true }).selectOption("WOMPI");
      await producerPage.getByLabel("Enlace de Wompi").fill("https://checkout.wompi.co.example.test/l/TEST");
      await producerPage.getByRole("checkbox", { name: /El enlace es de mi comercio/ }).check();
      await producerPage.getByRole("button", { name: "Guardar forma de pago" }).click();
      await expect(producerPage.getByText(/Pega un enlace oficial de Wompi/)).toBeVisible();
      const fakeWompiLink = "https://checkout.wompi.co/l/VPOS_LOCAL_TEST";
      await producerPage.getByLabel("Enlace de Wompi").fill(fakeWompiLink);
      await producerPage.getByRole("checkbox", { name: /El enlace es de mi comercio/ }).check();
      await producerPage.getByRole("button", { name: "Guardar forma de pago" }).click();
      await expect(producerPage.getByText("Guardamos las instrucciones de pago.")).toBeVisible();
      await page.reload();
      const wompiPay = page.getByRole("link", { name: "Pagar en Wompi" });
      await expect(wompiPay).toHaveAttribute("href", fakeWompiLink);
      await producerPage.getByText("Actualizar datos de entrega", { exact: true }).click();
      await producerPage.getByLabel("Costo de entrega en pesos").fill("900");
      await producerPage.getByRole("button", { name: "Guardar datos de entrega" }).click();
      await expect(producerPage.getByText("Pendiente de confirmación del comprador.")).toBeVisible();
      await page.reload();
      await expect(wompiPay).toHaveCount(0);
      await expect(delivery.getByRole("button", { name: "Confirmar datos de entrega" })).toBeVisible();
      await expect(delivery).toContainText(/Total estimado con entrega\s*\$\s*3\.400 COP/);
      await expect(delivery.getByLabel("Califica al vendedor")).toHaveCount(0);
      await delivery.getByRole("button", { name: "Confirmar datos de entrega" }).click();
      await expect(wompiPay).toHaveCount(0);
      await expect(delivery.getByText("Datos confirmados por el comprador.")).toBeVisible();
      await producerPage.reload();
      await producerPage.getByText("Configurar pago del pedido", { exact: true }).click();
      await producerPage.getByLabel("Forma de pago", { exact: true }).selectOption("TRANSFER");
      await producerPage.getByRole("button", { name: "Guardar forma de pago" }).click();
      const sellerPayment = producerPage.getByRole("region", { name: "Forma de pago acordada" });
      await sellerPayment.getByText("Ya recibí el pago", { exact: true }).click();
      await sellerPayment.getByLabel("Referencia de pago (opcional)").fill("BANK-TEST_123");
      await sellerPayment.getByRole("button", { name: "Confirmar pago recibido" }).click();
      await expect(producerPage.getByRole("region", { name: "Pago confirmado", exact: true })).toContainText(/3\.400 COP/);
      await expect(producerPage.getByRole("region", { name: "Pago confirmado", exact: true })).toContainText("BANK-TEST_123");
      await page.reload();
      await expect(page.getByRole("region", { name: "Pago confirmado", exact: true })).toContainText(/Transferencia directa.*3\.400 COP/);
      await expect(page.getByRole("region", { name: "Pago confirmado", exact: true })).toContainText("BANK-TEST_123");
      await expect(page.getByRole("button", { name: "Confirmar pago recibido" })).toHaveCount(0);
      await delivery.getByText("Ya recibí el pedido", { exact: true }).click();
      await delivery.getByRole("button", { name: "Confirmar recepción" }).click();
      await expect(delivery.getByText(/Pedido recibido el/)).toBeVisible();
      await delivery.getByLabel("Califica al vendedor").selectOption("5");
      await delivery.getByRole("button", { name: "Guardar calificación" }).click();
      await expect(delivery.getByText("Tu calificación: 5 de 5.")).toBeVisible();
      await expect(delivery.getByRole("button", { name: "Guardar calificación" })).toHaveCount(0);
      const ratedProfile = await context.newPage();
      await ratedProfile.goto(publicProfileUrl);
      await expect(ratedProfile.getByText(/5 de 5.*1 calificación de pedidos recibidos/)).toBeVisible();
      await ratedProfile.close();
      await page.getByText("Coordinar entrega", { exact: true }).click();
      const whatsapp = page.getByRole("link", { name: "Hablar con el vendedor por WhatsApp" });
      await expect(whatsapp).toHaveAttribute("href", /^https:\/\/wa\.me\/573000000000\?text=/);
      assert.ok((await whatsapp.getAttribute("href"))?.includes(acceptedOrder.id));
      await expect(page.getByText(acceptedOrder.id, { exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Resumen del pedido" })).toHaveValue(summary);
      assert.match(summary, /Precio por unidad al solicitar: \$\s*1\.250 COP/);
      assert.match(summary, /Valor estimado al solicitar: \$\s*2\.500 COP/);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      await page.getByRole("button", { name: "Copiar resumen" }).click();
      await expect(
        page.getByText("Resumen copiado.", { exact: true }),
      ).toBeVisible();
      const copiedSummary = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(copiedSummary.replaceAll("\r\n", "\n"), summary);
      await producerPage.getByRole("button", { name: "Retirar número" }).click();
      await expect(producerPage.getByText("Retiramos el número compartido.")).toBeVisible();
      await page.reload();
      await expect(whatsapp).toHaveCount(0);
      await page
        .getByRole("list", { name: "Seguimiento de tu solicitud" })
        .getByText("Respuesta del productor")
        .waitFor();
      await page
        .getByRole("list", { name: "Seguimiento de tu solicitud" })
        .getByText("Aceptado")
        .waitFor();
      await expect(
        page.getByRole("list", { name: "Seguimiento de tu solicitud" }).locator("time"),
      ).toHaveText([
        colombianTime.format(acceptedOrder.createdAt),
        colombianTime.format(acceptance.createdAt),
      ]);

      await expect(producerPage.getByRole("link", { name: "Volver a solicitar con el precio actual" })).toHaveCount(0);
      await page.getByRole("link", { name: "Volver a solicitar con el precio actual" }).click();
      await expect(page).toHaveURL(`${baseURL}/catalogo/${product.id}/pedido`);
      await expect(page.getByLabel("Cantidad que solicitas")).toHaveValue("");
      await expect(page.getByText(/\$\s*1\.500/)).toBeVisible();
      await page.getByLabel("Cantidad que solicitas").fill("1");
      await page.getByRole("button", { name: "Solicitar producto" }).click();
      await page
        .getByRole("status")
        .getByText("El pedido quedó registrado.")
        .waitFor();

      await producerPage.reload();
      await expect(pendingProducerRequests.getByRole("button", { name: "Rechazar pedido" }))
        .toBeVisible();
      await expect(answeredProducerRequests.getByText("Aceptado", { exact: true })).toBeVisible();
      const rejectOrder = pendingProducerRequests.getByRole("button", { name: "Rechazar pedido" });
      await rejectOrder.click();
      await expect(pendingProducerRequests.getByText(/la cantidad reservada vuelve a estar disponible/))
        .toBeVisible();
      await pendingProducerRequests.getByRole("button", { name: "Dejar pendiente" }).click();
      await expect(rejectOrder).toBeFocused();
      await producerPage
        .getByRole("list", { name: "Seguimiento de la solicitud recibida" })
        .first()
        .getByText("Tu respuesta")
        .waitFor();
      await producerPage
        .getByRole("list", { name: "Seguimiento de la solicitud recibida" })
        .first()
        .getByText("Esperando respuesta")
        .waitFor();

      let rejectedOrder = await database.order.findFirstOrThrow({
        where: { buyerId: buyer.id, productId: product.id, status: "PENDING" },
        include: { history: true },
      });
      assert.equal(rejectedOrder.history.length, 1);
      const rejectedOrderId = rejectedOrder.id;
      let reservedInventory = await database.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      assert.ok(reservedInventory.availableQuantity.equals("2"));
      assert.ok(reservedInventory.reservedQuantity.equals("1"));

      await rejectOrder.click();
      await pendingProducerRequests.getByRole("button", { name: "Confirmar rechazo" }).click();
      await producerPage
        .getByRole("list", { name: "Seguimiento de la solicitud recibida" })
        .first()
        .getByText("Tu respuesta")
        .waitFor();
      await producerPage
        .getByRole("list", { name: "Seguimiento de la solicitud recibida" })
        .first()
        .getByText("Rechazado")
        .waitFor();
      await producerPage
        .getByText(
          "La solicitud fue rechazada y la cantidad reservada volvió a estar disponible.",
        )
        .waitFor();
      rejectedOrder = await database.order.findFirstOrThrow({
        where: { id: rejectedOrderId },
        include: { history: true },
      });
      assert.equal(rejectedOrder.status, "REJECTED");
      assert.equal(rejectedOrder.history.length, 2);
      reservedInventory = await database.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      assert.ok(reservedInventory.availableQuantity.equals("3"));
      assert.ok(reservedInventory.reservedQuantity.equals("0"));
      await answeredProducerRequests.getByRole("link", { name: "Aceptadas" }).click();
      await expect(answeredProducerRequests.getByText("Aceptado", { exact: true })).toBeVisible();
      await expect(answeredProducerRequests.getByText("Rechazado", { exact: true })).toHaveCount(0);
      const answeredProduct = answeredProducerRequests.getByLabel("Nombre del producto o referencia del pedido");
      const searchAnswered = answeredProducerRequests.getByRole("button", { name: "Buscar en respondidas" });
      await answeredProduct.fill("Producto inexistente");
      await searchAnswered.click();
      await expect(answeredProducerRequests.getByText(/No encontramos solicitudes respondidas/)).toBeVisible();
      await answeredProduct.fill(product.name.toUpperCase());
      await searchAnswered.click();
      await expect(answeredProducerRequests.getByText("Aceptado", { exact: true })).toBeVisible();
      await answeredProducerRequests.getByRole("link", { name: "Rechazadas" }).click();
      await expect(answeredProduct).toHaveValue(product.name.toUpperCase());
      await expect(answeredProducerRequests.getByText("Rechazado", { exact: true })).toBeVisible();
      await expect(answeredProducerRequests.getByText("Aceptado", { exact: true })).toHaveCount(0);
      await answeredProducerRequests.getByRole("link", { name: "Todas" }).click();
      await expect(answeredProducerRequests.getByText("Aceptado", { exact: true })).toBeVisible();
      await expect(answeredProducerRequests.getByText("Rechazado", { exact: true })).toBeVisible();
      await answeredProduct.fill(` ${acceptedOrder.id} `);
      await searchAnswered.click();
      await expect(answeredProducerRequests.getByText(acceptedOrder.id, { exact: true })).toBeVisible();
      await expect(answeredProducerRequests.getByText(rejectedOrderId, { exact: true })).toHaveCount(0);
      await answeredProducerRequests.getByRole("link", { name: "Limpiar filtros de respondidas" }).click();
      await expect(producerPage).toHaveURL(`${baseURL}/mi-cuenta/pedidos#pedidos-respondidos`);
      await expect(answeredProduct).toHaveValue("");
      await expect(answeredProducerRequests.getByText(rejectedOrderId, { exact: true })).toBeVisible();
      await producerPage.goto(`${baseURL}/mi-cuenta/productos`);
      await expect(inventoryCard).toContainText(/Disponible para nuevos pedidos\s*3 Kilogramo/);
      await expect(inventoryCard.getByText("Reservado en pedidos pendientes")).toHaveCount(0);

      await page.goto(`${baseURL}/mi-cuenta/pedidos`);
      await page.getByText("El productor rechazó esta solicitud.").waitFor();
      await page
        .getByRole("list", { name: "Seguimiento de tu solicitud" })
        .first()
        .getByText("Respuesta del productor")
        .waitFor();
      await page
        .getByRole("list", { name: "Seguimiento de tu solicitud" })
        .first()
        .getByText("Rechazado")
        .waitFor();

      const statusFilter = page.getByLabel("Estado de la solicitud");
      const filterButton = page.getByRole("button", { name: "Filtrar solicitudes" });
      await statusFilter.selectOption("ACCEPTED");
      await filterButton.click();
      await expect(page.locator(`[id="solicitud-${acceptedOrder.id}"]`)).toBeVisible();
      await expect(page.locator(`[id="solicitud-${rejectedOrderId}"]`)).toHaveCount(0);
      await page.getByRole("link", { name: "Limpiar filtros de enviadas" }).click();
      await expect(page).toHaveURL(`${baseURL}/mi-cuenta/pedidos#solicitudes-enviadas`);
      await expect(page.locator(`[id="solicitud-${rejectedOrderId}"]`)).toBeVisible();
      await statusFilter.selectOption("PENDING");
      await filterButton.click();
      await expect(page.getByText("No tienes solicitudes en este estado.")).toBeVisible();
      await statusFilter.selectOption("");
      await filterButton.click();
      await expect(page.locator(`[id="solicitud-${rejectedOrderId}"]`)).toBeVisible();
      const buyerReference = page.getByLabel("Referencia del pedido", { exact: true });
      await buyerReference.fill(` ${acceptedOrder.id} `);
      await filterButton.click();
      await expect(page.locator(`[id="solicitud-${acceptedOrder.id}"]`)).toBeVisible();
      await expect(page.locator(`[id="solicitud-${rejectedOrderId}"]`)).toHaveCount(0);

      await page.goto(`${baseURL}/catalogo/${product.id}/pedido`);
      await page.getByLabel("Cantidad que solicitas").fill("3");
      await page.getByRole("button", { name: "Solicitar producto" }).click();
      await page.waitForURL(/\/mi-cuenta\/pedidos\?registrada=[^#]+#solicitud-/);
      await expect(page.locator(`[id="${new URL(page.url()).hash.slice(1)}"]`))
        .toContainText("Esperando respuesta");
      const exhaustedInventory = await database.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      assert.ok(exhaustedInventory.availableQuantity.equals("0"));
      const exportPath = "/mi-cuenta/pedidos/aceptados.csv";
      assert.equal((await page.request.get(`${baseURL}${exportPath}`)).status(), 403);
      const exportFixture = {
        buyerId: buyer.id,
        producerId: producer.id,
        productName: '=1+1;"Papa"',
        requestedQuantity: "2.5",
        unit: "KG",
        priceCOP: 1200,
        status: "ACCEPTED" as const,
        decidedAt: new Date("2026-11-19T05:00:00Z"),
      };
      const formulaOrder = await database.order.create({ data: exportFixture });
      const previousDay = await database.order.create({
        data: { ...exportFixture, decidedAt: new Date("2026-11-19T04:59:59.999Z") },
      });
      const followingDay = await database.order.create({
        data: { ...exportFixture, decidedAt: new Date("2026-11-20T05:00:00Z") },
      });
      const otherProducerOrder = await database.order.create({
        data: { ...exportFixture, producerId: buyer.id, buyerId: producer.id },
      });
      await producerPage.goto(`${baseURL}/mi-cuenta/pedidos`);
      const downloaded = producerPage.waitForEvent("download");
      await producerPage.getByRole("link", { name: "Descargar todos los pedidos aceptados (CSV)" }).click();
      const download = await downloaded;
      assert.equal(download.suggestedFilename(), "pedidos-aceptados.csv");
      const report = await readFile(await download.path(), "utf8");
      assert.ok(report.startsWith("\uFEFFReferencia;Producto;Cantidad;Unidad;"));
      assert.ok(report.includes(`"${acceptedOrder.id}";"${product.name}";2;"Kilogramo (kg)";1250;2500;`));
      assert.ok(report.includes(`"${formulaOrder.id}";"'=1+1;""Papa""";2,5;`));
      assert.ok(!report.includes(otherProducerOrder.id));
      assert.ok(!report.includes(rejectedOrderId));
      assert.ok(!report.includes(new URL(page.url()).hash.slice("#solicitud-".length)));
      await producerPage.getByLabel("Desde", { exact: true }).fill("2026-11-19");
      await producerPage.getByLabel("Hasta", { exact: true }).fill("2026-11-19");
      const datedDownload = producerPage.waitForEvent("download");
      await producerPage.getByRole("button", { name: "Descargar por fechas (CSV)" }).click();
      const datedReport = await readFile(await (await datedDownload).path(), "utf8");
      assert.ok(datedReport.includes(formulaOrder.id));
      assert.ok(!datedReport.includes(previousDay.id));
      assert.ok(!datedReport.includes(followingDay.id));
      await database.order.create({ data: { ...exportFixture, requestedQuantity: "0.125" } });
      await database.order.create({ data: { ...exportFixture, unit: "BULTO" } });
      const consolidatedDownload = producerPage.waitForEvent("download");
      await producerPage.getByRole("button", { name: "Descargar cantidades para despacho (CSV)" }).click();
      const consolidated = await consolidatedDownload;
      assert.equal(consolidated.suggestedFilename(), "cantidades-para-despacho.csv");
      const consolidatedReport = await readFile(await consolidated.path(), "utf8");
      assert.ok(consolidatedReport.includes(`"'=1+1;""Papa""";2,625;"Kilogramo (kg)";2\r\n`));
      assert.ok(consolidatedReport.includes(`"'=1+1;""Papa""";2,5;"Bulto";1\r\n`));
      await producerPage.getByRole("link", { name: "Ver cantidades para despacho" }).click();
      await expect(producerPage.getByRole("heading", { name: "Cantidades para despacho" })).toBeVisible();
      const dispatchToday = getColombianAgendaDate(new Date());
      await producerPage.getByRole("link", { name: "Hoy", exact: true }).click();
      await expect(producerPage.getByLabel("Desde", { exact: true })).toHaveValue(dispatchToday);
      await expect(producerPage.getByLabel("Hasta", { exact: true })).toHaveValue(dispatchToday);
      await producerPage.getByRole("link", { name: "Últimos 7 días" }).click();
      const dispatchStart = new Date(`${dispatchToday}T00:00:00Z`);
      dispatchStart.setUTCDate(dispatchStart.getUTCDate() - 6);
      await expect(producerPage.getByLabel("Desde", { exact: true })).toHaveValue(dispatchStart.toISOString().slice(0, 10));
      await producerPage.getByRole("link", { name: "Todas las fechas", exact: true }).click();
      await expect(producerPage.getByLabel("Desde", { exact: true })).toHaveValue("");
      await producerPage.getByLabel("Desde", { exact: true }).fill("2026-11-19");
      await producerPage.getByLabel("Hasta", { exact: true }).fill("2026-11-19");
      await producerPage.getByRole("button", { name: "Consultar", exact: true }).click();
      await expect(producerPage.getByText("2,625 Kilogramo (kg)", { exact: true })).toBeVisible();
      await expect(producerPage.getByText("2,5 Bulto", { exact: true })).toBeVisible();
      await expect(producerPage.getByRole("link", { name: "Descargar estas cantidades (CSV)" }))
        .toHaveAttribute("href", `${exportPath}?formato=consolidado&desde=2026-11-19&hasta=2026-11-19`);
      await producerPage.evaluate(() => {
        window.print = () => { document.body.dataset.printRequested = "true"; };
      });
      await producerPage.getByRole("button", { name: "Imprimir lista de empaque" }).click();
      await expect(producerPage.locator("body")).toHaveAttribute("data-print-requested", "true");
      await producerPage.emulateMedia({ media: "print" });
      await expect(producerPage.getByText(/Fechas de aceptación.*2026-11-19/)).toBeVisible();
      await expect(producerPage.getByText("2,625 Kilogramo (kg)", { exact: true })).toBeVisible();
      await expect(producerPage.getByText("2,5 Bulto", { exact: true })).toBeVisible();
      await expect(producerPage.getByRole("heading", { name: "Valor estimado de los pedidos aceptados" })).toBeHidden();
      await expect(producerPage.getByRole("button", { name: "Consultar" })).toBeHidden();
      await producerPage.emulateMedia({ media: "screen" });
      await producerPage.getByRole("link", { name: "Ver lista de empaque por pedido" }).click();
      const packingList = producerPage.getByRole("region", { name: "Lista de empaque por pedido" });
      await expect(producerPage.getByLabel("Desde", { exact: true })).toHaveValue("2026-11-19");
      await expect(packingList.getByText(`Referencia del pedido: ${formulaOrder.id}`, { exact: true })).toBeVisible();
      await expect(packingList.getByText(`Referencia del pedido: ${followingDay.id}`, { exact: true })).toHaveCount(0);
      await producerPage.emulateMedia({ media: "print" });
      await expect(packingList.getByText("2,5 Kilogramo (kg)", { exact: true })).toBeVisible();
      await producerPage.emulateMedia({ media: "screen" });
      await producerPage.getByRole("link", { name: "Ver cantidades agrupadas por producto" }).click();
      const kiloGroup = producerPage.getByText("2,625 Kilogramo (kg)", { exact: true }).locator("..");
      await kiloGroup.getByText("Ver pedidos de este total", { exact: true }).click();
      await expect(kiloGroup.getByRole("link", { name: /^Abrir pedido / })).toHaveCount(2);
      await expect(kiloGroup.getByText("Valor estimado: $ 3.000 COP", { exact: true })).toBeVisible();
      await expect(kiloGroup.getByText("Valor estimado: $ 150 COP", { exact: true })).toBeVisible();
      await expect(producerPage.getByRole("heading", { name: "Valor estimado de los pedidos aceptados" })).toBeVisible();
      await kiloGroup.getByRole("link", { name: `Abrir pedido ${formulaOrder.id}` }).click();
      const dispatchOrder = producerPage.getByRole("region", { name: "Ya respondidas" });
      await expect(dispatchOrder.getByText(formulaOrder.id, { exact: true })).toBeVisible();
      await expect(dispatchOrder.getByText(previousDay.id, { exact: true })).toHaveCount(0);
      const invalidRange = await producerPage.request.get(`${baseURL}${exportPath}?desde=2026-11-20&hasta=2026-11-19`);
      assert.equal(invalidRange.status(), 400);
      const acceptedCard = page.locator(`[id="solicitud-${acceptedOrder.id}"]`);
      await expect(acceptedCard.getByText("La oferta original ya no está disponible.")).toBeVisible();
      await expect(acceptedCard.getByRole("link", { name: "Volver a solicitar con el precio actual" })).toHaveCount(0);
      await acceptedCard.getByRole("link", { name: "Buscar el producto en el catálogo" }).click();
      await expect(page.getByLabel("Nombre del producto")).toHaveValue(product.name);
      await page.getByRole("link", { name: product.name, exact: true }).click();
      await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
      await expect(page.getByText("0 Kilogramo (kg)", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Solicitar este producto: ${product.name}` }),
      ).toHaveCount(0);
      await expect(page.getByRole("status").filter({
        hasText: "Todo el stock está reservado en pedidos pendientes.",
      })).toBeVisible();
      await page.goto(`${baseURL}/catalogo/${product.id}/pedido`);
      await expect(
        page.getByText(
          "Todo el stock está reservado en pedidos pendientes. No puedes enviar una nueva solicitud hasta que haya disponibilidad libre.",
        ),
      ).toBeVisible();

      await producerPage.goto(`${baseURL}/mi-cuenta/perfil-vendedor`);
      await producerPage.getByRole("checkbox", { name: "Mostrar mi perfil en el catálogo" }).uncheck();
      await producerPage.getByRole("button", { name: "Guardar perfil" }).click();
      await expect(producerPage.getByText("Guardamos tu perfil como privado.")).toBeVisible();
      const hiddenProfile = await producerPage.request.get(publicProfileUrl);
      assert.equal(hiddenProfile.status(), 404);
      await page.goto(`${baseURL}/mi-cuenta`);
      await expect(page.getByRole("link", { name: "Comprar", exact: true })).toBeVisible();
      await expect(page.getByText("Puedes participar como")).toHaveCount(0);
      await page.getByRole("button", { name: "Vender productos" }).click();
      await expect(page).toHaveURL(`${baseURL}/mi-cuenta/productos`);
      await page.goto(`${baseURL}/mi-cuenta`);
      await expect(page.getByRole("link", { name: "Gestionar mis productos" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Comprar", exact: true })).toBeVisible();
      await producerContext.close();
      await context.close();
    } finally {
      await api.dispose();
    }
  } finally {
    await browser?.close();
    await producerApi?.dispose();
    if (server) await stopServer(server);
    await brevoStub?.close();
    if (fixtureUserIds.length > 0) {
      await database.user.deleteMany({
        where: { id: { in: fixtureUserIds } },
      });
    }
    await database.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
