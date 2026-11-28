import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  getPublicSellerOfferCondition,
  PUBLIC_SELLER_CONTACT_CONDITION,
} from "@/features/sellers/seller-contact";
import { resolveColombianLocation } from "@/features/sellers/colombian-location";
import { canManageProducts, type ProductActor } from "./product-access";
import type { ProductInput } from "./product-validation";

type ProductCreationDatabase = Pick<PrismaClient, "$transaction">;

export type ProductCreationResult =
  | { ok: true; productId: string; published: boolean }
  | { ok: false; code: "unauthorized" | "seller-profile-incomplete" | "unavailable" };

export type ProductPublicationResult =
  | { ok: true }
  | { ok: false; code: "unauthorized" | "seller-profile-incomplete" | "unavailable" };

export async function createProducerProduct(
  actor: ProductActor,
  input: ProductInput,
  publish: boolean,
  database: ProductCreationDatabase,
): Promise<ProductCreationResult> {
  if (!canManageProducts(actor.roles)) {
    return { ok: false, code: "unauthorized" };
  }
  if (publish && new Prisma.Decimal(input.availableQuantity).lte(0)) {
    return { ok: false, code: "unavailable" };
  }

  return database.$transaction(
    async (transaction) => {
      let municipality = input.municipality;
      if (publish) {
        const sellerProfile = await transaction.sellerProfile.findFirst({
          where: {
            ownerId: actor.userId,
            ...PUBLIC_SELLER_CONTACT_CONDITION,
          },
          select: { id: true, department: true, municipality: true },
        });
        const location = sellerProfile
          ? resolveColombianLocation(
              sellerProfile.department,
              sellerProfile.municipality,
            )
          : null;
        if (!sellerProfile || !location) {
          return { ok: false, code: "seller-profile-incomplete" } as const;
        }
        municipality = location.municipality;
      }

      const product = await transaction.product.create({
        data: {
          ownerId: actor.userId,
          name: input.name,
          category: input.category,
          availableQuantity: new Prisma.Decimal(input.availableQuantity),
          unit: input.unit,
          pricingType: input.pricingType,
          priceCOP: input.pricingType === "FIXED" ? input.priceCOP : null,
          ...(input.pricingType === "NEGOTIABLE"
            ? { priceReferenceEnabled: false, priceReferenceConsentAt: null }
            : {}),
          municipality,
          isPublished: publish,
        },
        select: { id: true },
      });

      return { ok: true, productId: product.id, published: publish } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function setProducerProductPublication(
  actor: ProductActor,
  productId: string,
  publish: boolean,
  database: ProductCreationDatabase,
): Promise<ProductPublicationResult> {
  if (!canManageProducts(actor.roles)) {
    return { ok: false, code: "unauthorized" };
  }

  return database.$transaction(
    async (transaction) => {
      const currentProduct = await transaction.product.findFirst({
        where: { id: productId, ownerId: actor.userId },
        select: { id: true, availableQuantity: true },
      });
      if (!currentProduct || (publish && currentProduct.availableQuantity.lte(0))) {
        return { ok: false, code: "unavailable" } as const;
      }

      let municipality: string | null = null;
      if (publish) {
        const sellerProfile = await transaction.sellerProfile.findFirst({
          where: {
            ownerId: actor.userId,
            ...PUBLIC_SELLER_CONTACT_CONDITION,
          },
          select: { id: true, department: true, municipality: true },
        });
        const location = sellerProfile
          ? resolveColombianLocation(
            sellerProfile.department,
            sellerProfile.municipality,
          )
          : null;
        if (!sellerProfile || !location) {
          return { ok: false, code: "seller-profile-incomplete" } as const;
        }
        municipality = location.municipality;
      }

      const updated = await transaction.product.updateMany({
        where: {
          id: productId,
          ownerId: actor.userId,
          ...(publish
            ? {
                availableQuantity: { gt: 0 },
                ...getPublicSellerOfferCondition(),
              }
            : {}),
        },
        data: {
          isPublished: publish,
          ...(municipality ? { municipality } : {}),
        },
      });

      return updated.count === 1
        ? { ok: true } as const
        : { ok: false, code: "unavailable" } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
