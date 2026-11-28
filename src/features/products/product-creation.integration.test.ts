import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createProducerProduct,
  setProducerProductPublication,
} from "./product-creation";
import type { ProductActor } from "./product-access";
import type { ProductInput } from "./product-validation";

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

function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Tomate de prueba",
    category: "VEGETABLES",
    availableQuantity: "2.5",
    unit: "KG",
    pricingType: "FIXED",
    priceCOP: 2500,
    municipality: "Local",
    ...overrides,
  };
}

describe(
  "direct product creation and publication",
  { skip: enabled ? false : "Set TEST_DATABASE_URL to run against local PostgreSQL." },
  () => {
    let database: PrismaClient;
    let pool: Pool;
    let completeProducer: ProductActor;
    let incompleteProducer: ProductActor;
    let buyer: ProductActor;
    let otherProducer: ProductActor;
    let fixtureUserIds: string[] = [];

    before(async () => {
      assertDisposableLocalDatabase(testDatabaseUrl!);
      pool = new Pool({ connectionString: testDatabaseUrl });
      database = new PrismaClient({ adapter: new PrismaPg(pool) });
      await database.$connect();

      const suffix = randomUUID();
      completeProducer = { userId: `sale-test-complete-${suffix}`, roles: ["PRODUCER"] };
      incompleteProducer = { userId: `sale-test-incomplete-${suffix}`, roles: ["PRODUCER"] };
      buyer = { userId: `sale-test-buyer-${suffix}`, roles: ["BUYER"] };
      otherProducer = { userId: `sale-test-other-${suffix}`, roles: ["PRODUCER"] };
      fixtureUserIds = [
        completeProducer.userId,
        incompleteProducer.userId,
        buyer.userId,
        otherProducer.userId,
      ];

      await database.user.createMany({
        data: fixtureUserIds.map((id) => ({
          id,
          name: "Prueba de venta directa",
          email: `${id}@example.test`,
          emailVerified: true,
        })),
      });
      await database.userRole.createMany({
        data: [
          { userId: completeProducer.userId, role: "PRODUCER" },
          { userId: incompleteProducer.userId, role: "PRODUCER" },
          { userId: buyer.userId, role: "BUYER" },
          { userId: otherProducer.userId, role: "PRODUCER" },
        ],
      });
      await database.sellerProfile.create({
        data: {
          ownerId: completeProducer.userId,
          name: "Productor de prueba",
          description: "Perfil de prueba para ofertas públicas",
          municipality: "Local",
          neighborhood: "El Porvenir",
          phone: "573001234567",
          phonePublic: true,
          email: "productor@example.test",
          emailPublic: true,
          publicContactConsentAt: new Date(),
        },
      });
      await database.sellerProfile.create({
        data: {
          ownerId: incompleteProducer.userId,
          name: "Vendedor sin teléfono",
          description: "Perfil que no puede publicar sin un teléfono válido.",
          municipality: "Local",
          neighborhood: "El Porvenir",
          phone: null,
          phonePublic: false,
          email: "sin-telefono@example.test",
          emailPublic: true,
          publicContactConsentAt: new Date(),
        },
      });
    });

    after(async () => {
      if (database) {
        if (fixtureUserIds.length > 0) {
          await database.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
        }
        await database.$disconnect();
        await pool.end();
      }
    });

    it("creates fixed and negotiable offers with inventory in one published product record", async () => {
      const fixed = await createProducerProduct(
        completeProducer,
        productInput(),
        true,
        database,
      );
      const negotiable = await createProducerProduct(
        completeProducer,
        productInput({
          name: "Yuca para negociar",
          pricingType: "NEGOTIABLE",
          priceCOP: null,
          availableQuantity: "4",
        }),
        true,
        database,
      );

      assert.equal(fixed.ok, true);
      assert.equal(negotiable.ok, true);
      if (!fixed.ok || !negotiable.ok) return;

      const fixedProduct = await database.product.findUniqueOrThrow({
        where: { id: fixed.productId },
      });
      assert.equal(fixedProduct.isPublished, true);
      assert.equal(fixedProduct.pricingType, "FIXED");
      assert.equal(fixedProduct.priceCOP, 2500);
      assert.equal(fixedProduct.photoUrl, null);
      assert.ok(fixedProduct.availableQuantity.equals("2.5"));

      const negotiableProduct = await database.product.findUniqueOrThrow({
        where: { id: negotiable.productId },
      });
      assert.equal(negotiableProduct.isPublished, true);
      assert.equal(negotiableProduct.pricingType, "NEGOTIABLE");
      assert.equal(negotiableProduct.priceCOP, null);
      assert.equal(negotiableProduct.priceReferenceEnabled, false);
      assert.equal(negotiableProduct.photoUrl, null);
      assert.ok(negotiableProduct.availableQuantity.equals("4"));
    });

    it("does not create an offer without a valid public contact phone or stock", async () => {
      const beforeCount = await database.product.count({
        where: { ownerId: incompleteProducer.userId },
      });
      const missingProfile = await createProducerProduct(
        incompleteProducer,
        productInput(),
        true,
        database,
      );
      assert.deepEqual(missingProfile, {
        ok: false,
        code: "seller-profile-incomplete",
      });
      assert.equal(
        await database.product.count({ where: { ownerId: incompleteProducer.userId } }),
        beforeCount,
      );

      const zeroStock = await createProducerProduct(
        completeProducer,
        productInput({ availableQuantity: "0" }),
        true,
        database,
      );
      assert.deepEqual(zeroStock, { ok: false, code: "unavailable" });
    });

    it("allows zero-stock private inventory while rejecting unauthorized direct sales", async () => {
      const privateProduct = await createProducerProduct(
        incompleteProducer,
        productInput({ availableQuantity: "0" }),
        false,
        database,
      );
      assert.equal(privateProduct.ok, true);
      if (privateProduct.ok) {
        const saved = await database.product.findUniqueOrThrow({
          where: { id: privateProduct.productId },
        });
        assert.equal(saved.isPublished, false);
        assert.ok(saved.availableQuantity.equals(0));
        assert.deepEqual(
          await setProducerProductPublication(
            incompleteProducer,
            privateProduct.productId,
            true,
            database,
          ),
          { ok: false, code: "unavailable" },
        );
        assert.equal(
          (await database.product.findUniqueOrThrow({
            where: { id: privateProduct.productId },
          })).isPublished,
          false,
        );
      }

      const buyerCount = await database.product.count({
        where: { ownerId: buyer.userId },
      });
      const unauthorized = await createProducerProduct(
        buyer,
        productInput(),
        true,
        database,
      );
      assert.deepEqual(unauthorized, { ok: false, code: "unauthorized" });
      assert.equal(
        await database.product.count({ where: { ownerId: buyer.userId } }),
        buyerCount,
      );
    });

    it("requires the owner and a complete profile to publish, and allows unpublishing", async () => {
      const saved = await createProducerProduct(
        completeProducer,
        productInput({ name: "Oferta temporal" }),
        false,
        database,
      );
      assert.equal(saved.ok, true);
      if (!saved.ok) return;

      assert.deepEqual(
        await setProducerProductPublication(
          otherProducer,
          saved.productId,
          true,
          database,
        ),
        { ok: false, code: "unavailable" },
      );
      assert.deepEqual(
        await setProducerProductPublication(
          completeProducer,
          saved.productId,
          true,
          database,
        ),
        { ok: true },
      );
      assert.equal(
        (await database.product.findUniqueOrThrow({ where: { id: saved.productId } }))
          .isPublished,
        true,
      );
      assert.deepEqual(
        await setProducerProductPublication(
          completeProducer,
          saved.productId,
          false,
          database,
        ),
        { ok: true },
      );
      assert.equal(
        (await database.product.findUniqueOrThrow({ where: { id: saved.productId } }))
          .isPublished,
        false,
      );

      const incompleteProduct = await createProducerProduct(
        incompleteProducer,
        productInput(),
        false,
        database,
      );
      assert.equal(incompleteProduct.ok, true);
      if (!incompleteProduct.ok) return;
      assert.deepEqual(
        await setProducerProductPublication(
          incompleteProducer,
          incompleteProduct.productId,
          true,
          database,
        ),
        { ok: false, code: "seller-profile-incomplete" },
      );
      assert.equal(
        (await database.product.findUniqueOrThrow({
          where: { id: incompleteProduct.productId },
        })).isPublished,
        false,
      );
    });
  },
);
