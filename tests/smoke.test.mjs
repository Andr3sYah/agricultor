import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const nextCli = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const googleOAuthConfigured = Boolean(
  process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET,
);
const focusStyles = await readFile(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const orderRequestForm = await readFile(
  new URL("../src/features/orders/order-request-form.tsx", import.meta.url),
  "utf8",
);
const ordersPage = await readFile(
  new URL("../src/app/mi-cuenta/pedidos/page.tsx", import.meta.url),
  "utf8",
);
const orderDecisionForm = await readFile(
  new URL("../src/features/orders/order-decision-form.tsx", import.meta.url),
  "utf8",
);
const roleForm = await readFile(
  new URL("../src/features/auth/role-form.tsx", import.meta.url),
  "utf8",
);
const authForm = await readFile(
  new URL("../src/features/auth/auth-form.tsx", import.meta.url),
  "utf8",
);
const authConfig = await readFile(
  new URL("../src/lib/auth.ts", import.meta.url),
  "utf8",
);
const passwordResetForms = await readFile(
  new URL("../src/features/auth/password-reset-forms.tsx", import.meta.url),
  "utf8",
);
const catalogPage = await readFile(
  new URL("../src/app/catalogo/page.tsx", import.meta.url),
  "utf8",
);
const catalogLoading = await readFile(
  new URL("../src/app/catalogo/loading.tsx", import.meta.url),
  "utf8",
);
const catalogError = await readFile(
  new URL("../src/app/catalogo/error.tsx", import.meta.url),
  "utf8",
);
let server;
let serverError = "";
let url;

async function findAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, host, resolve);
  });

  const address = probe.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

