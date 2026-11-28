import { inferColombianLocation } from "./colombian-location";

export function normalizeSellerPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[ ().-]/g, "");
  if (!normalized) return null;
  const number = normalized.replace(/^(?:\+57|57|0057)(?=3\d{9}$)/, "");
  return /^3\d{9}$/.test(number) ? `57${number}` : null;
}

export function normalizeSellerWhatsappLink(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length > 300) return null;
  const rawUrl = value.trim();
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    return null;
  }

  let phone: string | null = null;
  if (url.hostname === "wa.me" && !url.search) {
    const pathPhone = url.pathname.slice(1);
    phone = /^573\d{9}$/.test(pathPhone) ? pathPhone : null;
  } else if (
    url.hostname === "api.whatsapp.com" &&
    url.pathname === "/send" &&
    Array.from(url.searchParams.keys()).join(",") === "phone"
  ) {
    const queryPhone = url.searchParams.get("phone");
    phone = queryPhone && /^573\d{9}$/.test(queryPhone) ? queryPhone : null;
  }
  return phone ? `https://wa.me/${phone}` : null;
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

export function normalizeSellerExactLocation(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const location = value.trim();
  return location.length > 0 &&
    location.length <= 240 &&
    !location.includes("\0")
    ? location
    : null;
}

export function normalizeRequiredSellerContact(input: {
  phone: unknown;
  email: unknown;
  neighborhood?: unknown;
}) {
  const phone = normalizeSellerPhone(input.phone);
  const email = normalizeSellerEmail(input.email);
  const rawNeighborhood =
    typeof input.neighborhood === "string" ? input.neighborhood.trim() : "";
  const neighborhood = rawNeighborhood
    ? normalizeSellerNeighborhood(input.neighborhood)
    : null;
  return phone && email && (!rawNeighborhood || neighborhood)
    ? { phone, email, neighborhood }
    : null;
}

export function getSellerContactVisibility(
  form: Pick<FormData, "get">,
  contacts: {
    phone: string | null;
    email: string | null;
  },
) {
  const publishContacts = form.get("publishContacts") === "on";
  return {
    phonePublic: Boolean(contacts.phone && publishContacts),
    emailPublic: Boolean(contacts.email && publishContacts),
  };
}

export function getSellerExactLocationVisibility(
  form: Pick<FormData, "get">,
  exactLocation: string | null,
) {
  return Boolean(
    exactLocation && form.get("publishExactLocation") === "on",
  );
}

export const PUBLIC_SELLER_CONTACT_CONDITION = {
  department: { not: null },
  publicContactConsentAt: { not: null },
  email: { not: null },
  emailPublic: true,
  OR: [
    { phone: { not: null }, phonePublic: true },
    {
      whatsappPublic: true,
      OR: [
        { whatsapp: { not: null } },
        { whatsappLink: { not: null } },
        { phone: { not: null } },
      ],
    },
  ],
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
  department?: string | null;
  municipality: string;
  neighborhood: string | null;
  exactLocation?: string | null;
  exactLocationPublic?: boolean;
  exactLocationConsentAt?: Date | null;
  whatsapp?: string | null;
  whatsappLink?: string | null;
  whatsappPublic?: boolean;
  phone: string | null;
  phonePublic: boolean;
  email: string | null;
  emailPublic: boolean;
  publicContactConsentAt: Date | null;
};

function getLegacyWhatsappPhone(profile: Pick<
  SellerPublicContactProfile,
  "phone" | "whatsapp" | "whatsappLink" | "whatsappPublic"
>) {
  if (!profile.whatsappPublic) return null;
  return normalizeSellerPhone(profile.whatsapp) ??
    (profile.whatsappLink
      ? normalizeSellerWhatsappLink(profile.whatsappLink)?.slice("https://wa.me/".length) ?? null
      : normalizeSellerPhone(profile.phone));
}

export function getSellerPhoneForOrderSharing(
  profile: Pick<SellerPublicContactProfile, "phone" | "whatsapp" | "whatsappLink" | "whatsappPublic">,
) {
  return normalizeSellerPhone(profile.phone) ?? getLegacyWhatsappPhone(profile);
}

export function getSellerPublicContact(profile: SellerPublicContactProfile) {
  const legacyWhatsappPhone = getLegacyWhatsappPhone(profile);
  const phone = profile.phonePublic
    ? normalizeSellerPhone(profile.phone) ?? legacyWhatsappPhone
    : legacyWhatsappPhone;
  const details = normalizeRequiredSellerContact({ ...profile, phone });
  if (
    !profile.publicContactConsentAt ||
    !profile.emailPublic ||
    !details
  ) {
    return null;
  }
  const exactLocation =
    profile.exactLocationPublic && profile.exactLocationConsentAt
      ? normalizeSellerExactLocation(profile.exactLocation)
      : null;
  const location = inferColombianLocation(
    profile.municipality,
    profile.department,
  );
  return {
    ...details,
    department: location?.department ?? profile.department ?? null,
    municipality: location?.municipality ?? profile.municipality,
    exactLocation,
    whatsappUrl: `https://wa.me/${details.phone}`,
  };
}
