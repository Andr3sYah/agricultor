export function normalizeSellerPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[ ()-]/g, "");
  if (!normalized) return null;
  const number = normalized.replace(/^\+?57(?=3\d{9}$)/, "");
  return /^3\d{9}$/.test(number) ? `57${number}` : null;
}

export function normalizeSellerEmail(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const email = value.trim().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeSellerNeighborhood(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const neighborhood = value.trim();
  if (
    neighborhood.length < 2 ||
    neighborhood.length > 100 ||
    neighborhood.includes("\0") ||
    neighborhood.includes("#") ||
    /\b(?:calle|cll?|carrera|cra|crr?|avenida|av|diagonal|diag|transversal|tv)\.?\s*\d/iu.test(neighborhood) ||
    /\b\d+\s*[-–]\s*\d+\b/u.test(neighborhood)
  ) {
    return null;
  }
  return neighborhood;
}

export function normalizeRequiredSellerContact(input: {
  phone: unknown;
  email: unknown;
  neighborhood: unknown;
}) {
  const phone = normalizeSellerPhone(input.phone);
  const email = normalizeSellerEmail(input.email);
  const neighborhood = normalizeSellerNeighborhood(input.neighborhood);
  return phone && email && neighborhood ? { phone, email, neighborhood } : null;
}

export function getSellerContactVisibility(
  form: Pick<FormData, "get">,
  contacts: { whatsapp: string | null; phone: string | null; email: string | null },
) {
  const publishContacts = form.get("publishContacts") === "on";
  return {
    whatsappPublic: Boolean(contacts.whatsapp && form.get("whatsappPublic") === "on"),
    phonePublic: Boolean(contacts.phone && publishContacts),
    emailPublic: Boolean(contacts.email && publishContacts),
  };
}

export const PUBLIC_SELLER_CONTACT_CONDITION = {
  neighborhood: { not: null },
  publicContactConsentAt: { not: null },
  phone: { not: null },
  phonePublic: true,
  email: { not: null },
  emailPublic: true,
};

export function getPublicSellerOfferCondition() {
  return {
    owner: {
      is: {
        sellerProfile: {
          is: PUBLIC_SELLER_CONTACT_CONDITION,
        },
      },
    },
  };
}

export type SellerPublicContactProfile = {
  municipality: string;
  neighborhood: string | null;
  whatsapp?: string | null;
  whatsappPublic?: boolean;
  phone: string | null;
  phonePublic: boolean;
  email: string | null;
  emailPublic: boolean;
  publicContactConsentAt: Date | null;
};

export function getSellerPublicContact(profile: SellerPublicContactProfile) {
  const details = normalizeRequiredSellerContact(profile);
  if (
    !profile.publicContactConsentAt ||
    !profile.phonePublic ||
    !profile.emailPublic ||
    !details
  ) {
    return null;
  }
  const whatsapp = profile.whatsappPublic
    ? normalizeSellerPhone(profile.whatsapp)
    : null;
  return {
    ...details,
    municipality: profile.municipality,
    ...(whatsapp ? { whatsapp } : {}),
  };
}
