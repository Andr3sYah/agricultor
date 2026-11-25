import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OrderNotificationStatus } from "@/generated/prisma/enums";
import {
  BrevoRejectedEmailError,
  type OrderNotificationEmail,
  sendOrderNotificationEmail,
} from "@/lib/email/brevo";
import {
  deliverOrderNotification,
  retryDueOrderNotifications,
} from "./order-notifications";
import { decideOrder, requestOrder } from "./order-service";

function fakeDatabase(
  status: "PENDING" | "SENT" = "PENDING",
  type: "REQUEST_CREATED" | "REQUEST_ACCEPTED" | "REQUEST_REJECTED" = "REQUEST_CREATED",
) {
  let currentStatus: OrderNotificationStatus = status;
  let attempts = 0;
  let claimToken: string | null = null;
  type UpdateArgs = {
    where: {
      id?: string;
      status?: string | { in: string[] };
      claimToken?: string;
      attempts?: { lt?: number; gte?: number };
      updatedAt?: { lte: Date };
      nextAttemptAt?: { lte: Date };
    };
    data: {
      status?: OrderNotificationStatus;
      attempts?: { increment?: number; decrement?: number };
      claimToken?: string | null;
      nextAttemptAt?: Date;
      lastErrorCode?: string | null;
      sentAt?: Date;
      updatedAt?: Date;
    };
  };
  const notification = {
    id: "notification-1",
    orderId: "order-1",
    type,
    status: currentStatus,
    attempts,
    nextAttemptAt: new Date("2026-01-01T00:00:00Z"),
    order: {
      productName: "Papa",
      requestedQuantity: { toString: () => "2" },
      unit: "KG",
      priceCOP: 1200,
      buyer: { email: "buyer@example.test", emailVerified: true, name: "Buyer" },
      producer: { email: "seller@example.test", emailVerified: true, name: "Seller" },
    },
  };
  const database = {
    orderNotification: {
      findUnique: async () => ({
        ...notification,
        status: currentStatus,
        attempts,
        claimToken,
      }),
      findMany: async () =>
        currentStatus === "PENDING" || currentStatus === "RETRY"
          ? [{ id: notification.id }]
          : [],
      updateMany: async ({ where, data }: UpdateArgs) => {
        const statusMatches =
          typeof where.status === "object"
            ? where.status.in.includes(currentStatus)
            : where.status === undefined || where.status === currentStatus;
        if (
          statusMatches &&
          where.claimToken === undefined &&
          where.attempts?.lt !== undefined &&
          attempts < where.attempts.lt &&
          currentStatus !== "SENDING" &&
          currentStatus !== "SENT"
        ) {
          currentStatus = data.status ?? currentStatus;
          attempts += data.attempts?.increment ?? 0;
          claimToken = typeof data.claimToken === "string" ? data.claimToken : null;
          return { count: 1 };
        }
        if (
          currentStatus !== "SENDING" ||
          !where.claimToken ||
          where.claimToken !== claimToken
        ) {
          return { count: 0 };
        }
        currentStatus = data.status ?? currentStatus;
        attempts += data.attempts?.increment ?? 0;
        attempts -= data.attempts?.decrement ?? 0;
        claimToken = typeof data.claimToken === "string" ? data.claimToken : null;
        if (data.nextAttemptAt) {
          notification.nextAttemptAt = data.nextAttemptAt;
        }
        return { count: 1 };
      },
    },
  };
  return {
    database: database as unknown as PrismaClient,
    get status() {
      return currentStatus;
    },
  };
}

