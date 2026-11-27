import { prisma } from "@/lib/db";

export {
  getPublicSellerOfferCondition,
  getSellerContactVisibility,
  getSellerExactLocationVisibility,
  getSellerPublicContact,
  normalizeRequiredSellerContact,
  normalizeSellerEmail,
  normalizeSellerExactLocation,
  normalizeSellerNeighborhood,
  normalizeSellerPhone,
  normalizeSellerWhatsappChoice,
  normalizeSellerWhatsappLink,
  PUBLIC_SELLER_CONTACT_CONDITION,
} from "./seller-contact";
export type { SellerPublicContactProfile } from "./seller-contact";

export async function isSellerProfileAvailable() {
  const [schema] = await prisma.$queryRaw<{ available: boolean }[]>`
    SELECT to_regclass('"SellerProfile"') IS NOT NULL AS available
  `;
  return schema.available;
}

export function getSellerProfileHref(id: string) {
  return `/vendedores/${encodeURIComponent(id)}`;
}
