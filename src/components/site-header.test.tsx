import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteHeader } from "./site-header";

test("authenticated header links to Mi cuenta with the Inicio label", () => {
  const html = renderToStaticMarkup(<SiteHeader authenticated />);

  assert.match(html, /href="\/mi-cuenta"/);
  assert.match(html, /href="\/mi-cuenta">Inicio<\/a>/);
  assert.doesNotMatch(html, /Andrés|Sesión iniciada|Mi cuenta|Inicia sesión|Crear cuenta/);
});

test("anonymous header keeps the sign-in link", () => {
  const html = renderToStaticMarkup(<SiteHeader authenticated={false} />);

  assert.match(html, /href="\/iniciar-sesion">Inicia sesión<\/a>/);
  assert.doesNotMatch(html, /Sesión iniciada|Mi cuenta|Inicio|Crear cuenta/);
});
