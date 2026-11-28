import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { getProducerDashboardSummary } from "./producer-dashboard";

type DashboardDatabase = Pick<PrismaClient, "$queryRaw">;

const counts = {
  totalProducts: BigInt(3),
  publishedProducts: BigInt(2),
  soldOutProducts: BigInt(1),
  pendingOrders: BigInt(4),
  acceptedOrders: BigInt(2),
  rejectedOrders: BigInt(1),
};

function databaseWith(
  onQuery: (values: unknown[]) => void = () => {},
): DashboardDatabase {
  return {
    $queryRaw: async <T>(
      _query: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      onQuery(values);
      return [counts] as T;
    },
  } as unknown as DashboardDatabase;
}

describe("producer dashboard summary", () => {
  it("uses one aggregate query scoped to the signed-in producer", async () => {
    const queryValues: unknown[][] = [];
    const summary = await getProducerDashboardSummary(
      { userId: "producer-1", roles: ["PRODUCER"] },
      databaseWith((values) => queryValues.push(values)),
    );

    assert.ok(summary);
    assert.deepEqual(queryValues, [["producer-1", "producer-1"]]);
    assert.deepEqual(summary, {
      products: { published: 2, soldOut: 1, total: 3 },
      orders: { PENDING: 4, ACCEPTED: 2, REJECTED: 1 },
      hasProducts: true,
      hasOrders: true,
    });
  });

  it("returns empty states when the producer has no products or orders", async () => {
    const summary = await getProducerDashboardSummary(
      { userId: "producer-1", roles: ["PRODUCER"] },
      {
        $queryRaw: async <T>() =>
          [{
            totalProducts: BigInt(0),
            publishedProducts: BigInt(0),
            soldOutProducts: BigInt(0),
            pendingOrders: BigInt(0),
            acceptedOrders: BigInt(0),
            rejectedOrders: BigInt(0),
          }] as T,
      } as unknown as DashboardDatabase,
    );

    assert.deepEqual(summary, {
      products: { published: 0, soldOut: 0, total: 0 },
      orders: { PENDING: 0, ACCEPTED: 0, REJECTED: 0 },
      hasProducts: false,
      hasOrders: false,
    });
  });

  it("does not query dashboard data for a non-producer", async () => {
    let queries = 0;
    const summary = await getProducerDashboardSummary(
      { userId: "buyer-1", roles: ["BUYER"] },
      databaseWith(() => {
        queries += 1;
      }),
    );

    assert.equal(summary, null);
    assert.equal(queries, 0);
  });
});