before(async () => {
  const port = await findAvailablePort();
  url = `http://${host}:${port}`;
  server = spawn(
    process.execPath,
    [nextCli, "start", "--hostname", host, "--port", String(port)],
    {
      cwd: projectRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => {
    serverError = `${serverError}${chunk}`.slice(-4000);
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited before becoming ready.\n${serverError}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
      await response.body?.cancel();
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== "TimeoutError") {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Production server did not become ready in time.\n${serverError}`);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill();
  await once(server, "exit");
});

test("production home page offers one shared signup and a single sign-in link", async () => {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<html lang="es"/);
  assert.match(html, /Compra y vende productos del campo/);
  assert.match(html, /href="\/crear-cuenta">Crear cuenta<\/a>/);
  assert.equal([...html.matchAll(/href="\/crear-cuenta"/g)].length, 1);
  assert.match(html, /href="\/catalogo">Explorar el catálogo<\/a>/);
  assert.equal([...html.matchAll(/href="\/iniciar-sesion"/g)].length, 1);
  assert.match(html, /Consulta precios y cantidades sin registrarte/);
  assert.match(html, /href="\/iniciar-sesion">Inicia sesión<\/a>/);
  assert.match(html, /Mercado El Potrerillo/);
  assert.match(html, /mercado-potrerillo\.webp/);
  assert.match(
    html,
    /alt="Dos vendedoras atienden un puesto de frutas y verduras en la plaza de mercado\."/,
  );
  assert.doesNotMatch(
    html,
    /Crear cuenta para vender|Quiero comprar|Quiero vender|Elige cómo participar|intent=producer/,
  );
});

test("production serves the home page's public market image", async () => {
  const response = await fetch(`${url}/mercado-potrerillo.webp`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/webp/);
});

test("production serves the offline worker, policy, and app manifest", async () => {
  const [workerResponse, policyResponse, manifestResponse] = await Promise.all([
    fetch(`${url}/sw.js`),
    fetch(`${url}/offline-policy.js`),
    fetch(`${url}/manifest.webmanifest`),
  ]);
  assert.equal(workerResponse.status, 200);
  assert.equal(policyResponse.status, 200);
  assert.equal(manifestResponse.status, 200);

  const [worker, policy] = await Promise.all([
    workerResponse.text(),
    policyResponse.text(),
  ]);
  const manifest = await manifestResponse.json();
  assert.match(worker, /AgricultorOfflinePolicy/);
  assert.match(policy, /AgricultorOfflinePolicy/);
  assert.equal(manifest.name, "Agricultor");
  assert.equal(manifest.start_url, "/");
});

test("interactive controls expose a visible keyboard focus indicator", () => {
  assert.match(
    focusStyles,
    /:focus-visible\s*\{\s*outline:\s*3px solid #166534;\s*outline-offset:\s*3px;/,
  );
});

test("order quantity validation is linked to its invalid field", () => {
  assert.match(orderRequestForm, /aria-invalid=\{Boolean\(state\.fieldErrors\?\.quantity\)\}/);
  assert.match(orderRequestForm, /"order-quantity-availability order-quantity-error"/);
  assert.match(orderRequestForm, /id="order-quantity-availability"/);
  assert.match(orderRequestForm, /id="order-quantity-error"/);
});

test("action feedback distinguishes success statuses from errors", () => {
  assert.match(ordersPage, /role="status"/);
  assert.match(orderRequestForm, /role="alert"/);
  assert.match(orderDecisionForm, /role=\{state\.ok \? "status" : "alert"\}/);
  assert.match(roleForm, /role="alert"/);
});

test("catalog helps people recover from loading, filter, and connection problems", () => {
  assert.match(catalogLoading, /aria-busy="true"/);
  assert.match(catalogLoading, /Cargando el catálogo/);
  assert.match(catalogError, /Revisa tu conexión e inténtalo de nuevo/);
  assert.match(catalogError, /onClick=\{reset\}/);
  assert.match(catalogPage, /aria-describedby="municipio-ayuda"/);
  assert.match(catalogPage, /No encontramos productos con estos filtros/);
  assert.match(catalogPage, /Restablecer filtros y orden/);
  assert.match(catalogPage, /min-h-12 w-full/);
});

test("production registration page keeps labels associated with their fields", async () => {
  const response = await fetch(`${url}/crear-cuenta`);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<label[^>]*for="name"[^>]*>Nombre<\/label>/);
  assert.match(html, /<input[^>]*id="name"[^>]*name="name"/);
  assert.match(html, /<label[^>]*for="email"[^>]*>Correo electrónico<\/label>/);
  assert.match(html, /<input[^>]*id="email"[^>]*name="email"/);
  assert.match(html, /<label[^>]*for="password"[^>]*>Contraseña<\/label>/);
  assert.match(html, /<input[^>]*id="password"[^>]*name="password"/);
  assert.match(html, /Volver al inicio/);
  assert.match(html, /href="\/iniciar-sesion"/);
  assert.match(html, /¿Ya tienes cuenta\?/);
  assert.match(html, /min-h-12/);
});

test("producer registration keeps its intent through sign-in and selling", async () => {
  const signupResponse = await fetch(`${url}/crear-cuenta?intent=producer`);
  assert.equal(signupResponse.status, 200);
  const signupHtml = await signupResponse.text();
  assert.match(signupHtml, /Crea tu cuenta para vender/);
  assert.match(signupHtml, /selecciona Vender productos/);
  assert.match(signupHtml, /href="\/iniciar-sesion\?intent=producer"/);

  const signinResponse = await fetch(`${url}/iniciar-sesion?intent=producer`);
  assert.equal(signinResponse.status, 200);
  const signinHtml = await signinResponse.text();
  assert.match(signinHtml, /href="\/crear-cuenta\?intent=producer"/);
  assert.match(authForm, /\/mi-cuenta\?intent=producer/);
  assert.match(authForm, /Iniciar sesión para vender/);
  assert.match(roleForm, /Vender productos/);
});

test("successful registration replaces the form with clear next steps", () => {
  assert.match(authForm, /setRegistrationComplete\(true\)/);
  assert.match(authForm, /if \(isSignUp && registrationComplete\)/);
  assert.match(authForm, /Registro recibido/);
  assert.match(authForm, /Al abrir el enlace, iniciarás sesión automáticamente/);
  assert.match(authForm, /ResendVerificationForm/);
  assert.match(authForm, /Creando cuenta…/);
  assert.match(authForm, /href=\{signInHref\}/);
  assert.match(authForm, /role="status"/);
  assert.doesNotMatch(authForm, /Si el correo está disponible/);
  assert.match(authForm, /if \(redirectTo\) signInQuery\.set\("redirectTo", redirectTo\)/);
  assert.match(authForm, /if \(producerIntent\) signInQuery\.set\("intent", "producer"\)/);
});

test("Google sign-in is available with safe account linking and clear password recovery", () => {
  assert.match(authConfig, /process\.env\.OAUTH_CLIENT_ID/);
  assert.match(authConfig, /process\.env\.OAUTH_CLIENT_SECRET/);
  assert.match(authConfig, /autoSignIn: true/);
  assert.match(authConfig, /autoSignInAfterVerification: true/);
  assert.match(authConfig, /requireEmailVerification: true/);
  assert.match(
    authConfig,
    /accountLinking:\s*\{\s*enabled: true,\s*allowDifferentEmails: false,\s*updateUserInfoOnLink: false,/,
  );
  assert.match(
    authConfig,
    /google:\s*\{\s*clientId: googleClientId,\s*clientSecret: googleClientSecret,\s*requireEmailVerification: true/,
  );
  assert.doesNotMatch(authConfig, /trustedProviders/);
  assert.match(authForm, /authClient\.signIn\.social\(\{\s*provider: "google"/);
  assert.match(authForm, /callbackURL: postAuthDestination/);
  assert.match(authForm, /Continuar con Google/);
  assert.match(authForm, /Conectando con Google/);
  assert.match(authForm, /No pudimos iniciar sesión con Google/);
  assert.doesNotMatch(authConfig, /mapProfileToUser|overrideUserInfoOnSignIn:\s*true/);
  assert.match(authForm, /¿Olvidaste tu contraseña\?/);
  assert.match(authForm, /para crear una de forma segura/);
});

test("production sign-in page offers clear recovery and return navigation", async () => {
  const response = await fetch(`${url}/iniciar-sesion`);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Inicia sesión/);
  assert.match(html, /Volver al inicio/);
  assert.match(html, /¿Olvidaste tu contraseña\?/);
  assert.match(html, /href="\/recuperar-contrasena"/);
  assert.match(html, /href="\/crear-cuenta"/);
  assert.match(
    html,
    googleOAuthConfigured
      ? /Continuar con Google/
      : /El acceso con Google no está disponible/,
  );
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /min-h-12/);
});

test("production registration page reflects Google OAuth configuration", async () => {
  const response = await fetch(`${url}/crear-cuenta`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(
    html,
    googleOAuthConfigured
      ? /Continuar con Google/
      : /El acceso con Google no está disponible/,
  );
});

test("production sign-in preserves a validated order request through account creation", async () => {
  const response = await fetch(
    `${url}/iniciar-sesion?redirectTo=${encodeURIComponent(
      "/catalogo/product-1/pedido",
    )}`,
  );
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(
    html,
    /href="\/crear-cuenta\?redirectTo=%2Fcatalogo%2Fproduct-1%2Fpedido"/,
  );

  const unsafeResponse = await fetch(
    `${url}/iniciar-sesion?redirectTo=${encodeURIComponent(
      "https://example.com/",
    )}`,
  );
  assert.equal(unsafeResponse.status, 200);
  const unsafeHtml = await unsafeResponse.text();
  assert.match(unsafeHtml, /href="\/crear-cuenta"/);
  assert.doesNotMatch(unsafeHtml, /redirectTo=https:\/\/example\.com/);
});

test("production password recovery pages render without sending email", async () => {
  const [requestResponse, resetResponse, missingTokenResponse] = await Promise.all([
    fetch(`${url}/recuperar-contrasena`),
    fetch(`${url}/restablecer-contrasena?token=local-test-token`),
    fetch(`${url}/restablecer-contrasena`),
  ]);
  assert.equal(requestResponse.status, 200);
  assert.equal(resetResponse.status, 200);
  assert.equal(missingTokenResponse.status, 200);

  const [requestHtml, resetHtml, missingTokenHtml] = await Promise.all([
    requestResponse.text(),
    resetResponse.text(),
    missingTokenResponse.text(),
  ]);
  assert.match(requestHtml, /Recupera tu contraseña/);
  assert.match(requestHtml, /Enviar instrucciones/);
  assert.match(requestHtml, /Correo electrónico/);
  assert.match(requestHtml, /Volver al inicio/);
  assert.match(requestHtml, /href="\/iniciar-sesion"/);
  assert.match(requestHtml, /aria-busy="false"/);
  assert.match(resetHtml, /Cambia tu contraseña/);
  assert.match(resetHtml, /Confirma la nueva contraseña/);
  assert.match(resetHtml, /href="\/recuperar-contrasena"/);
  assert.match(resetHtml, /Volver al inicio/);
  assert.match(resetHtml, /min-h-12/);
  assert.match(missingTokenHtml, /Este enlace no es válido o está incompleto/);
  assert.match(missingTokenHtml, /Solicitar otro enlace/);
  assert.match(missingTokenHtml, /href="\/recuperar-contrasena"/);
  assert.match(missingTokenHtml, /href="\/iniciar-sesion"/);
});

test("account forms explain password requirements and link mismatch errors to fields", () => {
  assert.match(authForm, /autoCapitalize="none"[\s\S]*?autoComplete="email"/);
  assert.match(authForm, /id="password-hint"/);
  assert.match(passwordResetForms, /if \(!token\) \{\s*return \(/);
  assert.match(passwordResetForms, /aria-invalid=\{passwordMismatch\}/);
  assert.match(passwordResetForms, /aria-describedby=\{[\s\S]*?"password-mismatch"/);
  assert.match(passwordResetForms, /id="password-mismatch" role="alert"/);
});
