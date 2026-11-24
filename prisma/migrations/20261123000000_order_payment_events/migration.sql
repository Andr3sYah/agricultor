CREATE TABLE "OrderPaymentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "provider" VARCHAR(16) NOT NULL CHECK ("provider" IN ('MANUAL', 'WOMPI')),
    "method" VARCHAR(16) NOT NULL CHECK ("method" IN ('TRANSFER', 'ON_DELIVERY', 'WOMPI')),
    "externalReference" VARCHAR(120),
    "amountCOP" BIGINT NOT NULL CHECK ("amountCOP" >= 0),
    "currency" CHAR(3) NOT NULL DEFAULT 'COP' CHECK ("currency" = 'COP'),
    "status" VARCHAR(16) NOT NULL CHECK ("status" IN ('CONFIRMED')),
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderPaymentEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderPaymentEvent_orderId_idempotencyKey_key" UNIQUE ("orderId", "idempotencyKey")
);

CREATE INDEX "OrderPaymentEvent_orderId_createdAt_idx"
    ON "OrderPaymentEvent"("orderId", "createdAt");

INSERT INTO "OrderPaymentEvent"
    ("id", "orderId", "actorId", "provider", "method", "amountCOP", "currency", "status", "idempotencyKey", "createdAt")
SELECT
    'legacy-' || receipt."orderId",
    receipt."orderId",
    order_record."producerId",
    CASE WHEN receipt."method" = 'WOMPI' THEN 'WOMPI' ELSE 'MANUAL' END,
    receipt."method",
    receipt."amountCOP",
    'COP',
    'CONFIRMED',
    'manual-confirm:' || receipt."orderId",
    receipt."confirmedAt"
FROM "OrderPaymentReceipt" receipt
JOIN "Order" order_record ON order_record."id" = receipt."orderId"
ON CONFLICT ("orderId", "idempotencyKey") DO NOTHING;
