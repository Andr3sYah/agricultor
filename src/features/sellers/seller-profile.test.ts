import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SellerProfile } from "@/generated/prisma/client";
import { SellerPublicContact } from "./seller-public-contact";
import { SellerProfileForm } from "./seller-profile-form";
import { ProductForm } from "@/features/products/product-form";
import {
  inferColombianLocation,
  resolveColombianLocation,
  selectColombianDepartment,
} from "./colombian-location";
import {
  getSellerContactVisibility,
  getSellerExactLocationVisibility,
  getSellerPhoneForOrderSharing,
  getSellerPublicContact,
  isSellerProfileCompleteForSales,
  normalizeRequiredSellerContact,
  normalizeSellerEmail,
  normalizeSellerExactLocation,
  normalizeSellerNeighborhood,
  normalizeSellerPhone,
  normalizeSellerWhatsappLink,
} from "./seller-profile";

const contacts = {
  phone: "573011234567",
  email: "ventas@example.com",
};

describe("seller profile contact opt-in normalization", () => {
  it("normalizes Colombian mobile numbers and rejects invalid values", () => {
    assert.equal(normalizeSellerPhone(" 300 123-4567 "), "573001234567");
    assert.equal(normalizeSellerPhone("+57 3001234567"), "573001234567");
    assert.equal(normalizeSellerPhone("57 (300) 123.4567"), "573001234567");
    assert.equal(normalizeSellerPhone("0057 3001234567"), "573001234567");
    assert.equal(normalizeSellerPhone("6011234567"), null);
    assert.equal(normalizeSellerPhone("+57 6011234567"), null);
    assert.equal(normalizeSellerPhone("57300123456"), null);
    assert.equal(normalizeSellerPhone("30012345678"), null);
    assert.equal(normalizeSellerPhone(""), null);
  });

  it("normalizes legacy WhatsApp links only for backward-compatible reads", () => {
    assert.equal(
      normalizeSellerWhatsappLink("https://api.whatsapp.com/send?phone=573001234567"),
      "https://wa.me/573001234567",
    );
  });

  it("accepts only HTTPS WhatsApp links for valid Colombian mobile numbers", () => {
    for (const link of [
      "http://wa.me/573001234567",
      "https://wa.me/573001234567?text=hello",
      "https://wa.me/57300-123-4567",
      "https://wa.me.evil.example/573001234567",
      "https://user@wa.me/573001234567",
      "https://api.whatsapp.com/send?phone=573001234567&text=hello",
      "https://api.whatsapp.com/send?phone=6011234567",
      "javascript:alert(1)",
    ]) {
      assert.equal(normalizeSellerWhatsappLink(link), null, link);
    }
  });

  it("normalizes valid coordination emails and rejects malformed values", () => {
    assert.equal(normalizeSellerEmail(" ventas@example.com "), "ventas@example.com");
    assert.equal(normalizeSellerEmail("not-an-email"), null);
    assert.equal(normalizeSellerEmail(""), null);
  });

  it("requires a valid phone and email, and validates an optional neighborhood", () => {
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
    ]) {
      assert.equal(normalizeRequiredSellerContact(input), null);
    }
    assert.deepEqual(normalizeRequiredSellerContact({
      phone: "3001234567",
      email: "ventas@example.com",
    }), {
      phone: "573001234567",
      email: "ventas@example.com",
      neighborhood: null,
    });
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
    assert.deepEqual(getSellerContactVisibility(form, contacts), {
      phonePublic: false,
      emailPublic: false,
    });

    const acceptedForm = new FormData();
    acceptedForm.set("publishContacts", "on");
    assert.deepEqual(getSellerContactVisibility(acceptedForm, contacts), {
      phonePublic: true,
      emailPublic: true,
    });
  });

  it("does not publish a contact channel without a valid contact value", () => {
    const form = new FormData();
    form.set("publishContacts", "on");

    assert.deepEqual(
      getSellerContactVisibility(form, { ...contacts, phone: null }),
      {
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
      department: null,
      municipality: "La Vega",
      exactLocation: null,
      whatsappUrl: "https://wa.me/573001234567",
    });
    assert.equal("preciseAddress" in (publicContact ?? {}), false);
  });

  it("uses the same opted-in phone for calling and WhatsApp", () => {
    const profile = {
      municipality: "La Vega",
      neighborhood: "El Porvenir",
      whatsapp: "573001234567",
      whatsappPublic: true,
      phone: "573011234567",
      phonePublic: true,
      email: "ventas@example.test",
      emailPublic: true,
      publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
    };

    const contact = getSellerPublicContact(profile);
    assert.equal(contact?.phone, "573011234567");
    assert.equal(contact?.whatsappUrl, "https://wa.me/573011234567");
  });

  it("renders the one contact phone for calling and WhatsApp", () => {
    const markup = renderToStaticMarkup(
      createElement(SellerPublicContact, {
        negotiating: true,
        profile: {
          department: "Cundinamarca",
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
    assert.match(markup, /href="https:\/\/wa\.me\/573011234567"/);
    assert.match(markup, /href="tel:\+573011234567"/);
    assert.match(markup, /href="mailto:ventas@example\.test"/);
    assert.match(markup, /Teléfono de contacto: \+57 3011234567/);
    assert.match(markup, /El Porvenir, La Vega, Cundinamarca/);
    assert.doesNotMatch(markup, /dirección exacta/i);
    assert.doesNotMatch(markup, /573001234567/);
  });

  it("renders one required phone field and no seller-entered WhatsApp link", () => {
    const markup = renderToStaticMarkup(
      createElement(SellerProfileForm, { profile: null }),
    );
    assert.match(markup, /Teléfono de contacto/);
    assert.match(markup, /name="phone"/);
    assert.match(markup, /type="tel"/);
    assert.match(markup, /required=""/);
    assert.equal(markup.match(/type="tel"/g)?.length, 1);
    assert.doesNotMatch(markup, /whatsappMode|whatsappLink|whatsappPublic|type="url"/);
    assert.doesNotMatch(markup, /wa\.me|api\.whatsapp\.com/);
  });

  it("uses a bundled department/municipality catalog and rejects mismatched pairs", () => {
    assert.deepEqual(
      resolveColombianLocation("antioquia", "medellin"),
      { department: "Antioquia", municipality: "Medellín" },
    );
    assert.equal(resolveColombianLocation("Antioquia", "Cali"), null);
    assert.equal(inferColombianLocation("Leticia")?.department, "Amazonas");
    assert.equal(inferColombianLocation("Municipio heredado"), null);
  });

  it("clears the previous municipality when the department changes", () => {
    assert.deepEqual(selectColombianDepartment("Cundinamarca"), {
      department: "Cundinamarca",
      municipality: "",
    });
  });

  it("renders dependent location selects and keeps an old location visible for migration", () => {
    const profile: SellerProfile = {
      id: "seller",
      ownerId: "owner",
      name: "Productor",
      description: "Productos locales",
      department: "Antioquia",
      municipality: "Medellín",
      neighborhood: null,
      exactLocation: null,
      exactLocationPublic: false,
      exactLocationConsentAt: null,
      published: false,
      whatsapp: null,
      whatsappLink: null,
      whatsappPublic: false,
      phone: null,
      phonePublic: false,
      email: null,
      emailPublic: false,
      publicContactConsentAt: null,
    };
    const markup = renderToStaticMarkup(
      createElement(SellerProfileForm, { profile }),
    );
    assert.match(markup, /name="department"/);
    assert.match(markup, /name="municipality"/);
    assert.match(markup, /<option value="Medellín" selected="">Medellín<\/option>/);
    assert.doesNotMatch(markup, /name="municipality"[^>]*type="text"/);
    const legacyMarkup = renderToStaticMarkup(
      createElement(SellerProfileForm, {
        profile: { ...profile, department: null, municipality: "Municipio legado" },
      }),
    );
    assert.match(legacyMarkup, /Conservamos tu ubicación anterior \(Municipio legado\)/);
    const mappedLegacyMarkup = renderToStaticMarkup(
      createElement(SellerProfileForm, {
        profile: { ...profile, department: null, municipality: "Leticia" },
      }),
    );
    assert.match(mappedLegacyMarkup, /<option value="Amazonas" selected="">Amazonas<\/option>/);
    assert.match(mappedLegacyMarkup, /<option value="Leticia" selected="">Leticia<\/option>/);
  });

  it("gates selling on a valid location and publicly shared contact, not a neighborhood", () => {
    const completeProfile = {
      department: "Antioquia",
      municipality: "Medellín",
      neighborhood: null,
      phone: "573001234567",
      phonePublic: true,
      email: "ventas@example.com",
      emailPublic: true,
      publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
    };
    assert.equal(isSellerProfileCompleteForSales(null), false);
    assert.equal(isSellerProfileCompleteForSales(completeProfile), true);
    assert.equal(
      isSellerProfileCompleteForSales({
        ...completeProfile,
        department: "Cundinamarca",
      }),
      false,
    );
    assert.equal(
      isSellerProfileCompleteForSales({
        ...completeProfile,
        publicContactConsentAt: null,
      }),
      false,
    );
    assert.equal(
      isSellerProfileCompleteForSales({
        ...completeProfile,
        emailPublic: false,
      }),
      false,
    );
    assert.equal(
      isSellerProfileCompleteForSales({
        ...completeProfile,
        department: null,
        municipality: "Leticia",
      }),
      false,
    );
  });

  it("hides the sale action until setup and uses the profile location without asking twice", () => {
    const inventoryForm = renderToStaticMarkup(
      createElement(ProductForm, {
        allowSell: false,
        sellerMunicipality: "",
      }),
    );
    assert.match(inventoryForm, /Guardar en inventario/);
    assert.doesNotMatch(inventoryForm, /Vender producto/);

    const saleForm = renderToStaticMarkup(
      createElement(ProductForm, {
        allowSell: true,
        sellerMunicipality: "Medellín",
      }),
    );
    assert.match(saleForm, /Vender producto/);
    assert.ok(
      saleForm.includes('name="municipality"') &&
        saleForm.includes('value="Medellín"'),
    );
    assert.doesNotMatch(saleForm, /Municipio o localidad/);
  });

  it("keeps legacy WhatsApp-only profiles usable only with consent", () => {
    const legacy = {
      municipality: "La Vega",
      neighborhood: "El Porvenir",
      whatsapp: "573001234567",
      whatsappPublic: true,
      phone: null,
      phonePublic: false,
      email: "ventas@example.test",
      emailPublic: true,
      publicContactConsentAt: new Date("2026-11-27T00:00:00.000Z"),
    };
    assert.equal(getSellerPublicContact(legacy)?.phone, "573001234567");
    assert.equal(
      getSellerPublicContact({ ...legacy, publicContactConsentAt: null }),
      null,
    );
    assert.equal(
      getSellerPublicContact({ ...legacy, whatsappPublic: false }),
      null,
    );
    const legacyLink = getSellerPublicContact({
      ...legacy,
      whatsapp: null,
      whatsappLink: "https://wa.me/573991234567",
    });
    assert.equal(legacyLink?.phone, "573991234567");
    assert.equal(legacyLink?.whatsappUrl, "https://wa.me/573991234567");
    assert.equal("whatsappLink" in (legacyLink ?? {}), false);
  });

  it("uses the profile phone for order sharing and only falls back to opted-in legacy WhatsApp", () => {
    assert.equal(
      getSellerPhoneForOrderSharing({
        phone: "+57 300 123 4567",
        whatsapp: "573991234567",
        whatsappLink: null,
        whatsappPublic: true,
      }),
      "573001234567",
    );
    assert.equal(
      getSellerPhoneForOrderSharing({
        phone: null,
        whatsapp: "573991234567",
        whatsappLink: null,
        whatsappPublic: true,
      }),
      "573991234567",
    );
    assert.equal(
      getSellerPhoneForOrderSharing({
        phone: null,
        whatsapp: "573991234567",
        whatsappLink: null,
        whatsappPublic: false,
      }),
      null,
    );
  });
});
