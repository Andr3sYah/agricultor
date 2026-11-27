import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SellerPublicContact } from "./seller-public-contact";
import {
  getSellerContactVisibility,
  getSellerExactLocationVisibility,
  getSellerPublicContact,
  normalizeRequiredSellerContact,
  normalizeSellerEmail,
  normalizeSellerExactLocation,
  normalizeSellerNeighborhood,
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

  it("requires a valid cellular, email, and approximate neighborhood together", () => {
    assert.deepEqual(normalizeRequiredSellerContact({
      phone: "3001234567",
      email: " ventas@example.com ",
      neighborhood: "  El Porvenir ",
    }), {
      phone: "573001234567",
      email: "ventas@example.com",
      neighborhood: "El Porvenir",
    });
    for (const input of [
      { phone: "", email: "ventas@example.com", neighborhood: "El Porvenir" },
      { phone: "3001234567", email: "", neighborhood: "El Porvenir" },
      { phone: "3001234567", email: "ventas@example.com", neighborhood: "" },
    ]) {
      assert.equal(normalizeRequiredSellerContact(input), null);
    }
  });

  it("rejects street-style addresses as a neighborhood", () => {
    assert.equal(normalizeSellerNeighborhood("Calle 10 # 12-34"), null);
    assert.equal(normalizeSellerNeighborhood("Carrera 7 11-22"), null);
    assert.equal(normalizeSellerNeighborhood("Barrio 20 de Julio"), "Barrio 20 de Julio");
  });

  it("publishes an exact location only with its separate explicit opt-in", () => {
    assert.equal(
      normalizeSellerExactLocation(" Finca El Roble, km 4 "),
      "Finca El Roble, km 4",
    );
    assert.equal(normalizeSellerExactLocation("x".repeat(241)), null);
    assert.equal(normalizeSellerExactLocation("Calle\0 4"), null);
    const contactConsentOnly = new FormData();
    contactConsentOnly.set("publishContacts", "on");
    assert.equal(
      getSellerExactLocationVisibility(contactConsentOnly, "Finca El Roble"),
      false,
    );
    const exactLocationConsentOnly = new FormData();
    exactLocationConsentOnly.set("publishExactLocation", "on");
    assert.equal(
      getSellerExactLocationVisibility(exactLocationConsentOnly, "Finca El Roble"),
      true,
    );
    assert.equal(
      getSellerExactLocationVisibility(exactLocationConsentOnly, null),
      false,
    );

    const profile = {
      municipality: "La Vega",
      neighborhood: "El Porvenir",
      exactLocation: "Finca El Roble, km 4",
      exactLocationPublic: false,
      exactLocationConsentAt: null,
      phone: "573001234567",
      phonePublic: true,
      email: "ventas@example.com",
      emailPublic: true,
      publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
    };
    assert.equal(getSellerPublicContact(profile)?.exactLocation, null);
    assert.equal(
      getSellerPublicContact({
        ...profile,
        exactLocationPublic: true,
        exactLocationConsentAt: new Date("2026-11-27T00:00:00.000Z"),
      })?.exactLocation,
      "Finca El Roble, km 4",
    );
    assert.equal(
      getSellerPublicContact({
        ...profile,
        exactLocationPublic: true,
      })?.exactLocation,
      null,
    );
  });

  it("keeps contact details private unless the new combined consent is present", () => {
    const form = new FormData();
    form.set("phonePublic", "on");
    form.set("emailPublic", "on");
    assert.deepEqual(getSellerContactVisibility(form, contacts), {
      whatsappPublic: false,
      phonePublic: false,
      emailPublic: false,
    });

    for (const [field, publicFlag] of [
      ["whatsappPublic", "whatsappPublic"],
    ] as const) {
      const optedInForm = new FormData();
      optedInForm.set(field, "on");
      assert.deepEqual(getSellerContactVisibility(optedInForm, contacts), {
        whatsappPublic: publicFlag === "whatsappPublic",
        phonePublic: false,
        emailPublic: false,
      });
    }

    const acceptedForm = new FormData();
    acceptedForm.set("publishContacts", "on");
    assert.deepEqual(getSellerContactVisibility(acceptedForm, contacts), {
      whatsappPublic: false,
      phonePublic: true,
      emailPublic: true,
    });
  });

  it("does not publish a contact channel without a valid contact value", () => {
    const form = new FormData();
    form.set("whatsappPublic", "on");
    form.set("phonePublic", "on");
    form.set("emailPublic", "on");
    form.set("publishContacts", "on");

    assert.deepEqual(
      getSellerContactVisibility(form, { ...contacts, phone: null }),
      {
        whatsappPublic: true,
        phonePublic: false,
        emailPublic: true,
      },
    );
  });

  it("never exposes legacy private values until new consent and valid public fields exist", () => {
    const legacyProfile = {
      municipality: "La Vega",
      neighborhood: null,
      phone: "573001234567",
      phonePublic: false,
      email: "private@example.test",
      emailPublic: false,
      publicContactConsentAt: null,
      preciseAddress: "Carrera 4 # 5-6",
    };
    assert.equal(getSellerPublicContact(legacyProfile), null);

    const explicitlyAcceptedProfile = {
      ...legacyProfile,
      neighborhood: "El Porvenir",
      phonePublic: true,
      emailPublic: true,
      publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
    };
    const publicContact = getSellerPublicContact(explicitlyAcceptedProfile);
    assert.deepEqual(publicContact, {
      phone: "573001234567",
      email: "private@example.test",
      neighborhood: "El Porvenir",
      municipality: "La Vega",
      exactLocation: null,
    });
    assert.equal("preciseAddress" in (publicContact ?? {}), false);
  });

  it("only exposes WhatsApp when its separate public-contact opt-in is enabled", () => {
    const profile = {
      municipality: "La Vega",
      neighborhood: "El Porvenir",
      whatsapp: "573001234567",
      whatsappPublic: false,
      phone: "573011234567",
      phonePublic: true,
      email: "ventas@example.test",
      emailPublic: true,
      publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
    };

    assert.equal("whatsapp" in (getSellerPublicContact(profile) ?? {}), false);
    assert.equal(
      getSellerPublicContact({ ...profile, whatsappPublic: true })?.whatsapp,
      "573001234567",
    );
  });

  it("renders negotiation guidance and only the seller's opted-in public channels", () => {
    const markup = renderToStaticMarkup(
      createElement(SellerPublicContact, {
        negotiating: true,
        profile: {
          municipality: "La Vega",
          neighborhood: "El Porvenir",
          whatsapp: "573001234567",
          whatsappPublic: true,
          phone: "573011234567",
          phonePublic: true,
          email: "ventas@example.test",
          emailPublic: true,
          publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
        },
      }),
    );

    assert.match(markup, /Contacta al vendedor para acordar el precio/);
    assert.match(markup, /fuera de Agricultor/);
    assert.match(markup, /href="https:\/\/wa\.me\/573001234567"/);
    assert.match(markup, /href="tel:\+573011234567"/);
    assert.match(markup, /href="mailto:ventas@example\.test"/);
    assert.match(markup, /El Porvenir, La Vega/);
    assert.doesNotMatch(markup, /dirección exacta/i);
  });
});
