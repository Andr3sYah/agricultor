import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteHeader } from "./site-header";

test("authenticated header links directly to the account", () => {
  const html = renderToStaticMarkup(<SiteHeader authenticated />);

  assert.match(html, /href="\/mi-cuenta">Mi cuenta<\/a>/);
  assert.doesNotMatch(html, /Sesión iniciada|Inicia sesión|Crear cuenta/);
});

test("anonymous header keeps the sign-in link", () => {
  const html = renderToStaticMarkup(<SiteHeader authenticated={false} />);

  assert.match(html, /href="\/iniciar-sesion">Inicia sesión<\/a>/);
  assert.doesNotMatch(html, /Sesión iniciada|Mi cuenta/);
});
