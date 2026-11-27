ALTER TABLE "SellerProfile"
ADD COLUMN "neighborhood" VARCHAR(100),
ADD COLUMN "publicContactConsentAt" TIMESTAMP(3);

UPDATE "Product"
SET "isPublished" = false
WHERE "isPublished" = true;
