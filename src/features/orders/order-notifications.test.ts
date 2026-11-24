import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OrderNotificationStatus } from "@/generated/prisma/enums";
import {
  BrevoRejectedEmailError,
  type OrderNotificationEmail,
} from "@/lib/email/brevo";
import { deliverOrderNotification } from "./order-notifications";
import { decideOrder, requestOrder } from "./order-service";

function fakeDatabase(
  status: "PENDING" | "SENT" = "PENDING",
  type: "REQUEST_CREATED" | "REQUEST_ACCEPTED" | "REQUEST_REJECTED" = "REQUEST_CREATED",
) {
  let currentStatus: OrderNotificationStatus = status;
  let attempts = 0;
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
      findUnique: async () => ({ ...notification, status: currentStatus, attempts }),
      updateMany: async () => {
        if (currentStatus !== "PENDING") return { count: 0 };
        currentStatus = "SENDING";
        attempts += 1;
        return { count: 1 };
      },
      update: async ({ data }: { data: { status: typeof currentStatus } }) => {
        currentStatus = data.status;
        return { status: currentStatus };
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

describe("order email outbox delivery", () => {
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

    const unknown = fakeDatabase();
    const unknownStatus = await deliverOrderNotification(
      "notification-1",
      unknown.database,
      {
        appBaseUrl: "https://agricultor.example.test",
        sendEmail: async () => {
          throw new Error("network timeout");
        },
        logFailure: () => {},
      },
    );
    assert.equal(unknownStatus, "UNKNOWN");
    assert.equal(unknown.status, "UNKNOWN");
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

  it("does not query or enqueue anything for an unauthorized reservation", async () => {
    const result = await requestOrder(
      { userId: "seller-1", roles: ["PRODUCER"] },
      {},
      {} as PrismaClient,
    );
    assert.deepEqual(result, { ok: false, code: "unauthorized" });

    const decision = await decideOrder(
      { userId: "buyer-1", roles: ["BUYER"] },
      "order-1",
      "ACCEPTED",
      {} as PrismaClient,
    );
    assert.deepEqual(decision, { ok: false, code: "unauthorized" });
  });
});
