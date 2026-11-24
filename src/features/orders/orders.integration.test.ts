import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { OrderActor } from "./order-policy";
import { decideOrder, requestOrder } from "./order-service";
import { updateManualProductPrice } from "@/features/products/product-price-audit";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(testDatabaseUrl);

function assertDisposableLocalDatabase(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !localHosts.has(url.hostname) ||
    !/^agricultor_test(?:_|$)/.test(databaseName)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must point to a local disposable agricultor_test database.",
    );
  }
}

function newIdempotencyKey(): string {
  return randomBytes(32).toString("base64url");
}

describe(
  "order persistence and inventory concurrency",
  { skip: enabled ? false : "Set TEST_DATABASE_URL to run against local PostgreSQL." },
  () => {
    let database: PrismaClient;
    let pool: Pool;
    let producer: OrderActor;
    let buyerOne: OrderActor;
    let buyerTwo: OrderActor;
    let reservedProductId: string;
    let contestedProductId: string;
    let idempotentProductId: string;
    let fixtureUserIds: string[] = [];
    const requestOrderWithoutEmail = (
      actor: OrderActor,
      input: Record<string, unknown>,
    ) =>
      requestOrder(actor, input, database, {
        appBaseUrl: "https://agricultor.example.test",
        sendEmail: async () => {},
      });
    const decideOrderWithoutEmail = (
      actor: OrderActor,
      orderId: string,
      decision: string,
    ) =>
      decideOrder(actor, orderId, decision, database, {
        appBaseUrl: "https://agricultor.example.test",
        sendEmail: async () => {},
      });

    before(async () => {
      assertDisposableLocalDatabase(testDatabaseUrl!);
      pool = new Pool({ connectionString: testDatabaseUrl });
      database = new PrismaClient({ adapter: new PrismaPg(pool) });
      await database.$connect();

      const suffix = randomUUID();
      producer = { userId: `order-test-producer-${suffix}`, roles: ["PRODUCER"] };
      buyerOne = { userId: `order-test-buyer-one-${suffix}`, roles: ["BUYER"] };
      buyerTwo = { userId: `order-test-buyer-two-${suffix}`, roles: ["BUYER"] };
      fixtureUserIds = [producer.userId, buyerOne.userId, buyerTwo.userId];

      await database.user.createMany({
        data: fixtureUserIds.map((id) => ({
          id,
          name: "Prueba de integración",
          email: `${id}@example.test`,
          emailVerified: true,
        })),
      });
      await database.userRole.createMany({
        data: [
          { userId: producer.userId, role: "PRODUCER" },
          { userId: buyerOne.userId, role: "BUYER" },
          { userId: buyerTwo.userId, role: "BUYER" },
        ],
      });

      const productFields = {
        ownerId: producer.userId,
        name: "Producto de prueba",
        category: "OTHER",
        unit: "KG",
        priceCOP: 1000,
        municipality: "Local",
        isPublished: true,
        priceReferenceEnabled: true,
      };
      const reservedProduct = await database.product.create({
        data: {
          ...productFields,
          availableQuantity: new Prisma.Decimal("5"),
        },
        select: { id: true },
      });
      const contestedProduct = await database.product.create({
        data: {
          ...productFields,
          name: "Última unidad",
          availableQuantity: new Prisma.Decimal("1"),
        },
        select: { id: true },
      });
      const idempotentProduct = await database.product.create({
        data: {
          ...productFields,
          name: "Producto idempotente",
          availableQuantity: new Prisma.Decimal("5"),
        },
        select: { id: true },
      });
      reservedProductId = reservedProduct.id;
      contestedProductId = contestedProduct.id;
      idempotentProductId = idempotentProduct.id;
    });

    after(async () => {
      if (database) {
        if (fixtureUserIds.length > 0) {
          await database.user.deleteMany({
            where: { id: { in: fixtureUserIds } },
          });
        }
        await database.$disconnect();
        await pool.end();
      }
    });

    it("records the price date independently of stock and publication", async () => {
      const product = await database.product.create({
        data: {
          ownerId: producer.userId,
          name: "Precio del día",
          category: "OTHER",
          unit: "KG",
          priceCOP: 1000,
          municipality: "Local",
          availableQuantity: "5",
        },
      });
      const where = { id: product.id };
      const readPriceDate = async () => {
        const result = await pool.query<{ priceDate: string | null }>(
          'SELECT "priceUpdatedAt"::text AS "priceDate" FROM "Product" WHERE id = $1',
          [product.id],
        );
        return result.rows[0].priceDate;
      };
      assert.ok(await readPriceDate(), "A new product has a price date.");

      // Reproduce a row created before the migration, with no known price date.
      await pool.query('UPDATE "Product" SET "priceUpdatedAt" = NULL WHERE id = $1', [
        product.id,
      ]);
      await database.product.update({
        where,
        data: { availableQuantity: "4", isPublished: true, priceCOP: 1000, unit: "KG" },
      });
      assert.equal(await readPriceDate(), null);

      await database.product.update({ where, data: { priceCOP: 1250 } });
      const firstPriceDate = await readPriceDate();
      assert.ok(firstPriceDate, "Changing the price records a date.");
      await database.product.update({ where, data: { availableQuantity: "3" } });
      assert.equal(await readPriceDate(), firstPriceDate);

      // Use a fixed prior date so the assertion does not depend on clock precision.
      await pool.query(
        'UPDATE "Product" SET "priceUpdatedAt" = TIMESTAMP \'2000-01-01 00:00:00\' WHERE id = $1',
        [product.id],
      );
      await database.product.update({ where, data: { unit: "BULTO" } });
      assert.ok((await readPriceDate())! > "2000-01-01 00:00:00");
    });

    it("keeps manual-review products reservable at the seller's published price", async () => {
      const staleUnit = await requestOrderWithoutEmail(buyerOne, {
        productId: reservedProductId,
        quantity: "2.5",
        expectedUnit: "BULTO",
        expectedPriceCOP: "1000",
        idempotencyKey: newIdempotencyKey(),
      });
      assert.deepEqual(staleUnit, { ok: false, code: "offer-changed" });
      const inventoryBeforeRequest = await database.product.findUniqueOrThrow({
        where: { id: reservedProductId },
      });
      assert.ok(inventoryBeforeRequest.availableQuantity.equals("5"));
      assert.ok(inventoryBeforeRequest.reservedQuantity.equals("0"));

      const request = await requestOrderWithoutEmail(
        buyerOne,
        {
          productId: reservedProductId,
          expectedUnit: "KG",
          expectedPriceCOP: "1000",
          quantity: "2.5",
          idempotencyKey: newIdempotencyKey(),
        },
      );
      assert.equal(request.ok, true);
      if (!request.ok) return;

      const pendingOrder = await database.order.findUniqueOrThrow({
        where: { id: request.orderId },
        include: { history: true },
      });
      assert.equal(pendingOrder.status, "PENDING");
      assert.equal(pendingOrder.priceCOP, 1000);
      assert.equal(pendingOrder.history.length, 1);
      assert.ok(pendingOrder.requestedQuantity.equals("2.5"));

      const reserved = await database.product.findUniqueOrThrow({
        where: { id: reservedProductId },
      });
      assert.ok(reserved.availableQuantity.equals("2.5"));
      assert.ok(reserved.reservedQuantity.equals("2.5"));

      const decisions = await Promise.all([
        decideOrderWithoutEmail(producer, request.orderId, "REJECTED"),
        decideOrderWithoutEmail(producer, request.orderId, "REJECTED"),
      ]);
      assert.deepEqual(decisions.map(({ ok }) => ok), [true, true]);
      const retriedDecision = await decideOrderWithoutEmail(
        producer,
        request.orderId,
        "REJECTED",
      );
      assert.equal(retriedDecision.ok, true);
      const oppositeDecision = await decideOrderWithoutEmail(
        producer,
        request.orderId,
        "ACCEPTED",
      );
      assert.deepEqual(oppositeDecision, {
        ok: false,
        code: "already-decided",
      });

      const rejectedOrder = await database.order.findUniqueOrThrow({
        where: { id: request.orderId },
        include: { history: true },
      });
      assert.equal(rejectedOrder.status, "REJECTED");
      assert.equal(rejectedOrder.history.length, 2);

      const restored = await database.product.findUniqueOrThrow({
        where: { id: reservedProductId },
      });
      assert.ok(restored.availableQuantity.equals("5"));
      assert.ok(restored.reservedQuantity.equals("0"));
    });

    it("audits manual price changes once and enforces owner and expected-price checks", async () => {
      const product = await database.product.create({
        data: {
          ownerId: producer.userId,
          name: "Precio con historial",
          category: "OTHER",
          unit: "KG",
          priceCOP: 1000,
          municipality: "Local",
          availableQuantity: "2",
        },
        select: { id: true },
      });
      const observedAt = new Date("2026-11-24T12:00:00.000Z");
      const input = {
        productId: product.id,
        unit: "KG",
        expectedPriceCOP: 1000,
        newPriceCOP: 1250,
      };

      const attempts = await Promise.all([
        updateManualProductPrice(producer, input, database, observedAt),
        updateManualProductPrice(producer, input, database, observedAt),
      ]);
      assert.equal(attempts.every(({ ok }) => ok), true);
      assert.equal(
        attempts.filter((result) => result.ok && result.changed).length,
        1,
      );
      assert.deepEqual(
        await updateManualProductPrice(producer, input, database, observedAt),
        { ok: true, changed: false },
      );
      assert.deepEqual(
        await updateManualProductPrice(
          buyerOne,
          { ...input, newPriceCOP: 1300 },
          database,
          observedAt,
        ),
        { ok: false, code: "unauthorized" },
      );
      assert.deepEqual(
        await updateManualProductPrice(
          { userId: buyerOne.userId, roles: ["PRODUCER"] },
          { ...input, newPriceCOP: 1300 },
          database,
          observedAt,
        ),
        { ok: false, code: "not-found" },
      );
      assert.deepEqual(
        await updateManualProductPrice(
          producer,
          { ...input, expectedPriceCOP: 1000, newPriceCOP: 1300 },
          database,
          observedAt,
        ),
        { ok: false, code: "conflict" },
      );

      const changes = await database.productPriceChange.findMany({
        where: { productId: product.id },
      });
      assert.equal(changes.length, 1);
      assert.equal(changes[0].oldPriceCOP, 1000);
      assert.equal(changes[0].newPriceCOP, 1250);
      assert.equal(changes[0].source, "PRODUCER_MANUAL");
      assert.equal(changes[0].observedAt.toISOString(), observedAt.toISOString());
      assert.equal(changes[0].appliedAt.toISOString(), observedAt.toISOString());
      assert.equal(changes[0].actorId, producer.userId);
      assert.equal(
        changes[0].reason,
        "Precio confirmado manualmente por el productor.",
      );
    });

    it("replays concurrent requests by buyer key without reserving twice", async () => {
      const idempotencyKey = newIdempotencyKey();
      const requests = await Promise.all([
        requestOrderWithoutEmail(
          buyerOne,
          {
            productId: idempotentProductId,
            expectedUnit: "KG",
            expectedPriceCOP: "1000",
            quantity: "2",
            idempotencyKey,
          },
        ),
        requestOrderWithoutEmail(
          buyerOne,
          {
            productId: idempotentProductId,
            expectedUnit: "KG",
            expectedPriceCOP: "1000",
            quantity: "2,000",
            idempotencyKey,
          },
        ),
      ]);

      assert.equal(requests[0].ok, true);
      assert.equal(requests[1].ok, true);
      if (!requests[0].ok || !requests[1].ok) return;
      assert.equal(requests[0].orderId, requests[1].orderId);
      assert.equal(
        await database.orderNotification.count({
          where: { orderId: requests[0].orderId, type: "REQUEST_CREATED" },
        }),
        1,
      );

      const replay = await requestOrderWithoutEmail(
        buyerOne,
        {
          productId: idempotentProductId,
          expectedUnit: "KG",
          expectedPriceCOP: "1000",
          quantity: "2.000",
          idempotencyKey,
        },
      );
      assert.deepEqual(replay, requests[0]);

      const differentBuyerRequest = await requestOrderWithoutEmail(
        buyerTwo,
        {
          productId: idempotentProductId,
          expectedUnit: "KG",
          expectedPriceCOP: "1000",
          quantity: "1",
          idempotencyKey,
        },
      );
      assert.equal(differentBuyerRequest.ok, true);
      if (!differentBuyerRequest.ok) return;
      assert.notEqual(differentBuyerRequest.orderId, requests[0].orderId);

      const conflictingPayload = await requestOrderWithoutEmail(
        buyerOne,
        {
          productId: idempotentProductId,
          expectedUnit: "KG",
          expectedPriceCOP: "1000",
          quantity: "2.5",
          idempotencyKey,
        },
      );
      assert.deepEqual(conflictingPayload, {
        ok: false,
        code: "idempotency-conflict",
      });

      assert.equal(
        await database.order.count({
          where: { buyerId: buyerOne.userId, productId: idempotentProductId },
        }),
        1,
      );
      const buyerOrder = await database.order.findUniqueOrThrow({
        where: { id: requests[0].orderId },
        include: { history: true },
      });
      assert.equal(buyerOrder.history.length, 1);
      const product = await database.product.findUniqueOrThrow({
        where: { id: idempotentProductId },
      });
      assert.ok(product.availableQuantity.equals("2"));
      assert.ok(product.reservedQuantity.equals("3"));
    });

    it("allows only one concurrent request for the final unit", async () => {
      const requests = await Promise.all([
        requestOrderWithoutEmail(
          buyerOne,
          {
            productId: contestedProductId,
            expectedUnit: "KG",
            expectedPriceCOP: "1000",
            quantity: "1",
            idempotencyKey: newIdempotencyKey(),
          },
        ),
        requestOrderWithoutEmail(
          buyerTwo,
          {
            productId: contestedProductId,
            expectedUnit: "KG",
            expectedPriceCOP: "1000",
            quantity: "1",
            idempotencyKey: newIdempotencyKey(),
          },
        ),
      ]);
      const successful = requests.filter((request) => request.ok);

      assert.equal(successful.length, 1);
      assert.equal(
        requests.filter(
          (request) => !request.ok && request.code === "unavailable",
        ).length,
        1,
      );

      const product = await database.product.findUniqueOrThrow({
        where: { id: contestedProductId },
      });
      assert.ok(product.availableQuantity.equals("0"));
      assert.ok(product.reservedQuantity.equals("1"));

      const [request] = successful;
      if (request.ok) {
        const accepted = await decideOrderWithoutEmail(
          producer,
          request.orderId,
          "ACCEPTED",
        );
        assert.equal(accepted.ok, true);
        const acceptedInventory = await database.product.findUniqueOrThrow({
          where: { id: contestedProductId },
        });
        assert.ok(acceptedInventory.availableQuantity.equals("0"));
        assert.ok(acceptedInventory.reservedQuantity.equals("0"));
      }
    });
  },
);
