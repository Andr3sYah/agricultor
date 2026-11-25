import { randomUUID } from "node:crypto";
import type {
  OrderNotificationStatus,
  OrderNotificationType,
} from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { getPublicAppBaseUrl } from "@/lib/app-url";
import {
  BrevoConfigurationError,
  BrevoRejectedEmailError,
  sendOrderNotificationEmail,
  type OrderNotificationEmail,
} from "@/lib/email/brevo";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
const SENDING_LEASE_MS = 10 * 60_000;

export type OrderNotificationDependencies = {
  sendEmail?: (message: OrderNotificationEmail) => Promise<void>;
  appBaseUrl?: string;
  logFailure?: (notificationId: string, code: string, status: string) => void;
};

function logFailure(notificationId: string, code: string, status: string) {
  console.error("No se pudo entregar un aviso de pedido.", {
    notificationId,
    code,
    status,
  });
}

function failureFor(error: unknown): { code: string } {
  if (error instanceof BrevoConfigurationError) {
    return { code: error.code };
  }
  if (error instanceof BrevoRejectedEmailError) {
    return { code: `BREVO_HTTP_${error.status}` };
  }
  if (error instanceof Error && error.message.includes("URL pública")) {
    return { code: "APP_URL_MISSING" };
  }
  return { code: "DELIVERY_OUTCOME_UNKNOWN" };
}

export async function deliverOrderNotification(
  notificationId: string,
  database: PrismaClient,
  dependencies: OrderNotificationDependencies = {},
): Promise<OrderNotificationStatus | null> {
  const notification = await database.orderNotification.findUnique({
    where: { id: notificationId },
    include: {
      order: {
        include: {
          buyer: { select: { email: true, emailVerified: true, name: true } },
          producer: { select: { email: true, emailVerified: true, name: true } },
        },
      },
    },
  });
  if (!notification) return null;

  const now = new Date();
  const claimToken = randomUUID();
  const claimed = await database.orderNotification.updateMany({
    where: {
      id: notification.id,
      status: { in: ["PENDING", "RETRY"] },
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: now },
    },
    data: {
      status: "SENDING",
      attempts: { increment: 1 },
      claimToken,
      updatedAt: now,
    },
  });
  if (claimed.count !== 1) {
    const current = await database.orderNotification.findUnique({
      where: { id: notification.id },
      select: { status: true },
    });
    return current?.status ?? null;
  }

  const recipient =
    notification.type === "REQUEST_CREATED"
      ? notification.order.producer
      : notification.order.buyer;
  if (!recipient.emailVerified) {
    const updated = await database.orderNotification.updateMany({
      where: { id: notification.id, status: "SENDING", claimToken },
      data: {
        status: "FAILED",
        claimToken: null,
        lastErrorCode: "RECIPIENT_UNVERIFIED",
      },
    });
    if (updated.count !== 1) {
      const current = await database.orderNotification.findUnique({
        where: { id: notification.id },
        select: { status: true },
      });
      return current?.status ?? null;
    }
    (dependencies.logFailure ?? logFailure)(
      notification.id,
      "RECIPIENT_UNVERIFIED",
      "FAILED",
    );
    return "FAILED";
  }

  const producerView = notification.type === "REQUEST_CREATED";
  const anchor = producerView
    ? `recibida-${notification.orderId}`
    : `solicitud-${notification.orderId}`;

  try {
    const appBaseUrl =
      dependencies.appBaseUrl ?? getPublicAppBaseUrl();
    await (dependencies.sendEmail ?? sendOrderNotificationEmail)({
      email: recipient.email,
      name: recipient.name,
      productName: notification.order.productName,
      quantity: notification.order.requestedQuantity.toString(),
      unit: notification.order.unit,
      priceCOP: notification.order.priceCOP,
      event: notification.type,
      orderUrl: `${appBaseUrl}/mi-cuenta/pedidos#${encodeURIComponent(anchor)}`,
    });
    const updated = await database.orderNotification.updateMany({
      where: { id: notification.id, status: "SENDING", claimToken },
      data: {
        status: "SENT",
        sentAt: new Date(),
        lastErrorCode: null,
        claimToken: null,
      },
    });
    if (updated.count === 1) return "SENT";
  } catch (error) {
    const failure = failureFor(error);
    const configurationFailure =
      failure.code === "CONFIGURATION_MISSING" ||
      failure.code === "APP_URL_MISSING";
    const nextAttempt =
      configurationFailure || notification.attempts + 1 < MAX_ATTEMPTS;
    const status = nextAttempt ? "RETRY" : "FAILED";
    const attemptIndex = Math.min(notification.attempts, RETRY_DELAYS_MS.length - 1);
    const updated = await database.orderNotification.updateMany({
      where: { id: notification.id, status: "SENDING", claimToken },
      data: {
        status,
        lastErrorCode: failure.code,
        ...(configurationFailure ? { attempts: { decrement: 1 } } : {}),
        claimToken: null,
        ...(status === "RETRY"
          ? {
              nextAttemptAt: new Date(
                Date.now() +
                  (configurationFailure
                    ? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
                    : RETRY_DELAYS_MS[attemptIndex]),
              ),
            }
          : {}),
      },
    });
    if (updated.count !== 1) {
      const current = await database.orderNotification.findUnique({
        where: { id: notification.id },
        select: { status: true },
      });
      return current?.status ?? null;
    }
    (dependencies.logFailure ?? logFailure)(
      notification.id,
      failure.code,
      status,
    );
    return status;
  }
  const current = await database.orderNotification.findUnique({
    where: { id: notification.id },
    select: { status: true },
  });
  return current?.status ?? null;
}

export async function deliverOrderEvent(
  orderId: string,
  type: OrderNotificationType,
  database: PrismaClient,
  dependencies: OrderNotificationDependencies = {},
): Promise<OrderNotificationStatus | null> {
  const notification = await database.orderNotification.findUnique({
    where: { orderId_type: { orderId, type } },
    select: { id: true },
  });
  if (!notification) return null;
  return deliverOrderNotification(notification.id, database, dependencies);
}

export async function retryDueOrderNotifications(
  database: PrismaClient,
  now = new Date(),
  dependencies: OrderNotificationDependencies = {},
): Promise<number> {
  await database.orderNotification.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lte: new Date(now.getTime() - SENDING_LEASE_MS) },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: {
      status: "RETRY",
      claimToken: null,
      nextAttemptAt: now,
      lastErrorCode: "DELIVERY_OUTCOME_UNKNOWN",
    },
  });
  await database.orderNotification.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lte: new Date(now.getTime() - SENDING_LEASE_MS) },
      attempts: { gte: MAX_ATTEMPTS },
    },
    data: {
      status: "FAILED",
      claimToken: null,
      lastErrorCode: "DELIVERY_OUTCOME_UNKNOWN",
    },
  });
  await database.orderNotification.updateMany({
    where: {
      status: "UNKNOWN",
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: now },
    },
    data: {
      status: "RETRY",
      claimToken: null,
      lastErrorCode: "DELIVERY_OUTCOME_UNKNOWN",
    },
  });
  await database.orderNotification.updateMany({
    where: {
      status: "UNKNOWN",
      attempts: { gte: MAX_ATTEMPTS },
      nextAttemptAt: { lte: now },
    },
    data: { status: "FAILED", claimToken: null },
  });
  const due = await database.orderNotification.findMany({
    where: {
      status: { in: ["PENDING", "RETRY"] },
      attempts: { lt: MAX_ATTEMPTS },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 50,
    select: { id: true },
  });
  for (const { id } of due) {
    await deliverOrderNotification(id, database, dependencies);
  }
  return due.length;
}
