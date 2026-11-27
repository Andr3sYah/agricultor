import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSellerContactVisibility,
  normalizeSellerEmail,
  normalizeSellerPhone,
} from "./seller-profile";

const contacts = {
  whatsapp: "573001234567",
  phone: "573011234567",
  email: "ventas@example.com",
};

describe("seller profile contact opt-in normalization", () => {
  it("normalizes Colombian mobile numbers and rejects invalid values", () => {
    assert.equal(normalizeSellerPhone(" 300 123-4567 "), "573001234567");
    assert.equal(normalizeSellerPhone("+57 3001234567"), "573001234567");
    assert.equal(normalizeSellerPhone("6011234567"), null);
    assert.equal(normalizeSellerPhone(""), null);
  });

  it("normalizes valid coordination emails and rejects malformed values", () => {
    assert.equal(normalizeSellerEmail(" ventas@example.com "), "ventas@example.com");
    assert.equal(normalizeSellerEmail("not-an-email"), null);
    assert.equal(normalizeSellerEmail(""), null);
  });

  it("keeps all contact channels private unless individually opted in", () => {
    const form = new FormData();
    assert.deepEqual(getSellerContactVisibility(form, contacts), {
      whatsappPublic: false,
      phonePublic: false,
      emailPublic: false,
    });

    for (const [field, publicFlag] of [
      ["whatsappPublic", "whatsappPublic"],
      ["phonePublic", "phonePublic"],
      ["emailPublic", "emailPublic"],
    ] as const) {
      const optedInForm = new FormData();
      optedInForm.set(field, "on");
      assert.deepEqual(getSellerContactVisibility(optedInForm, contacts), {
        whatsappPublic: publicFlag === "whatsappPublic",
        phonePublic: publicFlag === "phonePublic",
        emailPublic: publicFlag === "emailPublic",
      });
    }
  });

  it("does not publish a contact channel without a valid contact value", () => {
    const form = new FormData();
    form.set("whatsappPublic", "on");
    form.set("phonePublic", "on");
    form.set("emailPublic", "on");

    assert.deepEqual(
      getSellerContactVisibility(form, { ...contacts, phone: null }),
      {
        whatsappPublic: true,
        phonePublic: false,
        emailPublic: true,
      },
    );
  });
});
