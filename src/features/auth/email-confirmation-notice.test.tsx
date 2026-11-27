import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EmailConfirmationNotice,
  getEmailConfirmationNoticeState,
} from "./email-confirmation-notice";

test("confirmed email without a session prompts sign-in without a private link", () => {
  const state = getEmailConfirmationNoticeState(
    { correo: "confirmado" },
    false,
  );
  const html = renderToStaticMarkup(<EmailConfirmationNotice state={state} />);

  assert.match(html, /Correo confirmado\. Ya puedes iniciar sesión/);
  assert.doesNotMatch(html, /href="\/mi-cuenta"/);
  assert.doesNotMatch(html, /sesión se inició automáticamente/);
});

test("confirmed email with an existing session links to the account", () => {
  const state = getEmailConfirmationNoticeState(
    { correo: "confirmado" },
    true,
  );
  const html = renderToStaticMarkup(<EmailConfirmationNotice state={state} />);

  assert.match(html, /Correo confirmado\. Tu sesión está activa/);
  assert.match(html, /href="\/mi-cuenta"/);
});

test("confirmation notice is omitted without the confirmation query", () => {
  const state = getEmailConfirmationNoticeState({}, false);

  assert.equal(state, null);
  assert.equal(
    renderToStaticMarkup(<EmailConfirmationNotice state={state} />),
    "",
  );
});
