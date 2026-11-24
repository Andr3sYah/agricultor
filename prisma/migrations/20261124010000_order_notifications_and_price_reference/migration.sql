CREATE TYPE "OrderNotificationType" AS ENUM (
    'REQUEST_CREATED',
    'REQUEST_ACCEPTED',
    'REQUEST_REJECTED'
);

CREATE TYPE "OrderNotificationStatus" AS ENUM (
    'PENDING',
    'SENDING',
    'SENT',
    'RETRY',
    'FAILED',
    'UNKNOWN'
);

ALTER TABLE "Product"
ADD COLUMN "priceReferenceEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "OrderNotification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderNotificationType" NOT NULL,
    "status" "OrderNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderNotification_attempts_check" CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "OrderNotification_orderId_type_key"
ON "OrderNotification"("orderId", "type");
CREATE INDEX "OrderNotification_status_nextAttemptAt_idx"
ON "OrderNotification"("status", "nextAttemptAt");

ALTER TABLE "OrderNotification"
ADD CONSTRAINT "OrderNotification_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