function reservationDatabase() {
  let committed = false;
  let orderCreated = false;
  let eventCreated = false;
  let status: OrderNotificationStatus = "PENDING";
  let attempts = 0;
  let claimToken: string | null = null;
  const notification = {
    id: "notification-1",
    orderId: "order-1",
    type: "REQUEST_CREATED" as const,
    status,
    attempts,
    nextAttemptAt: new Date("2026-01-01T00:00:00Z"),
    order: {
      productName: "Papa",
      requestedQuantity: { toString: () => "2" },
      unit: "KG",
      priceCOP: 1200,
      buyer: { email: "buyer@example.test", emailVerified: true, name: "Buyer" },
      producer: { email: "seller@example.test", emailVerified: true, name: "Seller" },
    },
  };
  const transaction = {
    $queryRaw: async () => [],
    product: {
      findUnique: async ({ select }: { select: Record<string, boolean> }) =>
        "ownerId" in select
          ? {
              id: "product-1",
              ownerId: "producer-1",
              isPublished: true,
              unit: "KG",
              priceCOP: 1200,
            }
          : { name: "Papa", unit: "KG", priceCOP: 1200 },
      updateMany: async () => ({ count: 1 }),
    },
    order: {
      findFirst: async () => null,
      create: async () => {
        orderCreated = true;
        return { id: "order-1" };
      },
    },
    orderNotification: {
      create: async () => {
        eventCreated = true;
        return { id: notification.id };
      },
    },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      const result = await callback(transaction);
      committed = true;
      return result;
    },
    orderNotification: {
      findUnique: async () => ({
        ...notification,
        status,
        attempts,
        claimToken,
      }),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          status?: string | { in: string[] };
          claimToken?: string;
        };
        data: {
          status?: OrderNotificationStatus;
          attempts?: { increment?: number };
          claimToken?: string | null;
          lastErrorCode?: string | null;
          nextAttemptAt?: Date;
        };
      }) => {
        if (
          typeof where.status === "object" &&
          where.status.in.includes(status) &&
          status !== "SENDING" &&
          status !== "SENT"
        ) {
          status = data.status ?? status;
          attempts += data.attempts?.increment ?? 0;
          claimToken = typeof data.claimToken === "string" ? data.claimToken : null;
          return { count: 1 };
        }
        if (
          status !== "SENDING" ||
          !where.claimToken ||
          where.claimToken !== claimToken
        ) {
          return { count: 0 };
        }
        status = data.status ?? status;
        claimToken = typeof data.claimToken === "string" ? data.claimToken : null;
        if (data.nextAttemptAt) notification.nextAttemptAt = data.nextAttemptAt;
        return { count: 1 };
      },
    },
  };
  return {
    database: database as unknown as PrismaClient,
    get committed() {
      return committed;
    },
    get orderCreated() {
      return orderCreated;
    },
    get eventCreated() {
      return eventCreated;
    },
    get status() {
      return status;
    },
  };
}

