import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  type FavoriteActor,
  type FavoritesDatabase,
} from "./favorite-service";

const buyerOne: FavoriteActor = { userId: "buyer-one", roles: ["BUYER"] };
const buyerTwo: FavoriteActor = { userId: "buyer-two", roles: ["BUYER"] };

function createDatabase() {
  const products = new Set(["product-1", "product-2"]);
  const favorites = new Set<string>();
  const queries: unknown[] = [];
  const database = {
    product: {
      findFirst: async (args: unknown) => {
        queries.push(args);
        const where = (
          args as {
            where: {
              id: string;
              isPublished: boolean;
              OR?: Array<{ availableQuantity?: { gt: number }; reservedQuantity?: { gt: number } }>;
            };
          }
        ).where;
        return where.isPublished &&
          Boolean(where.OR?.some((condition) => condition.availableQuantity?.gt === 0)) &&
          products.has(where.id)
          ? { id: where.id }
          : null;
      },
    },
    favorite: {
      upsert: async (args: unknown) => {
        queries.push(args);
        const { userId, productId } = (
          args as {
            create: { userId: string; productId: string };
          }
        ).create;
        favorites.add(`${userId}:${productId}`);
        return {};
      },
      deleteMany: async (args: unknown) => {
        queries.push(args);
        const { userId, productId } = (
          args as {
            where: { userId: string; productId: string };
          }
        ).where;
        const existed = favorites.delete(`${userId}:${productId}`);
        return { count: existed ? 1 : 0 };
      },
      findMany: async (args: unknown) => {
        queries.push(args);
        const { userId } = (
          args as {
            where: {
              userId: string;
              product: { isPublished: boolean; availableQuantity: { gt: number } };
            };
          }
        ).where;
        if (!favorites.has(`${userId}:product-1`)) {
          return [];
        }
        return [
          {
            product: {
              id: "product-1",
              name: "Maíz",
              category: "GRAINS",
              availableQuantity: { toString: () => "2.5" },
              unit: "KG",
              priceCOP: 1200,
              municipality: "Pasto",
            },
          },
        ];
      },
    },
  };
  return {
    database: database as unknown as FavoritesDatabase,
    favorites,
    queries,
  };
}

describe("favorite authorization and isolation", () => {
  it("requires authentication and the buyer role before accessing persistence", async () => {
    const { database, queries } = createDatabase();
    assert.deepEqual(await addFavorite(null, "product-1", database), {
      ok: false,
      code: "unauthenticated",
    });
    assert.deepEqual(
      await addFavorite(
        { userId: "producer", roles: ["PRODUCER"] },
        "product-1",
        database,
      ),
      { ok: false, code: "unauthorized" },
    );
    assert.deepEqual(
      await listFavorites(
        { userId: "trader", roles: ["TRADER"] },
        database,
      ),
      { ok: false, code: "unauthorized" },
    );
    assert.equal(queries.length, 0);
  });

  it("scopes removal and listing to the current buyer", async () => {
    const { database, favorites, queries } = createDatabase();
    await addFavorite(buyerOne, "product-1", database);
    await addFavorite(buyerTwo, "product-1", database);

    assert.deepEqual(
      await removeFavorite(buyerTwo, "product-1", database),
      { ok: true },
    );
    assert.equal(favorites.has("buyer-one:product-1"), true);
    assert.equal(favorites.has("buyer-two:product-1"), false);

    const result = await listFavorites(buyerOne, database);
    assert.deepEqual(
      result.ok && result.products.map(({ id, availableQuantity }) => [
        id,
        availableQuantity,
      ]),
      [["product-1", "2.5"]],
    );
    assert.deepEqual(
      (queries.at(-1) as { where: unknown }).where,
      {
        userId: "buyer-one",
        product: {
          isPublished: true,
          OR: [
            { availableQuantity: { gt: 0 } },
            { reservedQuantity: { gt: 0 } },
          ],
        },
      },
    );
  });
});

describe("favorite uniqueness and idempotency", () => {
  it("upserts on the user/product key and treats repeated saves and removals as success", async () => {
    const { database, favorites, queries } = createDatabase();

    assert.deepEqual(await addFavorite(buyerOne, "product-1", database), {
      ok: true,
    });
    assert.deepEqual(await addFavorite(buyerOne, "product-1", database), {
      ok: true,
    });
    assert.equal(favorites.size, 1);
    assert.deepEqual(
      (queries[1] as { where: unknown }).where,
      { userId_productId: { userId: "buyer-one", productId: "product-1" } },
    );

    assert.deepEqual(await removeFavorite(buyerOne, "product-1", database), {
      ok: true,
    });
    assert.deepEqual(await removeFavorite(buyerOne, "product-1", database), {
      ok: true,
    });
    assert.equal(favorites.size, 0);
  });

  it("rejects unpublished, unavailable, and malformed product identifiers", async () => {
    const { database, queries } = createDatabase();
    assert.deepEqual(await addFavorite(buyerOne, "not-published", database), {
      ok: false,
      code: "unavailable",
    });
    assert.deepEqual(await addFavorite(buyerOne, "invalid id", database), {
      ok: false,
      code: "invalid",
    });
    assert.equal(queries.length, 1);
  });
});
