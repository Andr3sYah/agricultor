ALTER TABLE "SellerProfile"
ADD COLUMN "exactLocation" VARCHAR(240),
ADD COLUMN "exactLocationPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "exactLocationConsentAt" TIMESTAMP(3);
