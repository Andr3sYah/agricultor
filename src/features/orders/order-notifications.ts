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

function failureFor(error: unknown): {
  status: "RETRY" | "FAILED" | "UNKNOWN";
  code: string;
} {
  if (error instanceof BrevoConfigurationError) {
    return { status: "RETRY", code: error.code };
  }
  if (error instanceof BrevoRejectedEmailError) {
    return error.status === 429
      ? { status: "RETRY", code: `BREVO_HTTP_${error.status}` }
      : { status: "FAILED", code: `BREVO_HTTP_${error.status}` };
  }
  if (error instanceof Error && error.message.includes("URL pública")) {
    return { status: "RETRY", code: "APP_URL_MISSING" };
  }
  return { status: "UNKNOWN", code: "DELIVERY_OUTCOME_UNKNOWN" };
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
      updatedAt: now,
    },
  });
  if (claimed.count !== 1) return notification.status;

  const recipient =
    notification.type === "REQUEST_CREATED"
      ? notification.order.producer
      : notification.order.buyer;
  if (!recipient.emailVerified) {
    await database.orderNotification.update({
      where: { id: notification.id },
      data: { status: "FAILED", lastErrorCode: "RECIPIENT_UNVERIFIED" },
    });
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
    await database.orderNotification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        lastErrorCode: null,
      },
    });
    return "SENT";
  } catch (error) {
    const failure = failureFor(error);
    const configurationFailure =
      failure.code === "CONFIGURATION_MISSING" ||
      failure.code === "APP_URL_MISSING";
    const nextAttempt =
      failure.status === "RETRY" &&
      (configurationFailure || notification.attempts + 1 < MAX_ATTEMPTS);
    const status = nextAttempt ? "RETRY" : failure.status === "RETRY" ? "FAILED" : failure.status;
    const attemptIndex = Math.min(notification.attempts, RETRY_DELAYS_MS.length - 1);
    await database.orderNotification.update({
      where: { id: notification.id },
      data: {
        status,
        lastErrorCode: failure.code,
        ...(configurationFailure ? { attempts: { decrement: 1 } } : {}),
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
    (dependencies.logFailure ?? logFailure)(
      notification.id,
      failure.code,
      status,
    );
    return status;
  }
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
): Promise<number> {
  await database.orderNotification.updateMany({
    where: {
      status: "SENDING",
      updatedAt: { lte: new Date(now.getTime() - SENDING_LEASE_MS) },
    },
    data: {
      status: "UNKNOWN",
      lastErrorCode: "DELIVERY_OUTCOME_UNKNOWN",
    },
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
    await deliverOrderNotification(id, database);
  }
  return due.length;
}
