BEGIN;

ALTER TABLE "Product"
ADD COLUMN "priceReferenceConsentAt" TIMESTAMP(3);

CREATE TABLE "ProductPriceChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "oldPriceCOP" INTEGER NOT NULL,
    "newPriceCOP" INTEGER NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(120) NOT NULL,

    CONSTRAINT "ProductPriceChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductPriceChange_price_check" CHECK (
        "oldPriceCOP" > 0 AND "newPriceCOP" > 0 AND "oldPriceCOP" <> "newPriceCOP"
    )
);

CREATE INDEX "ProductPriceChange_productId_appliedAt_idx"
ON "ProductPriceChange"("productId", "appliedAt");
CREATE INDEX "ProductPriceChange_actorId_appliedAt_idx"
ON "ProductPriceChange"("actorId", "appliedAt");

ALTER TABLE "ProductPriceChange"
ADD CONSTRAINT "ProductPriceChange_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPriceChange"
ADD CONSTRAINT "ProductPriceChange_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
