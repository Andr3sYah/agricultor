import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OrderNotificationType, OrderStatus } from "@/generated/prisma/enums";
import {
  deliverOrderEvent,
  type OrderNotificationDependencies,
} from "./order-notifications";
import {
  canDecideOrder,
  canRequestOrder,
  transitionOrder,
  type OrderActor,
} from "./order-policy";
import {
  parseOrderDecision,
  validateOrderRequest,
} from "./order-validation";

export type OrderMutationResult =
  | { ok: true; orderId: string }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "unauthorized"
        | "invalid"
        | "unavailable"
        | "price-unavailable"
        | "offer-changed"
        | "idempotency-conflict"
        | "not-found"
        | "already-decided";
      fieldErrors?: Record<string, string>;
    };

const MAX_INVENTORY = new Prisma.Decimal("999999999.999");

export async function requestOrder(
  actor: OrderActor | null,
  input: Record<string, unknown>,
  database: PrismaClient,
  notificationDependencies?: OrderNotificationDependencies,
): Promise<OrderMutationResult> {
  if (!actor) {
    return { ok: false, code: "unauthenticated" };
  }
  if (!actor.roles.includes("BUYER")) {
    return { ok: false, code: "unauthorized" };
  }

  const validation = validateOrderRequest(input);
  if (!validation.ok) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: validation.errors,
    };
  }

  const quantity = new Prisma.Decimal(validation.data.quantity);
  const idempotencyKey = validation.data.idempotencyKey;

  const result: OrderMutationResult = await database.$transaction(
    async (transaction): Promise<OrderMutationResult> => {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`${actor.userId.length}:${actor.userId}${idempotencyKey}`},
          0
        )
      ) IS NULL AS "locked"
    `;

    const product = await transaction.product.findUnique({
      where: { id: validation.data.productId },
      select: {
        id: true,
        ownerId: true,
        isPublished: true,
        unit: true,
        priceCOP: true,
        pricingType: true,
      },
    });

    if (
      !product ||
      !product.isPublished ||
      !canRequestOrder(actor, product.ownerId)
    ) {
      return { ok: false, code: "unavailable" };
    }
    if (
      product.pricingType !== "FIXED" ||
      product.priceCOP === null ||
      product.priceCOP < 1
    ) {
      return { ok: false, code: "price-unavailable" };
    }

    const existingOrder = await transaction.order.findFirst({
      where: { buyerId: actor.userId, idempotencyKey },
      select: {
        id: true,
        productId: true,
        requestedQuantity: true,
      },
      },
    );

    if (existingOrder) {
      if (
        existingOrder.productId !== validation.data.productId ||
        !existingOrder.requestedQuantity.equals(quantity)
      ) {
        return { ok: false, code: "idempotency-conflict" };
      }

      return { ok: true, orderId: existingOrder.id };
    }

    if (input.expectedUnit !== product.unit || input.expectedPriceCOP !== String(product.priceCOP)) {
      return { ok: false, code: "offer-changed" };
    }

    const reserved = await transaction.product.updateMany({
      where: {
        id: product.id,
        ownerId: product.ownerId,
        isPublished: true,
        unit: product.unit,
        priceCOP: { equals: product.priceCOP, gte: 1 },
        pricingType: "FIXED",
        availableQuantity: { gte: quantity },
      },
      data: {
        availableQuantity: { decrement: quantity },
        reservedQuantity: { increment: quantity },
      },
    });

    if (reserved.count !== 1) {
      const current = await transaction.product.findFirst({
        where: { id: product.id, isPublished: true },
        select: { unit: true, priceCOP: true, pricingType: true },
      });
      if (
        current?.pricingType !== "FIXED" ||
        current.priceCOP === null ||
        current.priceCOP < 1
      ) {
        return { ok: false, code: "price-unavailable" };
      }
      if (current && (current.unit !== product.unit || current.priceCOP !== product.priceCOP)) {
        return { ok: false, code: "offer-changed" };
      }
      return { ok: false, code: "unavailable" };
    }

    const snapshot = await transaction.product.findUnique({
      where: { id: product.id },
      select: {
        name: true,
        unit: true,
        priceCOP: true,
      },
    });

    if (!snapshot || snapshot.priceCOP === null || snapshot.priceCOP < 1) {
      throw new Error("The product disappeared while reserving its inventory.");
    }

    const order = await transaction.order.create({
      data: {
        buyerId: actor.userId,
        producerId: product.ownerId,
        productId: product.id,
        idempotencyKey,
        productName: snapshot.name,
        requestedQuantity: quantity,
        unit: snapshot.unit,
        priceCOP: snapshot.priceCOP,
        history: {
          create: {
            actorId: actor.userId,
            toStatus: "PENDING",
          },
        },
      },
      select: { id: true },
    });

    await transaction.orderNotification.create({
      data: { orderId: order.id, type: "REQUEST_CREATED" },
    });

    return { ok: true, orderId: order.id };
  });

  if (!result.ok) return result;
  await deliverAfterCommit(
    result.orderId,
    "REQUEST_CREATED",
    database,
    notificationDependencies,
  );
  return result;
}

export async function decideOrder(
  actor: OrderActor | null,
  orderIdValue: unknown,
  decisionValue: unknown,
  database: PrismaClient,
  notificationDependencies?: OrderNotificationDependencies,
): Promise<OrderMutationResult> {
  if (!actor) {
    return { ok: false, code: "unauthenticated" };
  }
  if (!actor.roles.includes("PRODUCER")) {
    return { ok: false, code: "unauthorized" };
  }

  const orderId =
    typeof orderIdValue === "string" ? orderIdValue.trim() : "";
  const decision = parseOrderDecision(decisionValue);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId) || !decision) {
    return { ok: false, code: "invalid" };
  }

  const result: OrderMutationResult = await database.$transaction(
    async (transaction): Promise<OrderMutationResult> => {
    const order = await transaction.order.findFirst({
      where: { id: orderId, producerId: actor.userId },
      select: {
        id: true,
        producerId: true,
        productId: true,
        requestedQuantity: true,
        status: true,
      },
      },
    );

    if (!order || !canDecideOrder(actor, order.producerId)) {
      return { ok: false, code: "not-found" };
    }

    const nextStatus: OrderStatus | null = transitionOrder(
      order.status,
      decision,
    );
    if (!nextStatus) {
      if (order.status === decision) {
        return { ok: true, orderId: order.id };
      }
      return { ok: false, code: "already-decided" };
    }

    const changed = await transaction.order.updateMany({
      where: {
        id: order.id,
        producerId: actor.userId,
        status: "PENDING",
      },
      data: {
        status: nextStatus,
        decidedAt: new Date(),
      },
    });

    if (changed.count !== 1) {
      const currentOrder = await transaction.order.findFirst({
        where: { id: order.id, producerId: actor.userId },
        select: { status: true },
      });
      if (currentOrder?.status === decision) {
        return { ok: true, orderId: order.id };
      }
      return { ok: false, code: "already-decided" };
    }

    if (order.productId) {
      const inventoryChange = await transaction.product.updateMany({
        where: {
          id: order.productId,
          ownerId: actor.userId,
          reservedQuantity: { gte: order.requestedQuantity },
          ...(decision === "REJECTED"
            ? {
                availableQuantity: {
                  lte: MAX_INVENTORY.minus(order.requestedQuantity),
                },
              }
            : {}),
        },
        data:
          decision === "REJECTED"
            ? {
                availableQuantity: {
                  increment: order.requestedQuantity,
                },
                reservedQuantity: {
                  decrement: order.requestedQuantity,
                },
              }
            : {
                reservedQuantity: {
                  decrement: order.requestedQuantity,
                },
              },
      });

      if (inventoryChange.count !== 1) {
        throw new Error("The order reservation could not be reconciled.");
      }
    }

    await transaction.orderHistory.create({
      data: {
        orderId: order.id,
        actorId: actor.userId,
        fromStatus: "PENDING",
        toStatus: nextStatus,
      },
    });

    await transaction.orderNotification.create({
      data: {
        orderId: order.id,
        type: nextStatus === "ACCEPTED" ? "REQUEST_ACCEPTED" : "REQUEST_REJECTED",
      },
    });

    return { ok: true, orderId: order.id };
  });

  if (!result.ok) return result;
  const type: OrderNotificationType =
    decision === "ACCEPTED" ? "REQUEST_ACCEPTED" : "REQUEST_REJECTED";
  await deliverAfterCommit(
    result.orderId,
    type,
    database,
    notificationDependencies,
  );
  return result;
}

async function deliverAfterCommit(
  orderId: string,
  type: OrderNotificationType,
  database: PrismaClient,
  notificationDependencies?: OrderNotificationDependencies,
) {
  try {
    return await deliverOrderEvent(
      orderId,
      type,
      database,
      notificationDependencies,
    );
  } catch {
    console.error("No se pudo procesar un aviso de pedido.", {
      event: type,
      code: "OUTBOX_DISPATCH_FAILED",
    });
    return "PENDING" as const;
  }
}
