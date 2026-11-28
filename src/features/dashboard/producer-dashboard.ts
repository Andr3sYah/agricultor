import type { PrismaClient } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { canManageProducts, type ProductActor } from "@/features/products/product-access";

type DashboardDatabase = Pick<PrismaClient, "$queryRaw">;

type DashboardCounts = {
  totalProducts: bigint;
  publishedProducts: bigint;
  soldOutProducts: bigint;
  pendingOrders: bigint;
  acceptedOrders: bigint;
  rejectedOrders: bigint;
};

export type ProducerDashboardSummary = {
  products: {
    published: number;
    soldOut: number;
    total: number;
  };
  orders: Record<OrderStatus, number>;
  hasProducts: boolean;
  hasOrders: boolean;
};

export async function getProducerDashboardSummary(
  actor: ProductActor,
  database: DashboardDatabase,
): Promise<ProducerDashboardSummary | null> {
  if (!canManageProducts(actor.roles)) {
    return null;
  }

  const [counts] = await database.$queryRaw<DashboardCounts[]>`
    WITH product_counts AS (
      SELECT
        COUNT(*) AS "totalProducts",
        COUNT(*) FILTER (WHERE "isPublished") AS "publishedProducts",
        COUNT(*) FILTER (WHERE "availableQuantity" = 0) AS "soldOutProducts"
      FROM "Product"
      WHERE "ownerId" = ${actor.userId}
    ),
    order_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'PENDING') AS "pendingOrders",
        COUNT(*) FILTER (WHERE "status" = 'ACCEPTED') AS "acceptedOrders",
        COUNT(*) FILTER (WHERE "status" = 'REJECTED') AS "rejectedOrders"
      FROM "Order"
      WHERE "producerId" = ${actor.userId}
    )
    SELECT * FROM product_counts CROSS JOIN order_counts
  `;

  if (!counts) {
    throw new Error("No se pudieron cargar los conteos del panel de productor.");
  }

  const totalProducts = Number(counts.totalProducts);
  const publishedProducts = Number(counts.publishedProducts);
  const soldOutProducts = Number(counts.soldOutProducts);
  const pendingOrders = Number(counts.pendingOrders);
  const acceptedOrders = Number(counts.acceptedOrders);
  const rejectedOrders = Number(counts.rejectedOrders);
  if (
    ![
      totalProducts,
      publishedProducts,
      soldOutProducts,
      pendingOrders,
      acceptedOrders,
      rejectedOrders,
    ].every(Number.isSafeInteger)
  ) {
    throw new RangeError("Los conteos del panel exceden el rango numérico seguro.");
  }

  const orders: Record<OrderStatus, number> = {
    PENDING: pendingOrders,
    ACCEPTED: acceptedOrders,
    REJECTED: rejectedOrders,
  };

  return {
    products: {
      published: publishedProducts,
      soldOut: soldOutProducts,
      total: totalProducts,
    },
    orders,
    hasProducts: totalProducts > 0,
    hasOrders: Object.values(orders).some((count) => count > 0),
  };
}
