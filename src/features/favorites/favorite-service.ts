import type { PrismaClient } from "@/generated/prisma/client";
import type { UserRole } from "@/lib/auth/roles";

export type FavoriteActor = {
  userId: string;
  roles: readonly UserRole[];
};

export type FavoritesDatabase = Pick<PrismaClient, "favorite" | "product">;

export type FavoriteMutationResult =
  | { ok: true }
  | {
      ok: false;
      code: "unauthenticated" | "unauthorized" | "invalid" | "unavailable";
    };

export type FavoriteProduct = {
  id: string;
  name: string;
  category: string;
  availableQuantity: string;
  unit: string;
  priceCOP: number;
  municipality: string;
};

export type FavoriteListResult =
  | { ok: true; products: FavoriteProduct[] }
  | { ok: false; code: "unauthenticated" | "unauthorized" };

function canManageFavorites(actor: FavoriteActor | null): boolean {
  return Boolean(actor?.roles.includes("BUYER"));
}

function validateProductId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
    ? value
    : null;
}

export async function addFavorite(
  actor: FavoriteActor | null,
  productIdValue: unknown,
  database: FavoritesDatabase,
): Promise<FavoriteMutationResult> {
  if (!actor) {
    return { ok: false, code: "unauthenticated" };
  }
  if (!canManageFavorites(actor)) {
    return { ok: false, code: "unauthorized" };
  }
  const productId = validateProductId(productIdValue);
  if (!productId) {
    return { ok: false, code: "invalid" };
  }

  const product = await database.product.findFirst({
    where: {
      id: productId,
      isPublished: true,
      OR: [
        { availableQuantity: { gt: 0 } },
        { reservedQuantity: { gt: 0 } },
      ],
    },
    select: { id: true },
  });
  if (!product) {
    return { ok: false, code: "unavailable" };
  }

  await database.favorite.upsert({
    where: {
      userId_productId: { userId: actor.userId, productId: product.id },
    },
    create: { userId: actor.userId, productId: product.id },
    update: {},
  });

  return { ok: true };
}

export async function removeFavorite(
  actor: FavoriteActor | null,
  productIdValue: unknown,
  database: FavoritesDatabase,
): Promise<FavoriteMutationResult> {
  if (!actor) {
    return { ok: false, code: "unauthenticated" };
  }
  if (!canManageFavorites(actor)) {
    return { ok: false, code: "unauthorized" };
  }
  const productId = validateProductId(productIdValue);
  if (!productId) {
    return { ok: false, code: "invalid" };
  }

  await database.favorite.deleteMany({
    where: { userId: actor.userId, productId },
  });

  return { ok: true };
}

export async function listFavorites(
  actor: FavoriteActor | null,
  database: FavoritesDatabase,
): Promise<FavoriteListResult> {
  if (!actor) {
    return { ok: false, code: "unauthenticated" };
  }
  if (!canManageFavorites(actor)) {
    return { ok: false, code: "unauthorized" };
  }

  const favorites = await database.favorite.findMany({
    where: {
      userId: actor.userId,
      product: {
        isPublished: true,
        OR: [
          { availableQuantity: { gt: 0 } },
          { reservedQuantity: { gt: 0 } },
        ],
      },
    },
    select: {
      product: {
        select: {
          id: true,
          name: true,
          category: true,
          availableQuantity: true,
          unit: true,
          priceCOP: true,
          municipality: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    ok: true,
    products: favorites.map(({ product }) => ({
      ...product,
      availableQuantity: product.availableQuantity.toString(),
    })),
  };
}
