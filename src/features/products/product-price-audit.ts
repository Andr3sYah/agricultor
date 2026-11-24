import type { PrismaClient } from "@/generated/prisma/client";
import { canManageProducts, type ProductActor } from "./product-access";

export type ManualProductPriceUpdateResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: "unauthorized" | "invalid" | "not-found" | "conflict" };

export async function updateManualProductPrice(
  actor: ProductActor,
  input: {
    productId: string;
    unit: string;
    expectedPriceCOP: number;
    newPriceCOP: number;
  },
  database: PrismaClient,
  now = new Date(),
): Promise<ManualProductPriceUpdateResult> {
  if (!canManageProducts(actor.roles)) {
    return { ok: false, code: "unauthorized" };
  }
  if (
    !input.productId ||
    !input.unit ||
    !Number.isSafeInteger(input.expectedPriceCOP) ||
    input.expectedPriceCOP < 1 ||
    !Number.isSafeInteger(input.newPriceCOP) ||
    input.newPriceCOP < 1 ||
    !Number.isFinite(now.getTime())
  ) {
    return { ok: false, code: "invalid" };
  }

  return database.$transaction(async (transaction) => {
    const product = await transaction.product.findFirst({
      where: {
        id: input.productId,
        ownerId: actor.userId,
        unit: input.unit,
      },
      select: { id: true, priceCOP: true },
    });

    if (!product) {
      return { ok: false, code: "not-found" };
    }
    if (product.priceCOP === input.newPriceCOP) {
      return { ok: true, changed: false };
    }
    if (product.priceCOP !== input.expectedPriceCOP) {
      return { ok: false, code: "conflict" };
    }

    const updated = await transaction.product.updateMany({
      where: {
        id: product.id,
        ownerId: actor.userId,
        unit: input.unit,
        priceCOP: input.expectedPriceCOP,
      },
      data: { priceCOP: input.newPriceCOP },
    });
    if (updated.count !== 1) {
      const current = await transaction.product.findFirst({
        where: {
          id: product.id,
          ownerId: actor.userId,
          unit: input.unit,
        },
        select: { priceCOP: true },
      });
      if (current?.priceCOP === input.newPriceCOP) {
        return { ok: true, changed: false };
      }
      return { ok: false, code: "conflict" };
    }

    await transaction.productPriceChange.create({
      data: {
        productId: product.id,
        actorId: actor.userId,
        oldPriceCOP: input.expectedPriceCOP,
        newPriceCOP: input.newPriceCOP,
        source: "PRODUCER_MANUAL",
        observedAt: now,
        appliedAt: now,
        reason: "Precio confirmado manualmente por el productor.",
      },
      select: { id: true },
    });

    return { ok: true, changed: true };
  });
}