describe("order email outbox delivery", () => {
  it("commits the reservation and outbox before an immediate email failure", async () => {
    const fake = reservationDatabase();
    const result = await requestOrder(
      { userId: "buyer-1", roles: ["BUYER"] },
      {
        productId: "product-1",
        quantity: "2",
        expectedUnit: "KG",
        expectedPriceCOP: "1200",
        idempotencyKey: "a".repeat(43),
      },
      fake.database,
      {
        appBaseUrl: "https://agricultor.example.test",
        sendEmail: async () => {
          assert.equal(fake.committed, true);
          throw new Error("provider unavailable");
        },
        logFailure: () => {},
      },
    );

    assert.deepEqual(result, { ok: true, orderId: "order-1" });
    assert.equal(fake.committed, true);
    assert.equal(fake.orderCreated, true);
    assert.equal(fake.eventCreated, true);
    assert.equal(fake.status, "RETRY");
  });

  it("sends a seller request notice once and claims it idempotently", async () => {
    const fake = fakeDatabase();
    const messages: OrderNotificationEmail[] = [];
    const dependencies = {
      appBaseUrl: "https://agricultor.example.test",
      sendEmail: async (message: OrderNotificationEmail) => {
        messages.push(message);
      },
      logFailure: () => assert.fail("Unexpected delivery failure."),
    };

    assert.equal(
      await deliverOrderNotification("notification-1", fake.database, dependencies),
      "SENT",
    );
    assert.equal(
      await deliverOrderNotification("notification-1", fake.database, dependencies),
      "SENT",
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0].email, "seller@example.test");
    assert.equal(messages[0].event, "REQUEST_CREATED");
    assert.match(messages[0].orderUrl, /#recibida-order-1$/);
    assert.equal(fake.status, "SENT");
  });

  it("records provider and ambiguous transport failures without logging recipient data", async () => {
    const fake = fakeDatabase();
    const logs: Array<{ notificationId: string; code: string; status: string }> = [];
    const status = await deliverOrderNotification("notification-1", fake.database, {
      appBaseUrl: "https://agricultor.example.test",
      sendEmail: async () => {
        throw new BrevoRejectedEmailError(429);
      },
      logFailure: (notificationId, code, deliveryStatus) => {
        logs.push({ notificationId, code, status: deliveryStatus });
      },
    });

    assert.equal(status, "RETRY");
    assert.equal(fake.status, "RETRY");
    assert.deepEqual(logs, [{
      notificationId: "notification-1",
      code: "BREVO_HTTP_429",
      status: "RETRY",
    }]);

    const unavailable = fakeDatabase();
    assert.equal(
      await deliverOrderNotification(
        "notification-1",
        unavailable.database,
        {
          appBaseUrl: "https://agricultor.example.test",
          sendEmail: async () => {
            throw new BrevoRejectedEmailError(503);
          },
          logFailure: () => {},
        },
      ),
      "RETRY",
    );
    assert.equal(unavailable.status, "RETRY");

    const timeout = fakeDatabase();
    const statuses: string[] = [];
    let sendCount = 0;
    const dependencies = {
      appBaseUrl: "https://agricultor.example.test",
      sendEmail: async () => {
        sendCount += 1;
        if (sendCount === 1) {
          throw new DOMException("The operation timed out.", "TimeoutError");
        }
      },
      logFailure: (_id: string, _code: string, deliveryStatus: string) => {
        statuses.push(deliveryStatus);
      },
    };
    assert.equal(
      await deliverOrderNotification("notification-1", timeout.database, dependencies),
      "RETRY",
    );
    assert.equal(timeout.status, "RETRY");
    assert.equal(statuses[0], "RETRY");

    await retryDueOrderNotifications(
      timeout.database,
      new Date(Date.now() + 60_001),
      dependencies,
    );
    assert.equal(sendCount, 2);
    assert.equal(timeout.status, "SENT");
  });

  it("notifies only the buyer when a producer answers a request", async () => {
    const fake = fakeDatabase("PENDING", "REQUEST_ACCEPTED");
    const messages: OrderNotificationEmail[] = [];
    const result = await deliverOrderNotification(
      "notification-1",
      fake.database,
      {
        appBaseUrl: "https://agricultor.example.test",
        sendEmail: async (message) => {
          messages.push(message);
        },
        logFailure: () => assert.fail("Unexpected delivery failure."),
      },
    );

    assert.equal(result, "SENT");
    assert.equal(messages[0].email, "buyer@example.test");
    assert.equal(messages[0].event, "REQUEST_ACCEPTED");
    assert.match(messages[0].orderUrl, /#solicitud-order-1$/);
  });

  it("uses a single active claim when two workers dispatch the same event", async () => {
    const fake = fakeDatabase();
    let sendCount = 0;
    let releaseSend!: () => void;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const first = deliverOrderNotification("notification-1", fake.database, {
      appBaseUrl: "https://agricultor.example.test",
      sendEmail: async () => {
        sendCount += 1;
        await sendGate;
      },
    });
    await Promise.resolve();
    const second = await deliverOrderNotification("notification-1", fake.database, {
      appBaseUrl: "https://agricultor.example.test",
      sendEmail: async () => {
        sendCount += 1;
      },
    });
    assert.equal(second, "SENDING");
    releaseSend();
    assert.equal(await first, "SENT");
    assert.equal(sendCount, 1);
    assert.equal(fake.status, "SENT");
  });

  it("applies a bounded timeout to provider requests without using the network", async () => {
    await assert.rejects(
      sendOrderNotificationEmail(
        {
          email: "seller@example.test",
          name: "Seller",
          productName: "Papa",
          quantity: "1",
          unit: "KG",
          priceCOP: 1000,
          orderUrl: "https://agricultor.example.test/mi-cuenta/pedidos",
          event: "REQUEST_CREATED",
        },
        {
          apiKey: "test-api-key",
          senderEmail: "no-reply@example.test",
          timeoutMs: 5,
          fetcher: (_url, init) =>
            new Promise((_resolve, reject) => {
              const signal = init?.signal;
              if (!signal) {
                reject(new Error("Expected an abort signal."));
              } else if (signal.aborted) {
                reject(signal.reason);
              } else {
                signal.addEventListener("abort", () => reject(signal.reason), {
                  once: true,
                });
              }
            }),
        },
      ),
      (error: unknown) =>
        error instanceof DOMException && error.name === "TimeoutError",
    );
  });

  it("does not query or enqueue anything for an unauthorized reservation", async () => {
    const result = await requestOrder(
      { userId: "seller-1", roles: ["PRODUCER"] },
      {},
      {} as PrismaClient,
    );
    assert.deepEqual(result, { ok: false, code: "unauthorized" });
    const anonymous = await requestOrder(null, {}, {} as PrismaClient);
    assert.deepEqual(anonymous, { ok: false, code: "unauthenticated" });

    const decision = await decideOrder(
      { userId: "buyer-1", roles: ["BUYER"] },
      "order-1",
      "ACCEPTED",
      {} as PrismaClient,
    );
    assert.deepEqual(decision, { ok: false, code: "unauthorized" });
  });
});
