import { prisma } from "@/lib/db";
import { resolveColombianLocation } from "./colombian-location";

import { getSellerPublicContact } from "./seller-contact";

export {
  getPublicSellerOfferCondition,
  getSellerContactVisibility,
  getSellerExactLocationVisibility,
  getSellerPhoneForOrderSharing,
  getSellerPublicContact,
  normalizeRequiredSellerContact,
  normalizeSellerEmail,
  normalizeSellerExactLocation,
  normalizeSellerNeighborhood,
  normalizeSellerPhone,
  normalizeSellerWhatsappLink,
  PUBLIC_SELLER_CONTACT_CONDITION,
} from "./seller-contact";
export type { SellerPublicContactProfile } from "./seller-contact";

export function isSellerProfileCompleteForSales(
  profile: Parameters<typeof getSellerPublicContact>[0] & {
    department?: string | null;
  } | null,
) {
  return Boolean(
    profile &&
      resolveColombianLocation(profile.department, profile.municipality) &&
      getSellerPublicContact(profile),
  );
}

export async function isSellerProfileAvailable() {
  const [schema] = await prisma.$queryRaw<{ available: boolean }[]>`
    SELECT to_regclass('"SellerProfile"') IS NOT NULL AS available
  `;
  return schema.available;
}

export function getSellerProfileHref(id: string) {
  return `/vendedores/${encodeURIComponent(id)}`;
}
